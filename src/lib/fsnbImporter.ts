/**
 * FSNB-2022 browser-side importer.
 *
 * Loads pre-parsed JSON (produced by scripts/fsnb-xml-to-json.ts) into Supabase
 * and generates embeddings via OpenRouter for hybrid (vector + FTS) search.
 *
 * Usage from Admin UI:
 *   1. User selects JSON files from temp/fsnb-import/ via file input
 *   2. Files are parsed into arrays in the browser
 *   3. importFsnbData() is called with the parsed data + progress callback
 */

import { supabase } from './supabase';
import { callEmbeddingApi } from './llm';

// ── Public types ────────────────────────────────────────────────

export type ImportPhase =
  | 'resources'
  | 'norms'
  | 'tech_groups'
  | 'tg_links'
  | 'embeddings_resources'
  | 'embeddings_norms'
  | 'done'
  | 'error';

export interface ImportProgress {
  phase: ImportPhase;
  message: string;
  current: number;
  total: number;
}

export type ImportProgressCallback = (progress: ImportProgress) => void;

export interface FsnbImportData {
  resources: ParsedResource[];
  normChunks: ParsedNorm[][];
  techGroups: ParsedTechGroup[];
  tgNormLinks: ParsedTgNormLink[];
  version: string;
}

// ── JSON object shapes (from scripts/fsnb-xml-to-json.ts output) ─

export interface ParsedResource {
  code: string;
  name: string;
  measure_unit: string | null;
  resource_type: 'material' | 'equipment' | 'machine' | 'labor';
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
  search_text: string;
}

export interface ParsedNormResource {
  code: string;
  name: string | null;
  quantity: number | null;
  measure_unit: string | null;
}

export interface ParsedNorm {
  norm_code: string;
  base_type: string;
  name: string;
  begin_name: string | null;
  end_name: string | null;
  measure_unit: string;
  collection_code: string | null;
  collection_name: string | null;
  division_code: string | null;
  division_name: string | null;
  table_code: string | null;
  table_name: string | null;
  resources: ParsedNormResource[];
  search_text: string;
  /** Опционально: флаг для v1+v2flag режима импорта (см. sql/005_fsnb_is_selected.sql) */
  is_selected?: boolean;
}

export interface ParsedTechGroup {
  tg_code: string;
  resource_codes: string[];
}

export interface ParsedTgNormLink {
  tg_code: string;
  norm_code: string;
  base_type: string;
  abstract_resource_code: string | null;
  abstract_resource_name: string | null;
  abstract_resource_unit: string | null;
}

// ── Constants ──────────────────────────────────────────────────

const DATA_BATCH_SIZE = 500;
const EMBEDDING_BATCH_SIZE = 500;    // text-embedding-3-small поддерживает до 2048 за запрос
const EMBEDDING_DELAY_MS = 100;
const EMBEDDING_UPDATE_CHUNK = 50;   // обновление в БД по 50 параллельно

/** Map base_type from JSON → collection code/name/base_type for DB */
const COLLECTION_DEFS: Record<string, { code: string; name: string; base_type: string }> = {
  'ГЭСН':   { code: 'ГЭСН',   name: 'Государственные элементные сметные нормы',                    base_type: 'gesn' },
  'ГЭСНм':  { code: 'ГЭСНм',  name: 'ГЭСН на монтаж оборудования',                                base_type: 'gesnm' },
  'ГЭСНр':  { code: 'ГЭСНр',  name: 'ГЭСН на ремонтно-строительные работы',                       base_type: 'gesnr' },
  'ГЭСНп':  { code: 'ГЭСНп',  name: 'ГЭСН на пусконаладочные работы',                             base_type: 'gesnp' },
  'ГЭСНмр': { code: 'ГЭСНмр', name: 'ГЭСН на монтаж и ремонт оборудования',                      base_type: 'gesnmr' },
};

const RESOURCE_COLLECTION_DEFS: Record<string, { code: string; name: string; base_type: string }> = {
  'material':  { code: 'ФСБЦ_Мат', name: 'ФСБЦ Материалы и оборудование', base_type: 'fsbc_mat' },
  'equipment': { code: 'ФСБЦ_Мат', name: 'ФСБЦ Материалы и оборудование', base_type: 'fsbc_mat' },
  'machine':   { code: 'ФСБЦ_Маш', name: 'ФСБЦ Машины и механизмы',       base_type: 'fsbc_mach' },
  'labor':     { code: 'ФСБЦ_Маш', name: 'ФСБЦ Машины и механизмы',       base_type: 'fsbc_mach' },
};

// ── Helpers ────────────────────────────────────────────────────

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Determine resource_type by code prefix (for norm_resources linking). */
function guessResourceType(code: string): string | null {
  if (/^9[0-9]\./.test(code)) return 'machine';
  if (/^[0-9]$/.test(code) || /^1-\d+/.test(code)) return 'labor';
  if (/^\d{2}\.\d/.test(code)) return 'material';
  return null;
}

// ── Main import function ───────────────────────────────────────

export async function importFsnbData(
  data: FsnbImportData,
  onProgress?: ImportProgressCallback,
): Promise<void> {
  const { resources, normChunks, techGroups, tgNormLinks, version } = data;

  const report = (phase: ImportPhase, message: string, current: number, total: number) => {
    onProgress?.({ phase, message, current, total });
  };

  try {
    // ────────────────────────────────────────────
    // Phase 1: Resources
    // ────────────────────────────────────────────
    const totalResources = resources.length;
    report('resources', 'Создание записей коллекций ресурсов...', 0, totalResources);

    // 1a. Ensure collection records exist for resource types
    const collectionIdCache = new Map<string, string>();
    const seenCollectionCodes = new Set<string>();

    for (const def of Object.values(RESOURCE_COLLECTION_DEFS)) {
      if (seenCollectionCodes.has(def.code)) continue;
      seenCollectionCodes.add(def.code);

      const collectionId = await upsertCollection(def.code, def.name, def.base_type, version);
      collectionIdCache.set(def.code, collectionId);
    }

    // 1b. Upsert resources in batches
    const resourceCodeToId = new Map<string, string>();
    const resourceBatches = chunks(resources, DATA_BATCH_SIZE);

    for (let bi = 0; bi < resourceBatches.length; bi++) {
      const batch = resourceBatches[bi];
      const rows = batch.map(r => {
        const colDef = RESOURCE_COLLECTION_DEFS[r.resource_type];
        return {
          code: r.code,
          name: r.name,
          measure_unit: r.measure_unit,
          resource_type: r.resource_type,
          collection_id: colDef ? (collectionIdCache.get(colDef.code) ?? null) : null,
          book_code: r.book_code,
          book_name: r.book_name,
          part_code: r.part_code,
          part_name: r.part_name,
          section_code: r.section_code,
          section_name: r.section_name,
          group_code: r.group_code,
          group_name: r.group_name,
          base_price: r.base_price,
          opt_price: r.opt_price,
          salary_mach: r.salary_mach,
          labour_mach: r.labour_mach,
          price_without_salary: r.price_without_salary,
          machinist_category: r.machinist_category,
          search_text: r.search_text,
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('fsnb_resources')
        .upsert(rows, { onConflict: 'code' });

      if (error) {
        console.error(`[fsnbImporter] Ошибка upsert ресурсов (batch ${bi + 1}):`, error.message);
      }

      const done = Math.min((bi + 1) * DATA_BATCH_SIZE, totalResources);
      report('resources', `Ресурсы: ${done} / ${totalResources}`, done, totalResources);
    }

    // 1c. Build code→id map (select all resource codes and ids)
    report('resources', 'Построение индекса code -> id ресурсов...', totalResources, totalResources);
    await buildResourceCodeMap(resourceCodeToId);

    // Update record_count on collection records
    for (const [colCode, colId] of collectionIdCache.entries()) {
      const count = resources.filter(r => {
        const def = RESOURCE_COLLECTION_DEFS[r.resource_type];
        return def && def.code === colCode;
      }).length;
      await supabase
        .from('fsnb_collections')
        .update({ record_count: count, imported_at: new Date().toISOString() })
        .eq('id', colId);
    }

    // ────────────────────────────────────────────
    // Phase 2: Norms
    // ────────────────────────────────────────────
    const allNorms = normChunks.flat();
    const totalNorms = allNorms.length;
    report('norms', 'Создание записей коллекций норм...', 0, totalNorms);

    // 2a. Ensure collection records for each base_type
    const baseTypesInData = [...new Set(allNorms.map(n => n.base_type))];
    for (const bt of baseTypesInData) {
      const def = COLLECTION_DEFS[bt];
      if (!def) {
        // Unknown base_type, create a generic collection
        const colId = await upsertCollection(bt, bt, bt.toLowerCase(), version);
        collectionIdCache.set(bt, colId);
      } else {
        const colId = await upsertCollection(def.code, def.name, def.base_type, version);
        collectionIdCache.set(def.code, colId);
      }
    }

    // 2b. Upsert norms in batches (across all chunks)
    const normBatches = chunks(allNorms, DATA_BATCH_SIZE);
    const normCodeToId = new Map<string, string>();

    for (let bi = 0; bi < normBatches.length; bi++) {
      const batch = normBatches[bi];
      const rows = batch.map(n => {
        const def = COLLECTION_DEFS[n.base_type];
        const colCode = def ? def.code : n.base_type;
        const row: Record<string, unknown> = {
          norm_code: n.norm_code,
          base_type: n.base_type,
          name: n.name,
          begin_name: n.begin_name,
          end_name: n.end_name,
          measure_unit: n.measure_unit,
          collection_id: collectionIdCache.get(colCode) ?? null,
          collection_code: n.collection_code,
          collection_name: n.collection_name,
          division_code: n.division_code,
          division_name: n.division_name,
          table_code: n.table_code,
          table_name: n.table_name,
          search_text: n.search_text,
          updated_at: new Date().toISOString(),
        };
        // Прокидываем is_selected только если он явно задан в JSON — иначе
        // оставляем значение в БД нетронутым при upsert (конфликт по norm_code).
        if (typeof n.is_selected === 'boolean') {
          row.is_selected = n.is_selected;
        }
        return row;
      });

      // Дедупликация по norm_code внутри batch (ON CONFLICT не может обработать дубли в одном INSERT)
      const seen = new Set<string>();
      const dedupedRows = rows.filter(r => {
        const nc = r.norm_code as string;
        if (seen.has(nc)) return false;
        seen.add(nc);
        return true;
      });

      const { error } = await supabase
        .from('fsnb_norms')
        .upsert(dedupedRows, { onConflict: 'norm_code' });

      if (error) {
        console.error(`[fsnbImporter] Ошибка upsert норм (batch ${bi + 1}):`, error.message);
      }

      const done = Math.min((bi + 1) * DATA_BATCH_SIZE, totalNorms);
      report('norms', `Нормы: ${done} / ${totalNorms}`, done, totalNorms);
    }

    // 2c. Build norm_code→id map
    report('norms', 'Построение индекса norm_code -> id норм...', totalNorms, totalNorms);
    await buildNormCodeMap(normCodeToId);

    // 2d. Upsert norm_resources
    // norm_resources table has no unique constraint on (norm_id, resource_code),
    // so we delete existing rows per norm then insert fresh.
    report('norms', 'Загрузка ресурсного состава норм...', 0, totalNorms);

    let normResProcessed = 0;
    for (let bi = 0; bi < normBatches.length; bi++) {
      const batch = normBatches[bi];

      // Collect all norm_ids in this batch to delete their existing norm_resources
      const normIdsInBatch = batch
        .map(n => normCodeToId.get(n.norm_code))
        .filter((id): id is string => id != null);

      if (normIdsInBatch.length > 0) {
        // Delete in sub-batches to avoid URL length limits
        const deleteChunks = chunks(normIdsInBatch, 200);
        for (const dc of deleteChunks) {
          await supabase
            .from('fsnb_norm_resources')
            .delete()
            .in('norm_id', dc);
        }
      }

      // Build norm_resource rows
      const nrRows: Array<{
        norm_id: string;
        resource_code: string;
        resource_name: string | null;
        resource_type: string | null;
        consumption: number | null;
        measure_unit: string | null;
        resource_id: string | null;
      }> = [];

      for (const norm of batch) {
        const normId = normCodeToId.get(norm.norm_code);
        if (!normId) continue;

        for (const res of norm.resources) {
          if (!res.code) continue;
          nrRows.push({
            norm_id: normId,
            resource_code: res.code,
            resource_name: res.name,
            resource_type: guessResourceType(res.code),
            consumption: res.quantity,
            measure_unit: res.measure_unit,
            resource_id: resourceCodeToId.get(res.code) ?? null,
          });
        }
      }

      // Insert in sub-batches
      const nrSubBatches = chunks(nrRows, DATA_BATCH_SIZE);
      for (const sub of nrSubBatches) {
        const { error } = await supabase
          .from('fsnb_norm_resources')
          .insert(sub);

        if (error) {
          console.error(`[fsnbImporter] Ошибка insert norm_resources (batch ${bi + 1}):`, error.message);
        }
      }

      normResProcessed += batch.length;
      report('norms', `Ресурсный состав: ${normResProcessed} / ${totalNorms} норм`, normResProcessed, totalNorms);
    }

    // Update record_count on norm collections
    for (const bt of baseTypesInData) {
      const def = COLLECTION_DEFS[bt];
      const colCode = def ? def.code : bt;
      const colId = collectionIdCache.get(colCode);
      if (!colId) continue;
      const count = allNorms.filter(n => n.base_type === bt).length;
      await supabase
        .from('fsnb_collections')
        .update({ record_count: count, imported_at: new Date().toISOString() })
        .eq('id', colId);
    }

    // ────────────────────────────────────────────
    // Phase 3: Tech Groups
    // ────────────────────────────────────────────
    const totalTg = techGroups.length;
    report('tech_groups', 'Загрузка технологических групп...', 0, totalTg);

    // 3a. Upsert tech groups
    const tgBatches = chunks(techGroups, DATA_BATCH_SIZE);
    for (let bi = 0; bi < tgBatches.length; bi++) {
      const batch = tgBatches[bi];
      const rows = batch.map(tg => ({
        tg_code: tg.tg_code,
        resource_count: tg.resource_codes.length,
      }));

      const { error } = await supabase
        .from('fsnb_tech_groups')
        .upsert(rows, { onConflict: 'tg_code' });

      if (error) {
        console.error(`[fsnbImporter] Ошибка upsert tech_groups (batch ${bi + 1}):`, error.message);
      }

      const done = Math.min((bi + 1) * DATA_BATCH_SIZE, totalTg);
      report('tech_groups', `ТГ: ${done} / ${totalTg}`, done, totalTg);
    }

    // 3b. Build tg_code→id map
    const tgCodeToId = new Map<string, string>();
    await buildTgCodeMap(tgCodeToId);

    // 3c. Upsert tg_resources
    report('tech_groups', 'Загрузка связей ТГ -> ресурсы...', 0, totalTg);

    let tgResProcessed = 0;
    for (let bi = 0; bi < tgBatches.length; bi++) {
      const batch = tgBatches[bi];
      const tgrRows: Array<{
        tg_id: string;
        resource_code: string;
        resource_id: string | null;
      }> = [];

      for (const tg of batch) {
        const tgId = tgCodeToId.get(tg.tg_code);
        if (!tgId) continue;

        for (const resCode of tg.resource_codes) {
          tgrRows.push({
            tg_id: tgId,
            resource_code: resCode,
            resource_id: resourceCodeToId.get(resCode) ?? null,
          });
        }
      }

      // Upsert with onConflict on the composite unique (tg_id, resource_code)
      const tgrSubBatches = chunks(tgrRows, DATA_BATCH_SIZE);
      for (const sub of tgrSubBatches) {
        const { error } = await supabase
          .from('fsnb_tg_resources')
          .upsert(sub, { onConflict: 'tg_id,resource_code' });

        if (error) {
          console.error(`[fsnbImporter] Ошибка upsert tg_resources (batch ${bi + 1}):`, error.message);
        }
      }

      tgResProcessed += batch.length;
      report('tech_groups', `Связи ТГ->ресурсы: ${tgResProcessed} / ${totalTg} ТГ`, tgResProcessed, totalTg);
    }

    // ────────────────────────────────────────────
    // Phase 4: TG-Norm Links
    // ────────────────────────────────────────────
    const totalTgLinks = tgNormLinks.length;
    report('tg_links', 'Загрузка связей ТГ -> нормы...', 0, totalTgLinks);

    const tgLinkBatches = chunks(tgNormLinks, DATA_BATCH_SIZE);
    for (let bi = 0; bi < tgLinkBatches.length; bi++) {
      const batch = tgLinkBatches[bi];
      const rows = batch
        .map(link => {
          const tgId = tgCodeToId.get(link.tg_code);
          if (!tgId) return null;

          return {
            norm_code: link.norm_code,
            norm_base_type: link.base_type,
            norm_id: normCodeToId.get(link.norm_code) ?? null,
            tg_id: tgId,
            abstract_resource_code: link.abstract_resource_code,
            abstract_resource_name: link.abstract_resource_name,
            abstract_resource_unit: link.abstract_resource_unit,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        const { error } = await supabase
          .from('fsnb_norm_tech_groups')
          .upsert(rows, { onConflict: 'norm_code,tg_id' });

        if (error) {
          console.error(`[fsnbImporter] Ошибка upsert norm_tech_groups (batch ${bi + 1}):`, error.message);
        }
      }

      const done = Math.min((bi + 1) * DATA_BATCH_SIZE, totalTgLinks);
      report('tg_links', `Связи ТГ->нормы: ${done} / ${totalTgLinks}`, done, totalTgLinks);
    }

    // ────────────────────────────────────────────
    // Phase 5: Embeddings for Resources
    // ────────────────────────────────────────────
    await generateEmbeddings(
      'fsnb_resources',
      'embeddings_resources',
      'Эмбеддинги ресурсов',
      report,
    );

    // ────────────────────────────────────────────
    // Phase 6: Embeddings for Norms
    // ────────────────────────────────────────────
    await generateEmbeddings(
      'fsnb_norms',
      'embeddings_norms',
      'Эмбеддинги норм',
      report,
    );

    // ────────────────────────────────────────────
    // Done
    // ────────────────────────────────────────────
    report('done', 'Импорт ФСНБ завершён успешно.', 1, 1);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[fsnbImporter] Критическая ошибка:', message);
    report('error', `Ошибка импорта: ${message}`, 0, 0);
    throw err;
  }
}

// ── Collection upsert ──────────────────────────────────────────

async function upsertCollection(
  code: string,
  name: string,
  baseType: string,
  version: string,
): Promise<string> {
  // Try to select existing first
  const { data: existing } = await supabase
    .from('fsnb_collections')
    .select('id')
    .eq('code', code)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('fsnb_collections')
      .update({ version, name })
      .eq('id', existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from('fsnb_collections')
    .insert({
      code,
      name,
      base_type: baseType,
      version,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Не удалось создать коллекцию "${code}": ${error.message}`);
  }

  return data.id as string;
}

// ── Code-to-ID map builders ────────────────────────────────────

/**
 * Fetches all resource codes + ids from fsnb_resources and populates the map.
 * Reads in pages of 10 000 to avoid response size limits.
 */
async function buildResourceCodeMap(map: Map<string, string>): Promise<void> {
  // Cursor-based pagination — обходит ограничение Supabase на offset
  let lastId = '';
  let page = 0;

  while (true) {
    let q = supabase
      .from('fsnb_resources')
      .select('id, code')
      .order('id')
      .limit(1000);
    if (lastId) q = q.gt('id', lastId);

    const { data, error } = await q;
    if (error) throw new Error(`Ошибка чтения fsnb_resources: ${error.message}`);

    const rows = data ?? [];
    for (const row of rows) {
      map.set(row.code as string, row.id as string);
    }

    if (rows.length < 1000) break;
    lastId = rows[rows.length - 1].id as string;
    page++;
    if (page % 10 === 0) await new Promise(r => setTimeout(r, 50));
  }
}

async function buildNormCodeMap(map: Map<string, string>): Promise<void> {
  let lastId = '';
  let page = 0;

  while (true) {
    let q = supabase
      .from('fsnb_norms')
      .select('id, norm_code')
      .order('id')
      .limit(1000);
    if (lastId) q = q.gt('id', lastId);

    const { data, error } = await q;
    if (error) throw new Error(`Ошибка чтения fsnb_norms: ${error.message}`);

    const rows = data ?? [];
    for (const row of rows) {
      map.set(row.norm_code as string, row.id as string);
    }

    if (rows.length < 1000) break;
    lastId = rows[rows.length - 1].id as string;
    page++;
    if (page % 10 === 0) await new Promise(r => setTimeout(r, 50));
  }
}

async function buildTgCodeMap(map: Map<string, string>): Promise<void> {
  let lastId = '';

  while (true) {
    let q = supabase
      .from('fsnb_tech_groups')
      .select('id, tg_code')
      .order('id')
      .limit(1000);
    if (lastId) q = q.gt('id', lastId);

    const { data, error } = await q;
    if (error) throw new Error(`Ошибка чтения fsnb_tech_groups: ${error.message}`);

    const rows = data ?? [];
    for (const row of rows) {
      map.set(row.tg_code as string, row.id as string);
    }

    if (rows.length < 1000) break;
    lastId = rows[rows.length - 1].id as string;
  }
}

// ── Embedding generation ───────────────────────────────────────

/**
 * Generates embeddings for all rows in the given table where embedding IS NULL
 * and search_text IS NOT NULL.
 *
 * Processes in batches of EMBEDDING_BATCH_SIZE with EMBEDDING_DELAY_MS pause
 * between batches to stay within OpenRouter rate limits.
 */
async function generateEmbeddings(
  table: 'fsnb_resources' | 'fsnb_norms',
  phase: 'embeddings_resources' | 'embeddings_norms',
  label: string,
  report: (phase: ImportPhase, message: string, current: number, total: number) => void,
): Promise<void> {
  // 1. Count rows needing embeddings
  const { count, error: countError } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)
    .not('search_text', 'is', null);

  if (countError) {
    console.error(`[fsnbImporter] Ошибка подсчёта ${table} для эмбеддингов:`, countError.message);
    return;
  }

  const total = count ?? 0;
  if (total === 0) {
    report(phase, `${label}: все эмбеддинги уже созданы.`, 0, 0);
    return;
  }

  report(phase, `${label}: ${total} записей без эмбеддингов...`, 0, total);

  let processed = 0;

  // Process in pages — each iteration fetches a batch of rows without embeddings,
  // computes embeddings, and updates the rows. Because we update embedding to non-null,
  // the next fetch naturally gets the next batch.
  while (processed < total) {
    // Fetch a batch of rows needing embeddings
    const { data: rows, error: fetchError } = await supabase
      .from(table)
      .select('id, search_text')
      .is('embedding', null)
      .not('search_text', 'is', null)
      .limit(EMBEDDING_BATCH_SIZE);

    if (fetchError) {
      console.error(`[fsnbImporter] Ошибка чтения ${table} для эмбеддингов:`, fetchError.message);
      break;
    }

    if (!rows || rows.length === 0) break;

    const texts = rows.map(r => (r.search_text as string) || '');
    const ids = rows.map(r => r.id as string);

    try {
      const embeddings = await callEmbeddingApi({ texts });

      // Update rows with embeddings in chunks to avoid overwhelming Supabase
      for (let ci = 0; ci < ids.length; ci += EMBEDDING_UPDATE_CHUNK) {
        const chunkIds = ids.slice(ci, ci + EMBEDDING_UPDATE_CHUNK);
        const chunkEmbeddings = embeddings.slice(ci, ci + EMBEDDING_UPDATE_CHUNK);
        const updatePromises = chunkIds.map((id, idx) =>
          supabase
            .from(table)
            .update({ embedding: JSON.stringify(chunkEmbeddings[idx]) })
            .eq('id', id)
            .then(({ error: updateError }) => {
              if (updateError) {
                console.error(`[fsnbImporter] Ошибка обновления embedding ${table}/${id}:`, updateError.message);
              }
            }),
        );
        await Promise.all(updatePromises);
      }

      processed += rows.length;
      report(phase, `${label}: ${processed} / ${total}`, processed, total);

      // Delay between batches to avoid rate limits
      if (processed < total) {
        await new Promise(resolve => setTimeout(resolve, EMBEDDING_DELAY_MS));
      }
    } catch (embError) {
      const msg = embError instanceof Error ? embError.message : String(embError);
      console.error(`[fsnbImporter] Ошибка генерации эмбеддингов для ${table}:`, msg);

      // If it's a rate limit error, wait longer and retry
      if (msg.includes('429')) {
        console.warn(`[fsnbImporter] Rate limit, ожидание 5 секунд...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue; // retry the same batch
      }

      // For other errors, skip this batch and continue
      processed += rows.length;
      report(phase, `${label}: ${processed} / ${total} (с ошибками)`, processed, total);
    }
  }

  report(phase, `${label}: завершено (${processed} из ${total}).`, processed, total);
}

// ── Догрузка только norm_resources (без перезаписи норм) ─────

/**
 * Загружает norm_resources из JSON-чанков норм.
 * Не трогает fsnb_norms — только добавляет/обновляет ресурсный состав.
 * Использует существующие norm_code→id и resource_code→id маппинги из БД.
 */
export async function importNormResourcesOnly(
  normChunks: Array<Array<{ norm_code: string; resources: Array<{ code: string; name?: string; quantity?: number; measure_unit?: string }> }>>,
  onProgress?: ImportProgressCallback,
): Promise<{ total: number; inserted: number; errors: number }> {
  const report = (msg: string, current: number, total: number) => {
    onProgress?.({ phase: 'norms', message: msg, current, total });
  };

  const allNorms = normChunks.flat();
  const totalNorms = allNorms.length;
  report('Построение индексов...', 0, totalNorms);

  // Build maps
  const normCodeToId = new Map<string, string>();
  await buildNormCodeMap(normCodeToId);
  console.log(`[fsnbImporter] normCodeToId: ${normCodeToId.size} записей`);

  const resourceCodeToId = new Map<string, string>();
  await buildResourceCodeMap(resourceCodeToId);
  console.log(`[fsnbImporter] resourceCodeToId: ${resourceCodeToId.size} записей`);

  let inserted = 0;
  let errors = 0;
  let skippedNoId = 0;
  const NORM_BATCH = 50;    // норм за итерацию (мелкие батчи для стабильности)
  const INSERT_BATCH = 100; // строк за INSERT

  const batches = chunks(allNorms, NORM_BATCH);
  console.log(`[fsnbImporter] Всего ${batches.length} батчей по ${NORM_BATCH} норм`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];

    // Delete existing norm_resources for norms in this batch
    const normIdsInBatch = batch
      .map(n => normCodeToId.get(n.norm_code))
      .filter((id): id is string => id != null);

    if (normIdsInBatch.length > 0) {
      for (const dc of chunks(normIdsInBatch, 50)) {
        await supabase.from('fsnb_norm_resources').delete().in('norm_id', dc);
      }
    }

    // Build rows
    const nrRows: Array<{
      norm_id: string;
      resource_code: string;
      resource_name: string | null;
      resource_type: string | null;
      consumption: number | null;
      measure_unit: string | null;
      resource_id: string | null;
    }> = [];

    for (const norm of batch) {
      const normId = normCodeToId.get(norm.norm_code);
      if (!normId) { skippedNoId++; continue; }
      for (const res of norm.resources) {
        if (!res.code) continue;
        nrRows.push({
          norm_id: normId,
          resource_code: res.code,
          resource_name: res.name ?? null,
          resource_type: guessResourceType(res.code),
          consumption: res.quantity ?? null,
          measure_unit: res.measure_unit ?? null,
          resource_id: resourceCodeToId.get(res.code) ?? null,
        });
      }
    }

    // Insert in sub-batches with retry
    for (const sub of chunks(nrRows, INSERT_BATCH)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { error } = await supabase.from('fsnb_norm_resources').insert(sub);
          if (!error) {
            inserted += sub.length;
            break;
          }
          console.warn(`[fsnbImporter] batch ${bi + 1} attempt ${attempt + 1} error: ${error.message}`);
          if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
          else errors++;
        } catch (e) {
          console.warn(`[fsnbImporter] batch ${bi + 1} attempt ${attempt + 1} exception:`, e);
          if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
          else errors++;
        }
      }
    }

    // Пауза между КАЖДЫМ батчем
    await new Promise(r => setTimeout(r, 150));

    // Прогресс каждые 10 батчей
    if (bi % 10 === 9 || bi === batches.length - 1) {
      const done = Math.min((bi + 1) * NORM_BATCH, totalNorms);
      report(`Ресурсный состав: ${done} / ${totalNorms} норм (${inserted} ресурсов, ${errors} ошибок)`, done, totalNorms);
      console.log(`[fsnbImporter] Прогресс: batch ${bi + 1}/${batches.length}, inserted=${inserted}, errors=${errors}, skipped=${skippedNoId}`);
    }
  }

  console.log(`[fsnbImporter] ИТОГО: inserted=${inserted}, errors=${errors}, skippedNoId=${skippedNoId}`);
  report(`Готово: ${inserted} ресурсов, ${errors} ошибок, ${skippedNoId} пропущено`, totalNorms, totalNorms);
  return { total: totalNorms, inserted, errors };
}

// ── Utility: get import stats ──────────────────────────────────

export interface FsnbImportStats {
  resources: number;
  resourcesWithEmbedding: number;
  norms: number;
  normsWithEmbedding: number;
  normResources: number;
  techGroups: number;
  tgResources: number;
  normTechGroups: number;
  collections: Array<{ code: string; name: string; record_count: number; imported_at: string | null }>;
}

/**
 * Fetch current import stats from the database — useful for the Admin UI
 * to show what's already loaded.
 */
export async function getFsnbImportStats(): Promise<FsnbImportStats> {
  const [
    { count: resources },
    { count: resourcesWithEmb },
    { count: norms },
    { count: normsWithEmb },
    { count: normResources },
    { count: techGroups },
    { count: tgResources },
    { count: normTechGroups },
    { data: collections },
  ] = await Promise.all([
    supabase.from('fsnb_resources').select('id', { count: 'exact', head: true }),
    supabase.from('fsnb_resources').select('id', { count: 'exact', head: true }).not('embedding', 'is', null),
    supabase.from('fsnb_norms').select('id', { count: 'exact', head: true }),
    supabase.from('fsnb_norms').select('id', { count: 'exact', head: true }).not('embedding', 'is', null),
    supabase.from('fsnb_norm_resources').select('id', { count: 'exact', head: true }),
    supabase.from('fsnb_tech_groups').select('id', { count: 'exact', head: true }),
    supabase.from('fsnb_tg_resources').select('id', { count: 'exact', head: true }),
    supabase.from('fsnb_norm_tech_groups').select('id', { count: 'exact', head: true }),
    supabase.from('fsnb_collections').select('code, name, record_count, imported_at').order('code'),
  ]);

  return {
    resources: resources ?? 0,
    resourcesWithEmbedding: resourcesWithEmb ?? 0,
    norms: norms ?? 0,
    normsWithEmbedding: normsWithEmb ?? 0,
    normResources: normResources ?? 0,
    techGroups: techGroups ?? 0,
    tgResources: tgResources ?? 0,
    normTechGroups: normTechGroups ?? 0,
    collections: (collections ?? []) as FsnbImportStats['collections'],
  };
}
