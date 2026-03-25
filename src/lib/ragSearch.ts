/**
 * RAG search module for FSNB-2022 reference data.
 *
 * Provides hybrid (vector + full-text) search over fsnb_resources and fsnb_norms,
 * exact GOST lookup, norm composition retrieval, and tech-group scoped queries.
 */

import { supabase } from '../lib/supabase';
import { callEmbeddingApi } from '../lib/llm';
import type {
  FsnbSearchResult,
  FsnbNormSearchResult,
  FsnbResourceType,
  FsnbBaseType,
} from '../types/fsnb';

// ── Embedding helpers ───────────────────────────────────────────

/**
 * Получить эмбеддинг для одного текста.
 */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await callEmbeddingApi({ texts: [text] });
  return embedding;
}

/**
 * Пакетное получение эмбеддингов (для массового импорта).
 *
 * @param texts      — массив текстов
 * @param batchSize  — размер пакета (по умолчанию 50)
 * @param onProgress — колбэк прогресса (обработано, всего)
 */
export async function embedBatch(
  texts: string[],
  batchSize = 50,
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const results: number[][] = [];
  const total = texts.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await callEmbeddingApi({ texts: batch });
    results.push(...embeddings);

    onProgress?.(Math.min(i + batchSize, total), total);

    // Задержка между пакетами, чтобы не упереться в rate-limit
    if (i + batchSize < total) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

// ── Hybrid search: resources ────────────────────────────────────

/**
 * Гибридный поиск ресурсов ФСНБ (вектор + полнотекст).
 *
 * Вызывает SQL-функцию `hybrid_search_resources` в Supabase.
 */
export async function searchResources(
  query: string,
  opts?: {
    resourceType?: string;
    limit?: number;
  },
): Promise<FsnbSearchResult[]> {
  const { resourceType, limit = 20 } = opts ?? {};

  const queryEmbedding = await embedText(query);

  const { data, error } = await supabase.rpc('hybrid_search_resources', {
    query_embedding: queryEmbedding,
    query_text: query,
    resource_type_filter: resourceType ?? null,
    match_limit: limit,
  });

  if (error) {
    throw new Error(`hybrid_search_resources failed: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    measure_unit: string | null;
    resource_type: FsnbResourceType;
    score: number;
  }>).map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    measure_unit: row.measure_unit,
    resource_type: row.resource_type,
    score: row.score,
  }));
}

// ── Exact GOST lookup ───────────────────────────────────────────

/**
 * Поиск ресурсов по точному коду ГОСТ (содержимое массива `gost_refs`).
 */
export async function searchByGost(gostCode: string): Promise<FsnbSearchResult[]> {
  const { data, error } = await supabase
    .from('fsnb_resources')
    .select('id, code, name, measure_unit, resource_type')
    .contains('gost_refs', [gostCode]);

  if (error) {
    throw new Error(`searchByGost failed: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    measure_unit: string | null;
    resource_type: FsnbResourceType;
  }>).map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    measure_unit: row.measure_unit,
    resource_type: row.resource_type,
    score: 1, // точное совпадение по ГОСТ
  }));
}

// ── Hybrid search: norms ────────────────────────────────────────

/**
 * Гибридный поиск норм ФСНБ (ГЭСН и т.д.).
 *
 * Вызывает SQL-функцию `hybrid_search_norms`.
 */
export async function searchNorms(
  query: string,
  opts?: {
    baseType?: string;
    workCategory?: string;
    limit?: number;
  },
): Promise<FsnbNormSearchResult[]> {
  const { baseType, workCategory, limit = 20 } = opts ?? {};

  const queryEmbedding = await embedText(query);

  const { data, error } = await supabase.rpc('hybrid_search_norms', {
    query_embedding: queryEmbedding,
    query_text: query,
    base_type_filter: baseType ?? null,
    category_filter: workCategory ?? null,
    match_limit: limit,
  });

  if (error) {
    throw new Error(`hybrid_search_norms failed: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    id: string;
    norm_code: string;
    name: string;
    measure_unit: string;
    base_type: FsnbBaseType;
    work_category: string | null;
    score: number;
  }>).map(row => ({
    id: row.id,
    norm_code: row.norm_code,
    name: row.name,
    measure_unit: row.measure_unit,
    base_type: row.base_type,
    work_category: row.work_category,
    score: row.score,
  }));
}

// ── Norm composition ────────────────────────────────────────────

export interface NormCompositionRow {
  resource_code: string;
  resource_name: string | null;
  resource_type: string | null;
  consumption: number | null;
  measure_unit: string | null;
}

/**
 * Получить ресурсный состав нормы (строки из fsnb_norm_resources).
 */
export async function getNormComposition(normId: string): Promise<NormCompositionRow[]> {
  const { data, error } = await supabase
    .from('fsnb_norm_resources')
    .select('resource_code, resource_name, resource_type, consumption, measure_unit')
    .eq('norm_id', normId);

  if (error) {
    throw new Error(`getNormComposition failed: ${error.message}`);
  }

  return (data ?? []) as NormCompositionRow[];
}

// ── Allowed resources via tech-groups ───────────────────────────

export interface AllowedTgGroup {
  tg_id: string;
  tg_code: string;
  resources: FsnbSearchResult[];
}

/**
 * Получить допустимые ресурсы из технических групп, привязанных к норме.
 *
 * Путь: fsnb_norm_tech_groups (norm_id) -> fsnb_tg_resources (tg_id) -> fsnb_resources.
 */
export async function getAllowedResources(normId: string): Promise<AllowedTgGroup[]> {
  // 1. Получить техгруппы нормы
  const { data: ntgData, error: ntgError } = await supabase
    .from('fsnb_norm_tech_groups')
    .select('tg_id')
    .eq('norm_id', normId);

  if (ntgError) {
    throw new Error(`getAllowedResources (norm_tech_groups) failed: ${ntgError.message}`);
  }

  const tgIds = [...new Set((ntgData ?? []).map(r => r.tg_id as string))];
  if (tgIds.length === 0) return [];

  // 2. Получить метаданные техгрупп
  const { data: tgData, error: tgError } = await supabase
    .from('fsnb_tech_groups')
    .select('id, tg_code')
    .in('id', tgIds);

  if (tgError) {
    throw new Error(`getAllowedResources (tech_groups) failed: ${tgError.message}`);
  }

  const tgMap = new Map<string, string>();
  for (const tg of tgData ?? []) {
    tgMap.set(tg.id as string, tg.tg_code as string);
  }

  // 3. Получить ресурсы через tg_resources
  const { data: tgrData, error: tgrError } = await supabase
    .from('fsnb_tg_resources')
    .select('tg_id, resource_id')
    .in('tg_id', tgIds);

  if (tgrError) {
    throw new Error(`getAllowedResources (tg_resources) failed: ${tgrError.message}`);
  }

  // Группировка resource_id по tg_id
  const tgResourceIds = new Map<string, string[]>();
  const allResourceIds: string[] = [];

  for (const row of tgrData ?? []) {
    const tgId = row.tg_id as string;
    const resId = row.resource_id as string | null;
    if (!resId) continue;

    if (!tgResourceIds.has(tgId)) {
      tgResourceIds.set(tgId, []);
    }
    tgResourceIds.get(tgId)!.push(resId);
    allResourceIds.push(resId);
  }

  if (allResourceIds.length === 0) {
    return tgIds.map(tgId => ({
      tg_id: tgId,
      tg_code: tgMap.get(tgId) ?? '',
      resources: [],
    }));
  }

  // 4. Подгрузить сами ресурсы (пачками по 500, если много)
  const uniqueResourceIds = [...new Set(allResourceIds)];
  const resourceMap = new Map<string, FsnbSearchResult>();

  const CHUNK = 500;
  for (let i = 0; i < uniqueResourceIds.length; i += CHUNK) {
    const chunk = uniqueResourceIds.slice(i, i + CHUNK);

    const { data: resData, error: resError } = await supabase
      .from('fsnb_resources')
      .select('id, code, name, measure_unit, resource_type')
      .in('id', chunk);

    if (resError) {
      throw new Error(`getAllowedResources (resources) failed: ${resError.message}`);
    }

    for (const r of resData ?? []) {
      resourceMap.set(r.id as string, {
        id: r.id as string,
        code: r.code as string,
        name: r.name as string,
        measure_unit: r.measure_unit as string | null,
        resource_type: r.resource_type as FsnbResourceType,
        score: 1,
      });
    }
  }

  // 5. Собрать результат по группам
  return tgIds.map(tgId => ({
    tg_id: tgId,
    tg_code: tgMap.get(tgId) ?? '',
    resources: (tgResourceIds.get(tgId) ?? [])
      .map(rid => resourceMap.get(rid))
      .filter((r): r is FsnbSearchResult => r !== undefined),
  }));
}

// ── Search within a specific tech-group ─────────────────────────

/**
 * Поиск ресурсов внутри конкретной технической группы.
 *
 * Стратегия: получаем ID ресурсов техгруппы, затем выполняем
 * векторный поиск только среди них (фильтрация на клиенте).
 */
export async function searchWithinTg(
  tgId: string,
  query: string,
  limit = 20,
): Promise<FsnbSearchResult[]> {
  // 1. Получить resource_id из техгруппы
  const { data: tgrData, error: tgrError } = await supabase
    .from('fsnb_tg_resources')
    .select('resource_id')
    .eq('tg_id', tgId);

  if (tgrError) {
    throw new Error(`searchWithinTg (tg_resources) failed: ${tgrError.message}`);
  }

  const resourceIds = (tgrData ?? [])
    .map(r => r.resource_id as string | null)
    .filter((id): id is string => id !== null);

  if (resourceIds.length === 0) return [];

  // 2. Получить эмбеддинг запроса
  const queryEmbedding = await embedText(query);

  // 3. Гибридный поиск по всему пулу с увеличенным лимитом для последующей фильтрации
  const broadLimit = Math.max(limit * 5, 100);

  const { data, error } = await supabase.rpc('hybrid_search_resources', {
    query_embedding: queryEmbedding,
    query_text: query,
    resource_type_filter: null,
    match_limit: broadLimit,
  });

  if (error) {
    throw new Error(`searchWithinTg (hybrid_search) failed: ${error.message}`);
  }

  // 4. Фильтруем результаты — оставляем только ресурсы из техгруппы
  const allowedSet = new Set(resourceIds);

  return ((data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    measure_unit: string | null;
    resource_type: FsnbResourceType;
    score: number;
  }>)
    .filter(row => allowedSet.has(row.id))
    .slice(0, limit)
    .map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      measure_unit: row.measure_unit,
      resource_type: row.resource_type,
      score: row.score,
    }));
}
