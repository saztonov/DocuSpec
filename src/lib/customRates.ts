/**
 * CRUD-операции для пользовательского справочника «Новые расценки» (custom_rates).
 *
 * Расценки распределяются по тем же категориям/видам затрат, что и старые
 * корпоративные (imported_rate_categories / imported_rate_types).
 */

import { supabase } from './supabase';
import type {
  CustomRate,
  CustomRateRow,
  DraftRow,
  BatchCreateResult,
} from '../types/customRates';

// ── Загрузка списка с фильтрами ─────────────────────────────────

export interface LoadCustomRatesParams {
  categoryId?: string | null;
  typeId?: string | null;
  sourceKind?: 'fsnb' | 'imported' | 'custom' | null;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function loadCustomRates(
  params: LoadCustomRatesParams = {},
): Promise<{ rows: CustomRateRow[]; total: number }> {
  const { categoryId, typeId, sourceKind, search, limit = 50, offset = 0 } = params;

  let q = supabase
    .from('custom_rates')
    .select(
      'id, type_id, work_name, unit, source_kind, source_id, source_code, comment, created_at, updated_at, ' +
        'imported_rate_types!inner(id, name, category_id, imported_rate_categories!inner(id, name))',
      { count: 'exact' },
    );

  if (typeId) {
    q = q.eq('type_id', typeId);
  } else if (categoryId) {
    q = q.eq('imported_rate_types.category_id', categoryId);
  }
  if (sourceKind) {
    q = q.eq('source_kind', sourceKind);
  }
  if (search && search.trim()) {
    q = q.ilike('work_name', `%${search.trim()}%`);
  }

  q = q.order('work_name').range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  const rows: CustomRateRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    type_id: r.type_id,
    work_name: r.work_name,
    unit: r.unit,
    source_kind: r.source_kind,
    source_id: r.source_id,
    source_code: r.source_code,
    comment: r.comment,
    created_at: r.created_at,
    updated_at: r.updated_at,
    type_name: r.imported_rate_types?.name ?? '',
    category_id: r.imported_rate_types?.category_id ?? '',
    category_name: r.imported_rate_types?.imported_rate_categories?.name ?? '',
  }));

  return { rows, total: count ?? 0 };
}

// ── Создание / удаление ─────────────────────────────────────────

export async function deleteCustomRate(id: string): Promise<void> {
  const { error } = await supabase.from('custom_rates').delete().eq('id', id);
  if (error) throw error;
}

export async function updateCustomRate(
  id: string,
  patch: { work_name?: string; unit?: string | null; type_id?: string; comment?: string | null },
): Promise<void> {
  const { error } = await supabase.from('custom_rates').update(patch).eq('id', id);
  if (error) throw error;
}

// ── Проверка дубликатов ─────────────────────────────────────────

/**
 * Загружает множество (source_kind + source_id) уже сохранённых расценок.
 * Используется для определения состояния `already_in_db` карточки-кандидата.
 */
export async function loadExistingSourceKeys(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('custom_rates')
    .select('source_kind, source_id')
    .not('source_id', 'is', null);

  if (error) throw error;

  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ source_kind: string; source_id: string | null }>) {
    if (row.source_id) {
      set.add(`${row.source_kind}:${row.source_id}`);
    }
  }
  return set;
}

// ── Batch-сохранение из корзины-черновика ───────────────────────

/**
 * Пакетное сохранение строк из корзины-черновика.
 * Каждая строка вставляется отдельно (не одним insert), чтобы дубликат
 * по unique constraint не сорвал всю операцию.
 *
 * Возвращает три массива: успешные, дубликаты, ошибки.
 */
export async function batchCreateCustomRates(
  rows: DraftRow[],
): Promise<BatchCreateResult> {
  const result: BatchCreateResult = {
    saved: [],
    duplicates: [],
    errors: [],
  };

  for (const row of rows) {
    if (!row.typeId || !row.workName.trim()) {
      result.errors.push({
        rowId: row.rowId,
        message: 'Не заполнены обязательные поля (вид затрат, наименование)',
      });
      continue;
    }

    const payload = {
      type_id: row.typeId,
      work_name: row.workName.trim(),
      unit: row.unit?.trim() || null,
      source_kind: row.source,
      source_id: row.sourceId,
      source_code: row.sourceCode,
      comment: null as string | null,
    };

    const { data, error } = await supabase
      .from('custom_rates')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      // 23505 — unique_violation в Postgres
      const isUnique =
        (error.code === '23505') ||
        /duplicate key|unique constraint/i.test(error.message ?? '');
      if (isUnique) {
        result.duplicates.push({ rowId: row.rowId });
      } else {
        result.errors.push({
          rowId: row.rowId,
          message: error.message ?? String(error),
        });
      }
      continue;
    }

    result.saved.push({ rowId: row.rowId, id: (data as { id: string }).id });
  }

  return result;
}

// ── Минимальный снимок для кэша ─────────────────────────────────

/**
 * Загружает все custom_rates в виде «лёгких» объектов для кэша
 * (используется при инициализации rateContextCache).
 */
export async function loadCustomRatesSnapshot(): Promise<CustomRate[]> {
  const { data, error } = await supabase
    .from('custom_rates')
    .select('id, type_id, work_name, unit, source_kind, source_id, source_code, comment, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as CustomRate[];
}
