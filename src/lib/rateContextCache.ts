/**
 * Единый локальный кэш данных для вкладки «Новые расценки».
 *
 * Используется одновременно тремя слоями:
 *   1. Fuse.js (Поле A быстрого поиска) — индексирует fsnbNorms + importedRates по name/code.
 *   2. Стартовый контекст LLM (Поле B чат) — сериализуется в system-сообщение для агента
 *      RateRecommender.
 *   3. Tools агента (list_fsnb_norms_in_table, search_fsnb_fallback) — читают из массивов кэша.
 *
 * Загружается один раз за сессию браузера, затем переиспользуется. Принудительная
 * инвалидация — через invalidate().
 *
 * Жёсткое ограничение whitelist v2 встроено в слой загрузки: в кэш попадают только
 * fsnb_norms с is_selected=true. Никакие потребители кэша не могут случайно увидеть
 * нормы вне whitelist.
 */

import { supabase } from './supabase';
import { loadCustomRatesSnapshot } from './customRates';
import type {
  RateContextSnapshot,
  CachedFsnbNorm,
  CachedImportedRate,
  RateCategoryRef,
  RateTypeRef,
} from '../types/customRates';

/** Защитный лимит. При превышении suммарного количества предзагрузка отключается. */
export const FULL_INLINE_THRESHOLD = 15000;

let cachedSnapshot: RateContextSnapshot | null = null;
let inflight: Promise<RateContextSnapshot> | null = null;

/**
 * Получить текущий снимок. При первом вызове за сессию загружает данные из БД,
 * далее возвращает кэшированный объект. Повторные параллельные вызовы используют
 * один и тот же inflight-промис.
 */
export async function getRateContextSnapshot(): Promise<RateContextSnapshot> {
  if (cachedSnapshot) return cachedSnapshot;
  if (inflight) return inflight;

  inflight = loadFreshSnapshot()
    .then((snap) => {
      cachedSnapshot = snap;
      return snap;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Сбросить кэш — например, после batch INSERT новых custom_rates. */
export function invalidateRateContextCache(): void {
  cachedSnapshot = null;
  inflight = null;
}

/**
 * Точечное обновление массива customRates без перезагрузки всего снимка.
 * Используется после успешного batchCreate, чтобы быстро отразить новые записи
 * в кэше без сетевого запроса.
 */
export async function refreshCustomRatesInCache(): Promise<void> {
  if (!cachedSnapshot) return;
  const customRates = await loadCustomRatesSnapshot();
  cachedSnapshot = { ...cachedSnapshot, customRates };
}

// ── Внутренняя загрузка ─────────────────────────────────────────

async function loadFreshSnapshot(): Promise<RateContextSnapshot> {
  const [fsnbNorms, importedRates, categories, types, customRates] = await Promise.all([
    loadFsnbNormsWhitelist(),
    loadImportedRatesFull(),
    loadCategoriesAll(),
    loadTypesAll(),
    loadCustomRatesSnapshot(),
  ]);

  const total = fsnbNorms.length + importedRates.length + customRates.length;
  if (total > FULL_INLINE_THRESHOLD) {
    console.warn(
      `[rateContextCache] Превышен лимит FULL_INLINE_THRESHOLD (${total} > ${FULL_INLINE_THRESHOLD}). ` +
        `Поиск может работать медленно. Рекомендуется добавить серверный префильтр.`,
    );
  }

  return {
    fsnbNorms,
    importedRates,
    customRates,
    categories,
    types,
    loadedAt: Date.now(),
  };
}

/**
 * Загрузка только норм whitelist v2 (is_selected=true).
 * Постранично, чтобы обойти возможный лимит select.
 */
async function loadFsnbNormsWhitelist(): Promise<CachedFsnbNorm[]> {
  const PAGE = 1000;
  const acc: CachedFsnbNorm[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('fsnb_norms')
      .select(
        'id, norm_code, name, measure_unit, collection_code, collection_name, division_code, division_name, table_code, table_name',
      )
      .eq('is_selected', true)
      .order('norm_code')
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('[rateContextCache] loadFsnbNormsWhitelist:', error.message);
      throw error;
    }

    if (!data || data.length === 0) break;

    for (const row of data as Array<{
      id: string;
      norm_code: string;
      name: string;
      measure_unit: string | null;
      collection_code: string | null;
      collection_name: string | null;
      division_code: string | null;
      division_name: string | null;
      table_code: string | null;
      table_name: string | null;
    }>) {
      acc.push({
        id: row.id,
        norm_code: row.norm_code,
        name: row.name,
        unit: row.measure_unit ?? '',
        collection_code: row.collection_code,
        collection_name: row.collection_name,
        division_code: row.division_code,
        division_name: row.division_name,
        table_code: row.table_code,
        table_name: row.table_name,
      });
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return acc;
}

/**
 * Полная загрузка всех старых корпоративных расценок (1С) с раскрытыми
 * категорией и видом затрат.
 */
async function loadImportedRatesFull(): Promise<CachedImportedRate[]> {
  const PAGE = 1000;
  const acc: CachedImportedRate[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('imported_rates')
      .select(
        'id, work_name, unit, type_id, ' +
          'imported_rate_types!inner(id, name, category_id, imported_rate_categories!inner(id, name))',
      )
      .order('work_name')
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('[rateContextCache] loadImportedRatesFull:', error.message);
      throw error;
    }

    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      acc.push({
        id: row.id,
        work_name: row.work_name,
        unit: row.unit,
        type_id: row.type_id,
        type_name: row.imported_rate_types?.name ?? '',
        category_id: row.imported_rate_types?.category_id ?? '',
        category_name: row.imported_rate_types?.imported_rate_categories?.name ?? '',
      });
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return acc;
}

async function loadCategoriesAll(): Promise<RateCategoryRef[]> {
  const { data, error } = await supabase
    .from('imported_rate_categories')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return (data ?? []) as RateCategoryRef[];
}

async function loadTypesAll(): Promise<RateTypeRef[]> {
  const { data, error } = await supabase
    .from('imported_rate_types')
    .select('id, name, category_id')
    .order('name');
  if (error) throw error;
  return (data ?? []) as RateTypeRef[];
}

// ── Хелперы для tools агента ────────────────────────────────────

/**
 * Список норм ФСНБ внутри конкретной таблицы. Читает из локального кэша,
 * никаких запросов в БД.
 */
export function listFsnbNormsInTable(
  snapshot: RateContextSnapshot,
  collectionCode: string,
  divisionCode: string,
  tableCode: string,
): CachedFsnbNorm[] {
  return snapshot.fsnbNorms.filter(
    (n) =>
      n.collection_code === collectionCode &&
      n.division_code === divisionCode &&
      n.table_code === tableCode,
  );
}

/**
 * Сериализация дерева ФСНБ до уровня таблиц для стартового контекста LLM.
 * Возвращает компактную структуру с минимумом полей.
 */
export interface FsnbTreeForLlm {
  collections: Array<{
    code: string;
    name: string;
    divisions: Array<{
      code: string;
      name: string;
      tables: Array<{
        code: string;
        name: string;
        norms_count: number;
      }>;
    }>;
  }>;
}

export function buildFsnbTreeForLlm(snapshot: RateContextSnapshot): FsnbTreeForLlm {
  // collection_code → division_code → table_code → норма
  const collectionsMap = new Map<
    string,
    {
      name: string;
      divisions: Map<
        string,
        {
          name: string;
          tables: Map<string, { name: string; count: number }>;
        }
      >;
    }
  >();

  for (const norm of snapshot.fsnbNorms) {
    const cc = norm.collection_code ?? '';
    const dc = norm.division_code ?? '';
    const tc = norm.table_code ?? '';
    if (!cc || !dc || !tc) continue;

    if (!collectionsMap.has(cc)) {
      collectionsMap.set(cc, { name: norm.collection_name ?? cc, divisions: new Map() });
    }
    const col = collectionsMap.get(cc)!;

    if (!col.divisions.has(dc)) {
      col.divisions.set(dc, { name: norm.division_name ?? dc, tables: new Map() });
    }
    const div = col.divisions.get(dc)!;

    if (!div.tables.has(tc)) {
      div.tables.set(tc, { name: norm.table_name ?? tc, count: 0 });
    }
    const tbl = div.tables.get(tc)!;
    tbl.count += 1;
  }

  const collections = Array.from(collectionsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, col]) => ({
      code,
      name: col.name,
      divisions: Array.from(col.divisions.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dcode, div]) => ({
          code: dcode,
          name: div.name,
          tables: Array.from(div.tables.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([tcode, tbl]) => ({
              code: tcode,
              name: tbl.name,
              norms_count: tbl.count,
            })),
        })),
    }));

  return { collections };
}
