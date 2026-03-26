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

// ── Session-level flag: skip hybrid search if it keeps timing out ──
let hybridSearchDisabled = false;
let hybridFailCount = 0;
const HYBRID_FAIL_THRESHOLD = 2; // после 2 таймаутов — отключаем на сессию

function markHybridFailed() {
  hybridFailCount++;
  if (hybridFailCount >= HYBRID_FAIL_THRESHOLD) {
    hybridSearchDisabled = true;
    console.warn(`[ragSearch] Hybrid search отключён на сессию (${hybridFailCount} таймаутов). Только FTS.`);
  }
}

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

// ── FTS-only fallback ──────────────────────────────────────────

/**
 * Построить FTS-запрос: сначала AND по ключевым словам (>3 букв),
 * если слов мало — OR. Это даёт релевантность без пустых результатов.
 */
function buildFtsQuery(query: string): string {
  const words = query
    .replace(/[^\wа-яёА-ЯЁ\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  if (words.length === 0) return query;
  if (words.length <= 2) return words.join(' | ');
  // Берём 2-3 самых длинных слова (наиболее специфичные) через AND
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const topWords = sorted.slice(0, 3);
  return topWords.join(' & ');
}

/**
 * Полнотекстовый поиск ресурсов (без вектора) — fallback при timeout.
 */
async function ftsSearchResources(
  query: string,
  resourceType?: string,
  limit = 20,
): Promise<FsnbSearchResult[]> {
  const ftsQuery = buildFtsQuery(query);
  console.log(`[ragSearch] FTS ресурсов: "${ftsQuery}" (из "${query}")`);

  let q = supabase
    .from('fsnb_resources')
    .select('id, code, name, measure_unit, resource_type')
    .textSearch('search_text', ftsQuery, { type: 'plain', config: 'russian' })
    .limit(limit);

  if (resourceType) q = q.eq('resource_type', resourceType);

  const { data, error } = await q;

  // Если FTS не нашёл — пробуем ilike по первому слову
  if ((!data || data.length === 0) && !error) {
    const mainWord = query.split(/\s+/).sort((a, b) => b.length - a.length)[0];
    if (mainWord && mainWord.length > 3) {
      console.log(`[ragSearch] FTS пусто, пробуем ilike "%${mainWord}%"`);
      let q2 = supabase
        .from('fsnb_resources')
        .select('id, code, name, measure_unit, resource_type')
        .ilike('name', `%${mainWord}%`)
        .limit(limit);
      if (resourceType) q2 = q2.eq('resource_type', resourceType);
      const { data: d2 } = await q2;
      if (d2 && d2.length > 0) {
        return (d2 as Array<{
          id: string; code: string; name: string;
          measure_unit: string | null; resource_type: FsnbResourceType;
        }>).map((row, i) => ({
          id: row.id, code: row.code, name: row.name,
          measure_unit: row.measure_unit, resource_type: row.resource_type,
          score: 0.5 / (1 + i),
        }));
      }
    }
  }

  if (error) {
    console.error('[ragSearch] FTS ресурсов ошибка:', error.message);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string; code: string; name: string;
    measure_unit: string | null; resource_type: FsnbResourceType;
  }>).map((row, i) => ({
    id: row.id, code: row.code, name: row.name,
    measure_unit: row.measure_unit, resource_type: row.resource_type,
    score: 1 / (1 + i),
  }));
}

/**
 * Полнотекстовый поиск норм (без вектора) — fallback при timeout.
 */
async function ftsSearchNorms(
  query: string,
  baseType?: string,
  limit = 20,
): Promise<FsnbNormSearchResult[]> {
  const ftsQuery = buildFtsQuery(query);
  console.log(`[ragSearch] FTS норм: "${ftsQuery}" (из "${query}")`);

  let q = supabase
    .from('fsnb_norms')
    .select('id, norm_code, name, measure_unit, base_type, work_category')
    .textSearch('search_text', ftsQuery, { type: 'plain', config: 'russian' })
    .limit(limit);

  if (baseType) q = q.eq('base_type', baseType);

  const { data, error } = await q;

  // Если FTS не нашёл — пробуем ilike
  if ((!data || data.length === 0) && !error) {
    const mainWord = query.split(/\s+/).sort((a, b) => b.length - a.length)[0];
    if (mainWord && mainWord.length > 3) {
      console.log(`[ragSearch] FTS норм пусто, пробуем ilike "%${mainWord}%"`);
      let q2 = supabase
        .from('fsnb_norms')
        .select('id, norm_code, name, measure_unit, base_type, work_category')
        .ilike('name', `%${mainWord}%`)
        .limit(limit);
      if (baseType) q2 = q2.eq('base_type', baseType);
      const { data: d2 } = await q2;
      if (d2 && d2.length > 0) {
        return (d2 as Array<{
          id: string; norm_code: string; name: string;
          measure_unit: string; base_type: FsnbBaseType;
          work_category: string | null;
        }>).map((row, i) => ({
          id: row.id, norm_code: row.norm_code, name: row.name,
          measure_unit: row.measure_unit, base_type: row.base_type,
          work_category: row.work_category, score: 0.5 / (1 + i),
        }));
      }
    }
  }

  if (error) {
    console.error('[ragSearch] FTS норм ошибка:', error.message);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string; norm_code: string; name: string;
    measure_unit: string; base_type: FsnbBaseType;
    work_category: string | null;
  }>).map((row, i) => ({
    id: row.id, norm_code: row.norm_code, name: row.name,
    measure_unit: row.measure_unit, base_type: row.base_type,
    work_category: row.work_category, score: 1 / (1 + i),
  }));
}

// ── Hybrid search: resources ────────────────────────────────────

/**
 * Гибридный поиск ресурсов ФСНБ (вектор + полнотекст).
 * При timeout/ошибке автоматически переключается на FTS-only.
 * После 2 таймаутов — отключает hybrid на всю сессию.
 */
export async function searchResources(
  query: string,
  opts?: {
    resourceType?: string;
    limit?: number;
  },
): Promise<FsnbSearchResult[]> {
  const { resourceType, limit = 20 } = opts ?? {};

  // Если hybrid отключён — сразу FTS, без ожидания timeout
  if (hybridSearchDisabled) {
    return ftsSearchResources(query, resourceType, limit);
  }

  try {
    const queryEmbedding = await embedText(query);

    const { data, error } = await supabase.rpc('hybrid_search_resources', {
      query_embedding: queryEmbedding,
      query_text: query,
      resource_type_filter: resourceType ?? null,
      match_limit: limit,
    });

    if (error) {
      console.warn(`[ragSearch] hybrid_search_resources ошибка: ${error.message}`);
      markHybridFailed();
      return ftsSearchResources(query, resourceType, limit);
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
  } catch (e) {
    console.warn('[ragSearch] hybrid_search_resources exception, fallback на FTS:', e);
    markHybridFailed();
    return ftsSearchResources(query, resourceType, limit);
  }
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
  const { baseType, limit = 20 } = opts ?? {};

  // Если hybrid отключён — сразу FTS
  if (hybridSearchDisabled) {
    return ftsSearchNorms(query, baseType, limit);
  }

  try {
    const queryEmbedding = await embedText(query);

    const { data, error } = await supabase.rpc('hybrid_search_norms', {
      query_embedding: queryEmbedding,
      query_text: query,
      base_type_filter: baseType ?? null,
      category_filter: null,
      match_limit: limit,
    });

    if (error) {
      console.warn(`[ragSearch] hybrid_search_norms ошибка: ${error.message}`);
      markHybridFailed();
      return ftsSearchNorms(query, baseType, limit);
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
  } catch (e) {
    console.warn('[ragSearch] hybrid_search_norms exception, fallback на FTS:', e);
    markHybridFailed();
    return ftsSearchNorms(query, baseType, limit);
  }
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
  const allowedSet = new Set(resourceIds);

  try {
    const { data, error } = await supabase.rpc('hybrid_search_resources', {
      query_embedding: queryEmbedding,
      query_text: query,
      resource_type_filter: null,
      match_limit: broadLimit,
    });

    if (error) {
      console.warn(`[ragSearch] searchWithinTg hybrid ошибка: ${error.message}`);
      // Fallback: FTS среди ресурсов ТГ напрямую
      const ftsResults = await ftsSearchResources(query, undefined, broadLimit);
      return ftsResults.filter(r => allowedSet.has(r.id)).slice(0, limit);
    }

    return ((data ?? []) as Array<{
      id: string; code: string; name: string;
      measure_unit: string | null; resource_type: FsnbResourceType;
      score: number;
    }>)
      .filter(row => allowedSet.has(row.id))
      .slice(0, limit)
      .map(row => ({
        id: row.id, code: row.code, name: row.name,
        measure_unit: row.measure_unit, resource_type: row.resource_type,
        score: row.score,
      }));
  } catch (e) {
    console.warn('[ragSearch] searchWithinTg exception, fallback на FTS:', e);
    const ftsResults = await ftsSearchResources(query, undefined, broadLimit);
    return ftsResults.filter(r => allowedSet.has(r.id)).slice(0, limit);
  }
}
