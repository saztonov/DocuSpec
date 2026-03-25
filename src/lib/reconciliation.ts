/**
 * Phase A.5 — Rule-based reconciliation engine.
 *
 * Runs *before* agents and performs deterministic post-processing on
 * extracted material facts for a given document:
 *
 *  1. Extract cross-volume dependency flags ("см. раздел ...")
 *  2. Extract work hints from "Общие указания" sections
 *  3. Assign `quantity_type` to material facts based on unit / context
 *  4. Detect double-count conflicts (vedomost + assembly)
 *  5. Normalize Cyrillic/Latin aliases in dimension strings and ГОСТ
 */

import { supabase } from './supabase.ts';
import type { QuantityType, WorkHintType, DependencyType } from '../types/database.ts';

// ── Public result type ─────────────────────────────────────────

export interface ReconciliationResult {
  workHintsCount: number;
  dependencyFlagsCount: number;
  aliasesResolved: number;
  conflictsDetected: number;
  quantityTypesAssigned: number;
}

// ── Internal helpers ───────────────────────────────────────────

interface BlockRow {
  id: string;
  content: string;
  section_title: string | null;
}

// ── Main entry point ───────────────────────────────────────────

/**
 * Run full reconciliation pipeline for a document.
 * Each sub-step is independent and reports its own count.
 */
export async function runReconciliation(docId: string): Promise<ReconciliationResult> {
  // Load all blocks once
  const { data: blocks, error } = await supabase
    .from('doc_blocks')
    .select('id, content, section_title')
    .eq('doc_id', docId);

  if (error) {
    console.error('[reconciliation] Failed to load blocks:', error.message);
    return {
      workHintsCount: 0,
      dependencyFlagsCount: 0,
      aliasesResolved: 0,
      conflictsDetected: 0,
      quantityTypesAssigned: 0,
    };
  }

  const blockRows = (blocks ?? []) as BlockRow[];

  // Run all sub-steps in parallel where possible
  const [dependencyFlagsCount, workHintsCount, quantityTypesAssigned] =
    await Promise.all([
      extractDependencyFlags(docId, blockRows),
      extractWorkHints(docId, blockRows),
      assignQuantityTypes(docId),
    ]);

  // These depend on updated facts, run sequentially
  const conflictsDetected = await detectDoubleCount(docId);
  const aliasesResolved = await normalizeAliases(docId);

  return {
    workHintsCount,
    dependencyFlagsCount,
    aliasesResolved,
    conflictsDetected,
    quantityTypesAssigned,
  };
}

// ── 1. Cross-volume dependency extraction ──────────────────────

/**
 * Scan block content for references to other document sections/volumes
 * and insert `dependency_flags` rows.
 *
 * Patterns recognised:
 *   - "см. раздел 123-456-ГК-АР"
 *   - "см. 123/456-ГК-КР л. 5, 12"
 *   - "смотри альбом 12-34-ГК-ОВ1"
 */
async function extractDependencyFlags(
  docId: string,
  blocks: BlockRow[],
): Promise<number> {
  // Regex: "см." or "смотри" + optional (раздел|альбом|том) + doc code + optional sheet refs
  const refRegex =
    /(?:см\.?\s*|смотри\s+)(?:раздел\s+|альбом\s+|том\s+)?(\d{2,3}[\/-]\d{2,3}-ГК-[А-ЯA-Za-z]+\d*)(?:\s*л\.?\s*([\d,\s-]+))?/gi;

  const rows: Array<{
    doc_id: string;
    block_id: string;
    referenced_doc_code: string;
    referenced_sheet: string | null;
    dependency_type: DependencyType;
    description: string;
    resolved: boolean;
  }> = [];

  for (const block of blocks) {
    let match: RegExpExecArray | null;
    // Reset lastIndex for each block
    refRegex.lastIndex = 0;

    while ((match = refRegex.exec(block.content)) !== null) {
      const docCode = match[1].replace(/\//g, '-'); // normalise / → -
      const sheets = match[2]?.trim() || null;

      rows.push({
        doc_id: docId,
        block_id: block.id,
        referenced_doc_code: docCode,
        referenced_sheet: sheets,
        dependency_type: 'material',
        description: match[0].trim(),
        resolved: false,
      });
    }
  }

  if (rows.length === 0) return 0;

  // Upsert: avoid duplicates on (doc_id, block_id, referenced_doc_code)
  let inserted = 0;
  for (const row of rows) {
    const { data: existing } = await supabase
      .from('dependency_flags')
      .select('id')
      .eq('doc_id', row.doc_id)
      .eq('block_id', row.block_id)
      .eq('referenced_doc_code', row.referenced_doc_code)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('dependency_flags').insert(row);
      if (!error) inserted++;
      else console.warn('[reconciliation] dependency insert error:', error.message);
    }
  }

  return inserted;
}

// ── 2. Work hints extraction ───────────────────────────────────

/** Keyword → hint type mapping. */
const HINT_TYPE_KEYWORDS: Array<{ keywords: string[]; type: WorkHintType }> = [
  { keywords: ['окрас', 'покры', 'лакокрас', 'эмал'], type: 'coating' },
  { keywords: ['гидроизоляц', 'гидро-изоляц'], type: 'waterproofing' },
  { keywords: ['огнезащ', 'огнестойк', 'огнеупор'], type: 'fire_protection' },
  { keywords: ['монтаж', 'установ', 'крепл', 'сборк'], type: 'mounting' },
  { keywords: ['грунтов', 'подготов', 'праймер', 'грунт-'], type: 'preparation' },
  { keywords: ['теплоизоляц', 'утепл', 'минерал'], type: 'insulation' },
  { keywords: ['армат', 'армиров', 'каркас'], type: 'reinforcement' },
];

/** Detect hint type from text. */
function classifyHintType(text: string): WorkHintType {
  const lower = text.toLowerCase();
  for (const { keywords, type } of HINT_TYPE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return type;
    }
  }
  return 'other';
}

/** Extract ГОСТ / material references from hint text. */
function extractRelatedMaterials(text: string): string[] {
  const materials: string[] = [];

  // ГОСТ patterns
  const gostRegex = /ГОСТ\s*[\dР][\d.\-Р]+/gi;
  let m: RegExpExecArray | null;
  while ((m = gostRegex.exec(text)) !== null) {
    materials.push(m[0].trim());
  }

  // ТУ patterns
  const tuRegex = /ТУ\s*[\d][\d.\-]+/gi;
  while ((m = tuRegex.exec(text)) !== null) {
    materials.push(m[0].trim());
  }

  return [...new Set(materials)];
}

/**
 * Extract work hints from blocks whose section_title indicates
 * "Общие указания" or "Общие данные".
 */
async function extractWorkHints(
  docId: string,
  blocks: BlockRow[],
): Promise<number> {
  const targetBlocks = blocks.filter((b) => {
    const title = b.section_title?.toLowerCase() ?? '';
    return title.includes('общие указания') || title.includes('общие данные');
  });

  if (targetBlocks.length === 0) return 0;

  let inserted = 0;

  for (const block of targetBlocks) {
    // Split into sentences / meaningful chunks for granular hints
    const sentences = block.content
      .split(/(?<=[.;])\s+/)
      .filter((s) => s.trim().length > 20);

    for (const sentence of sentences) {
      const hintType = classifyHintType(sentence);
      // Only store if it matches a known type (skip generic sentences)
      if (hintType === 'other') continue;

      const relatedMaterials = extractRelatedMaterials(sentence);

      // Avoid duplicates
      const snippet = sentence.slice(0, 200);
      const { data: existing } = await supabase
        .from('work_hints')
        .select('id')
        .eq('doc_id', docId)
        .eq('block_id', block.id)
        .ilike('hint_text', `${snippet.slice(0, 50)}%`)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('work_hints').insert({
          doc_id: docId,
          block_id: block.id,
          hint_text: snippet,
          hint_type: hintType,
          related_materials: relatedMaterials.length > 0 ? relatedMaterials : null,
          confidence: 0.7,
        });
        if (!error) inserted++;
        else console.warn('[reconciliation] work_hint insert error:', error.message);
      }
    }
  }

  return inserted;
}

// ── 3. Quantity type detection ─────────────────────────────────

/**
 * Determine the `quantity_type` from the unit string and fact context.
 */
function detectQuantityType(
  unit: string | null,
  sourceSection: string | null,
  factType: string,
): QuantityType | null {
  // Context-based overrides first
  if (sourceSection === 'assembly_total') return 'assembly_total';

  const normalised = (unit ?? '').toLowerCase().replace(/\s+/g, '').replace(/\./g, '');

  // Unit-based mapping
  if (normalised === 'мм') return 'layer_thickness';
  if (normalised === 'м2' || normalised === 'кв.м' || normalised === 'квм') return 'area';
  if (normalised === 'м3' || normalised === 'куб.м' || normalised === 'кубм') return 'volume';
  if (normalised === 'шт' || normalised === 'штук' || normalised === 'компл') return 'count';
  if (normalised === 'кг' || normalised === 'т' || normalised === 'тн' || normalised === 'тонн') return 'weight';
  if (normalised === 'м' || normalised === 'мп' || normalised === 'пм') return 'linear';

  // Fact-type override for equipment
  if (factType === 'equipment') return 'equipment_count';

  return null;
}

/**
 * Assign `quantity_type` to all material_facts that currently have it as NULL.
 */
async function assignQuantityTypes(docId: string): Promise<number> {
  const { data: facts, error } = await supabase
    .from('material_facts')
    .select('id, unit, source_section, kind, fact_type')
    .eq('doc_id', docId)
    .is('quantity_type', null);

  if (error || !facts || facts.length === 0) return 0;

  let assigned = 0;

  for (const fact of facts) {
    const qt = detectQuantityType(
      fact.unit as string | null,
      fact.source_section as string | null,
      (fact.kind ?? fact.fact_type ?? '') as string,
    );

    if (qt) {
      const { error: updateErr } = await supabase
        .from('material_facts')
        .update({ quantity_type: qt })
        .eq('id', fact.id);

      if (!updateErr) assigned++;
    }
  }

  return assigned;
}

// ── 4. Double-count conflict detection ─────────────────────────

/**
 * If the same `canonical_key` appears in both `vedomost_materialov` and
 * `assembly_total` source sections, flag a potential double-count.
 *
 * Stores conflicts as work_hints with type 'other' and a distinctive prefix.
 */
async function detectDoubleCount(docId: string): Promise<number> {
  // Get canonical keys per source_section
  const { data: vedomostFacts, error: e1 } = await supabase
    .from('material_facts')
    .select('canonical_key, canonical_name')
    .eq('doc_id', docId)
    .eq('source_section', 'vedomost_materialov')
    .not('canonical_key', 'is', null);

  const { data: assemblyFacts, error: e2 } = await supabase
    .from('material_facts')
    .select('canonical_key, canonical_name')
    .eq('doc_id', docId)
    .eq('source_section', 'assembly_total')
    .not('canonical_key', 'is', null);

  if (e1 || e2 || !vedomostFacts || !assemblyFacts) return 0;

  const vedomostKeys = new Set(
    vedomostFacts.map((f) => f.canonical_key as string),
  );

  const conflicts: Array<{ key: string; name: string }> = [];

  for (const fact of assemblyFacts) {
    const key = fact.canonical_key as string;
    if (vedomostKeys.has(key)) {
      conflicts.push({
        key,
        name: (fact.canonical_name ?? key) as string,
      });
    }
  }

  if (conflicts.length === 0) return 0;

  // Deduplicate
  const uniqueConflicts = [...new Map(conflicts.map((c) => [c.key, c])).values()];

  let inserted = 0;
  for (const conflict of uniqueConflicts) {
    const hintText =
      `[КОНФЛИКТ ДВОЙНОГО СЧЁТА] Материал "${conflict.name}" (${conflict.key}) ` +
      `присутствует и в ведомости материалов, и в итогах по сборочным единицам. ` +
      `Необходима ручная проверка.`;

    // Avoid duplicates
    const { data: existing } = await supabase
      .from('work_hints')
      .select('id')
      .eq('doc_id', docId)
      .ilike('hint_text', `%${conflict.key}%`)
      .ilike('hint_text', '%КОНФЛИКТ ДВОЙНОГО СЧЁТА%')
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('work_hints').insert({
        doc_id: docId,
        block_id: null,
        hint_text: hintText,
        hint_type: 'other',
        related_materials: [conflict.name],
        confidence: 0.9,
      });
      if (!error) inserted++;
    }
  }

  return inserted;
}

// ── 5. Alias normalization ─────────────────────────────────────

/**
 * Cyrillic ↔ Latin look-alike character map (Cyrillic → Latin).
 * Used to normalise dimension strings where OCR may mix alphabets.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  'х': 'x',  // Cyrillic "х" → Latin "x" (dimension separator)
  'Х': 'X',
  'Н': 'H',  // Cyrillic "Н" → Latin "H" (profile height)
  'В': 'B',  // Cyrillic "В" → Latin "B"
  'С': 'C',  // Cyrillic "С" → Latin "C"
  'Т': 'T',  // Cyrillic "Т" → Latin "T"
  'Р': 'P',  // Cyrillic "Р" → Latin "P"
  'А': 'A',  // Cyrillic "А" → Latin "A"
  'М': 'M',  // Cyrillic "М" → Latin "M"
  'К': 'K',  // Cyrillic "К" → Latin "K"
  'О': 'O',  // Cyrillic "О" → Latin "O"
  'Е': 'E',  // Cyrillic "Е" → Latin "E"
};

/**
 * Normalise a dimension/mark string by replacing Cyrillic look-alikes
 * with their Latin equivalents in contexts where Latin is expected
 * (e.g., "100х50х3" → "100x50x3", "Н=200" → "H=200").
 */
function normaliseDimensionString(input: string): string {
  // Only replace Cyrillic "х" between digits (dimension separator)
  let result = input.replace(/(\d)\s*х\s*(\d)/g, '$1x$2');

  // Replace Cyrillic "Н" before "=" (profile height notation)
  result = result.replace(/Н\s*=/g, 'H=');

  return result;
}

/**
 * Normalise ГОСТ format: ensure consistent spacing and dash style.
 * E.g. "ГОСТ  8240—93" → "ГОСТ 8240-93"
 */
function normaliseGost(input: string): string {
  return input
    .replace(/ГОСТ\s+/gi, 'ГОСТ ')         // collapse spaces after ГОСТ
    .replace(/[—–]/g, '-')                   // em-dash / en-dash → hyphen
    .replace(/ГОСТ\s*Р\s*/gi, 'ГОСТ Р ')    // normalise ГОСТ Р spacing
    .trim();
}

/**
 * Run alias normalization across `mark` and `gost` fields in material_facts.
 */
async function normalizeAliases(docId: string): Promise<number> {
  const { data: facts, error } = await supabase
    .from('material_facts')
    .select('id, mark, gost')
    .eq('doc_id', docId);

  if (error || !facts || facts.length === 0) return 0;

  let updated = 0;

  for (const fact of facts) {
    const mark = fact.mark as string | null;
    const gost = fact.gost as string | null;

    const updates: Record<string, string> = {};

    // Normalise mark (dimension string)
    if (mark) {
      const normalised = normaliseDimensionString(mark);
      if (normalised !== mark) {
        updates.mark = normalised;
      }
    }

    // Normalise ГОСТ
    if (gost) {
      const normalised = normaliseGost(gost);
      if (normalised !== gost) {
        updates.gost = normalised;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase
        .from('material_facts')
        .update(updates)
        .eq('id', fact.id);

      if (!updateErr) updated++;
    }
  }

  return updated;
}
