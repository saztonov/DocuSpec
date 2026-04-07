/**
 * Тонкие хелперы поверх ragSearch.ts для UI-обозревателя ФСНБ.
 *
 * Используется только страницей «Расценки» (lite-режим). Никакой бизнес-логики
 * здесь не дублируется — только запросы метаданных, иерархии и обратных ссылок.
 */

import { supabase } from './supabase';
import type {
  DbFsnbCollection,
  FsnbResourceType,
  FsnbBaseType,
} from '../types/fsnb';

// ── Сборники ─────────────────────────────────────────────────────

export interface FsnbCollectionInfo {
  id: string;
  code: string;
  name: string;
  base_type: string;
  record_count: number;
}

/** Список всех импортированных сборников ФСНБ. */
export async function listCollections(): Promise<FsnbCollectionInfo[]> {
  const { data, error } = await supabase
    .from('fsnb_collections')
    .select('id, code, name, base_type, record_count')
    .order('code');

  if (error) {
    console.error('[fsnbExplorer] listCollections:', error.message);
    return [];
  }
  return (data ?? []) as FsnbCollectionInfo[];
}

// ── Хлебные крошки ───────────────────────────────────────────────

export interface NormBreadcrumbs {
  id: string;
  norm_code: string;
  name: string;
  measure_unit: string;
  base_type: FsnbBaseType;
  collection_code: string | null;
  collection_name: string | null;
  division_code: string | null;
  division_name: string | null;
  table_code: string | null;
  table_name: string | null;
  work_category: string | null;
}

export async function getNormBreadcrumbs(
  normId: string,
): Promise<NormBreadcrumbs | null> {
  const { data, error } = await supabase
    .from('fsnb_norms')
    .select(
      'id, norm_code, name, measure_unit, base_type, collection_code, collection_name, division_code, division_name, table_code, table_name, work_category',
    )
    .eq('id', normId)
    .maybeSingle();

  if (error) {
    console.error('[fsnbExplorer] getNormBreadcrumbs:', error.message);
    return null;
  }
  return (data as NormBreadcrumbs) ?? null;
}

export interface ResourceBreadcrumbs {
  id: string;
  code: string;
  name: string;
  measure_unit: string | null;
  resource_type: FsnbResourceType;
  book_code: string | null;
  book_name: string | null;
  part_code: string | null;
  part_name: string | null;
  section_code: string | null;
  section_name: string | null;
  group_code: string | null;
  group_name: string | null;
  base_price: number | null;
  opt_price: number | null;
  salary_mach: number | null;
  labour_mach: number | null;
  price_without_salary: number | null;
  machinist_category: number | null;
  gost_refs: string[] | null;
}

export async function getResourceBreadcrumbs(
  resourceId: string,
): Promise<ResourceBreadcrumbs | null> {
  const { data, error } = await supabase
    .from('fsnb_resources')
    .select(
      'id, code, name, measure_unit, resource_type, book_code, book_name, part_code, part_name, section_code, section_name, group_code, group_name, base_price, opt_price, salary_mach, labour_mach, price_without_salary, machinist_category, gost_refs',
    )
    .eq('id', resourceId)
    .maybeSingle();

  if (error) {
    console.error('[fsnbExplorer] getResourceBreadcrumbs:', error.message);
    return null;
  }
  return (data as ResourceBreadcrumbs) ?? null;
}

// ── Обратные ссылки: ресурс → нормы ──────────────────────────────

export interface ResourceUsageRow {
  norm_id: string;
  norm_code: string;
  norm_name: string;
  base_type: FsnbBaseType;
  consumption: number | null;
  measure_unit: string | null;
}

/**
 * Список норм, в которых используется данный ресурс.
 * Принимает либо UUID ресурса, либо его code.
 */
export async function getResourceUsage(
  resourceIdOrCode: string,
  limit = 50,
): Promise<ResourceUsageRow[]> {
  // 1. Узнаём resource_code: если передан UUID — резолвим, иначе используем как код.
  let resourceCode = resourceIdOrCode;
  const looksLikeUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      resourceIdOrCode,
    );

  if (looksLikeUuid) {
    const { data: r } = await supabase
      .from('fsnb_resources')
      .select('code')
      .eq('id', resourceIdOrCode)
      .maybeSingle();
    if (!r) return [];
    resourceCode = r.code as string;
  }

  // 2. Поиск всех строк fsnb_norm_resources с этим кодом.
  const { data: nrData, error: nrError } = await supabase
    .from('fsnb_norm_resources')
    .select('norm_id, consumption, measure_unit')
    .eq('resource_code', resourceCode)
    .limit(limit);

  if (nrError) {
    console.error('[fsnbExplorer] getResourceUsage (nr):', nrError.message);
    return [];
  }

  const normIds = [
    ...new Set((nrData ?? []).map(r => r.norm_id as string).filter(Boolean)),
  ];
  if (normIds.length === 0) return [];

  // 3. Метаданные норм одним батчем.
  const { data: normsData, error: normsError } = await supabase
    .from('fsnb_norms')
    .select('id, norm_code, name, base_type')
    .in('id', normIds);

  if (normsError) {
    console.error('[fsnbExplorer] getResourceUsage (norms):', normsError.message);
    return [];
  }

  const normMap = new Map<
    string,
    { norm_code: string; name: string; base_type: FsnbBaseType }
  >();
  for (const n of normsData ?? []) {
    normMap.set(n.id as string, {
      norm_code: n.norm_code as string,
      name: n.name as string,
      base_type: n.base_type as FsnbBaseType,
    });
  }

  // 4. Сборка результата.
  const result: ResourceUsageRow[] = [];
  for (const row of nrData ?? []) {
    const meta = normMap.get(row.norm_id as string);
    if (!meta) continue;
    result.push({
      norm_id: row.norm_id as string,
      norm_code: meta.norm_code,
      norm_name: meta.name,
      base_type: meta.base_type,
      consumption: row.consumption as number | null,
      measure_unit: row.measure_unit as string | null,
    });
  }
  return result;
}

// ── Дерево сборников и техгрупп ──────────────────────────────────

export type TreeLevel =
  | 'collections-root'
  | 'collection'
  | 'division'
  | 'table'
  | 'tg-root'
  | 'tg-group';

export interface TreeNode {
  key: string;
  title: string;
  level: TreeLevel | 'norm' | 'tg-resource';
  isLeaf: boolean;
  // Контекст для последующих запросов
  collection_id?: string | null;
  collection_code?: string | null;
  division_code?: string | null;
  table_code?: string | null;
  norm_id?: string;
  tg_id?: string;
  resource_id?: string;
}

/**
 * Ленивая подгрузка детей дерева ФСНБ.
 *
 * level — уровень родителя; функция вернёт его прямых детей.
 */
export async function getTreeChildren(
  level: TreeLevel,
  parent: {
    collection_id?: string | null;
    collection_code?: string | null;
    division_code?: string | null;
    table_code?: string | null;
    tg_id?: string;
  } = {},
): Promise<TreeNode[]> {
  switch (level) {
    case 'collections-root': {
      // Корневые сборники
      const collections = await listCollections();
      return collections.map(c => ({
        key: `col:${c.id}`,
        title: `${c.code} — ${c.name}`,
        level: 'collection' as const,
        isLeaf: false,
        collection_id: c.id,
        collection_code: c.code,
      }));
    }

    case 'collection': {
      // Разделы внутри сборника — через RPC (DISTINCT на сервере + composite index).
      const { data, error } = await supabase.rpc('fsnb_collection_divisions', {
        p_collection_id: parent.collection_id,
      });
      if (error) {
        console.error('[fsnbExplorer] tree division:', error.message);
        return [];
      }
      return ((data ?? []) as Array<{ division_code: string; division_name: string | null }>)
        .map(row => ({
          key: `div:${parent.collection_id}:${row.division_code}`,
          title: `${row.division_code} — ${row.division_name ?? ''}`,
          level: 'division' as const,
          isLeaf: false,
          collection_id: parent.collection_id,
          collection_code: parent.collection_code,
          division_code: row.division_code,
        }));
    }

    case 'division': {
      // Таблицы внутри раздела — через RPC.
      const { data, error } = await supabase.rpc('fsnb_division_tables', {
        p_collection_id: parent.collection_id,
        p_division_code: parent.division_code,
      });
      if (error) {
        console.error('[fsnbExplorer] tree table:', error.message);
        return [];
      }
      return ((data ?? []) as Array<{ table_code: string; table_name: string | null }>)
        .map(row => ({
          key: `tbl:${parent.collection_id}:${parent.division_code}:${row.table_code}`,
          title: `${row.table_code} — ${row.table_name ?? ''}`,
          level: 'table' as const,
          isLeaf: false,
          collection_id: parent.collection_id,
          collection_code: parent.collection_code,
          division_code: parent.division_code,
          table_code: row.table_code,
        }));
    }

    case 'table': {
      // Конкретные нормы в таблице — через RPC.
      const { data, error } = await supabase.rpc('fsnb_table_norms', {
        p_collection_id: parent.collection_id,
        p_division_code: parent.division_code,
        p_table_code: parent.table_code,
      });
      if (error) {
        console.error('[fsnbExplorer] tree norms:', error.message);
        return [];
      }
      return ((data ?? []) as Array<{ id: string; norm_code: string; name: string }>)
        .map(n => ({
          key: `norm:${n.id}`,
          title: `${n.norm_code} — ${n.name}`,
          level: 'norm' as const,
          isLeaf: true,
          norm_id: n.id,
        }));
    }

    case 'tg-root': {
      // Все техгруппы
      const { data, error } = await supabase
        .from('fsnb_tech_groups')
        .select('id, tg_code, tg_name, resource_count')
        .order('tg_code')
        .limit(2000);

      if (error) {
        console.error('[fsnbExplorer] tree tg:', error.message);
        return [];
      }
      return (data ?? []).map(g => ({
        key: `tg:${g.id}`,
        title: `${g.tg_code} — ${g.tg_name ?? '—'} (${g.resource_count ?? 0})`,
        level: 'tg-group' as const,
        isLeaf: false,
        tg_id: g.id as string,
      }));
    }

    case 'tg-group': {
      // Ресурсы внутри техгруппы
      const { data: tgrData, error: tgrError } = await supabase
        .from('fsnb_tg_resources')
        .select('resource_id')
        .eq('tg_id', parent.tg_id ?? '')
        .limit(500);

      if (tgrError) {
        console.error('[fsnbExplorer] tree tg-resources:', tgrError.message);
        return [];
      }
      const ids = (tgrData ?? [])
        .map(r => r.resource_id as string | null)
        .filter((id): id is string => !!id);
      if (ids.length === 0) return [];

      const { data: resData, error: resError } = await supabase
        .from('fsnb_resources')
        .select('id, code, name')
        .in('id', ids);

      if (resError) {
        console.error('[fsnbExplorer] tree tg-res:', resError.message);
        return [];
      }
      return (resData ?? [])
        .sort((a, b) => (a.code as string).localeCompare(b.code as string))
        .map(r => ({
          key: `res:${r.id}`,
          title: `${r.code} — ${r.name}`,
          level: 'tg-resource' as const,
          isLeaf: true,
          resource_id: r.id as string,
        }));
    }

    default:
      return [];
  }
}

// ── Техгруппы ресурса (обратная связь) ───────────────────────────

export interface ResourceTgRow {
  tg_id: string;
  tg_code: string;
  tg_name: string | null;
}

export async function getResourceTechGroups(
  resourceId: string,
): Promise<ResourceTgRow[]> {
  const { data: tgrData, error: tgrError } = await supabase
    .from('fsnb_tg_resources')
    .select('tg_id')
    .eq('resource_id', resourceId);

  if (tgrError) {
    console.error('[fsnbExplorer] getResourceTechGroups (tgr):', tgrError.message);
    return [];
  }
  const tgIds = [...new Set((tgrData ?? []).map(r => r.tg_id as string))];
  if (tgIds.length === 0) return [];

  const { data, error } = await supabase
    .from('fsnb_tech_groups')
    .select('id, tg_code, tg_name')
    .in('id', tgIds);

  if (error) {
    console.error('[fsnbExplorer] getResourceTechGroups (tg):', error.message);
    return [];
  }
  return (data ?? []).map(t => ({
    tg_id: t.id as string,
    tg_code: t.tg_code as string,
    tg_name: t.tg_name as string | null,
  }));
}

// ── Soft-delete (контекстное меню дерева) ───────────────────────

/** Soft-delete одной нормы. Возвращает количество затронутых строк. */
export async function softDeleteNorm(normId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fsnb_soft_delete_norm', {
    p_norm_id: normId,
  });
  if (error) {
    console.error('[fsnbExplorer] softDeleteNorm:', error.message);
    throw new Error(error.message);
  }
  return (data as number) ?? 0;
}

/** Soft-delete всех норм подраздела (таблицы). */
export async function softDeleteTable(
  collectionId: string,
  divisionCode: string,
  tableCode: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('fsnb_soft_delete_table', {
    p_collection_id: collectionId,
    p_division_code: divisionCode,
    p_table_code: tableCode,
  });
  if (error) {
    console.error('[fsnbExplorer] softDeleteTable:', error.message);
    throw new Error(error.message);
  }
  return (data as number) ?? 0;
}

/** Soft-delete всех норм раздела. */
export async function softDeleteDivision(
  collectionId: string,
  divisionCode: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('fsnb_soft_delete_division', {
    p_collection_id: collectionId,
    p_division_code: divisionCode,
  });
  if (error) {
    console.error('[fsnbExplorer] softDeleteDivision:', error.message);
    throw new Error(error.message);
  }
  return (data as number) ?? 0;
}

// Re-export тип для удобства
export type { DbFsnbCollection };
