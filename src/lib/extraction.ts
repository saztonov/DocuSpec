import type { ParsedTable, ParsedBlock } from '../types/parser.ts';
import type { MaterialFactItem } from '../types/extraction.ts';
import { ExtractionResponseSchema } from '../types/extraction.ts';
import { classifyTable, isExtractableCategory } from './tableClassifier.ts';
import { generateCanonicalKey } from './canonical.ts';
import { callLlmJson } from './llm.ts';

// ── Prompts ──

const SYSTEM_PROMPT = `You are a construction BOM (Bill of Materials) extractor for Russian architectural documentation.
Your task is to extract materials, elements, and quantities from the provided text/table content.

RULES:
1. Extract ONLY materials/elements explicitly mentioned in the provided content.
2. DO NOT invent or hallucinate materials not present in the source.
3. Return a JSON object with key "items" containing an array of extracted materials.
4. Each item must include source_snippet — an exact quote from the source text that proves this material exists.
5. If the content contains no materials or construction elements, return {"items": []}.
6. Fix common OCR errors: "спилобата" → "стилобата", "Tun" → "Тип", "опм." → "отм."
7. For canonical_name: normalize the material name (fix typos, standardize, remove "или аналог").
8. For canonical_key: create a lowercase Latin slug (transliterate Russian, replace spaces with underscores).
9. Parse Russian numeric format: "202,6" means 202.6; "1 692,9" means 1692.9.
10. Unit should be standardized: м2, м3, шт, м.п., кг, т, л, компл.
11. "мм" is a THICKNESS, not a quantity unit. Do NOT use "мм" as unit. If a material only has a thickness (e.g. "100мм", "150мм"), set quantity to null and mention the thickness in the description field.
12. DO NOT extract normative documents (ГОСТ, СП, СНиП, Федеральный закон, Постановление) as materials. These are references, not construction materials.
13. If the content is a legend/conditional notation block ("Условные обозначения") that describes material types without explicit quantities — set quantity to null for each material.
14. For tables with grouped rows (e.g. railing specifications with group headers like "ОГ-13, L=4 700" followed by component rows), extract BOTH the group header as a separate item (with its quantity) AND each component row.
15. DO NOT extract materials that are only mentioned as references to other sections (phrases like "см. раздел", "см. лист", "см. 133/23-...", "детализация ... см."). These are cross-references, not material quantities.
16. DO NOT extract section headers, category names, or generic grouping titles as materials (e.g. "Элементы фасада", "Ограждения лестниц", "Перегородки", "Поручни"). Only extract specific, named materials.
17. DO NOT extract element marks/labels from drawings (e.g. "ДВ20-1Л", "ЛП1", "НП5", "ОГ-14", "Стремянка", "Люк-лаз") as materials unless they appear in a specification table with explicit quantities.
18. DO NOT extract materials from general notes or instructions that describe material TYPES or PROPERTIES without specifying construction quantities (e.g. "стены выполнены из блоков D600" without an area or volume value).

Each item in the "items" array must have this structure:
{
  "raw_name": "exact name from document",
  "canonical_name": "normalized Russian name",
  "canonical_key": "latin_slug_key",
  "quantity": 123.4 or null,
  "unit": "м2" or null,
  "mark": "position/mark identifier" or null,
  "gost": "ГОСТ reference" or null,
  "description": "additional description" or null,
  "note": "remarks" or null,
  "source_snippet": "exact quote from source proving this item exists",
  "confidence": 0.9
}`;

function buildUserPrompt(block: ParsedBlock, pageNo: number, sectionContext: string | null): string {
  let prompt = `Page: ${pageNo}\nBlock ID: ${block.uid}\n`;
  if (sectionContext) {
    prompt += `Section: ${sectionContext}\n`;
  }
  prompt += `\nContent:\n${block.content}`;
  return prompt;
}

// ── Rule-based extraction ──

/**
 * Extract materials from structured tables without LLM.
 * Works best for material_qty and element_spec tables.
 */
export function ruleBasedExtract(block: ParsedBlock): MaterialFactItem[] {
  const results: MaterialFactItem[] = [];

  for (const table of block.tables) {
    const category = classifyTable(table);
    if (!isExtractableCategory(category)) continue;

    if (category === 'material_qty') {
      results.push(...extractMaterialQty(table));
    } else if (category === 'element_spec') {
      results.push(...extractElementSpec(table));
    } else if (category === 'spec_elements') {
      results.push(...extractSpecElements(table));
    }
  }

  return results;
}

function findColumnIndex(headers: string[], ...keywords: string[]): number {
  const h = headers.map(s => s.toLowerCase().trim());
  for (const kw of keywords) {
    const idx = h.findIndex(col => col.includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Find quantity column index — more precise than generic findColumnIndex
 * to avoid false positives like "колера" matching "кол".
 */
function findQtyColumnIndex(headers: string[]): number {
  const h = headers.map(s => s.toLowerCase().trim());
  // Try exact/specific patterns first, then broader ones
  const patterns = [
    (col: string) => col.includes('количество'),
    (col: string) => col.includes('кол-во'),
    (col: string) => col.includes('кол.шт') || col.includes('кол. шт'),
    (col: string) => col.includes('кол.') && !col.includes('колер') && !col.includes('колон'),
    (col: string) => /\bкол\b/.test(col),  // "кол" as a standalone word
    (col: string) => col.includes('объем') || col.includes('объём'),
  ];
  for (const pattern of patterns) {
    const idx = h.findIndex(pattern);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseRussianNumber(text: string): number | null {
  if (!text || text.trim() === '' || text.trim() === '-') return null;
  // Remove spaces (thousand separators), replace comma with dot
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse a cell value that contains both number and unit, e.g. "10,5 м 2" → { qty: 10.5, unit: "м2" }
 * Handles OCR artifacts like "м 2" (space between м and 2).
 */
function parseQtyWithUnit(text: string): { qty: number | null; unit: string | null } {
  if (!text || text.trim() === '' || text.trim() === '-') return { qty: null, unit: null };

  // Note: мм (millimeters) is intentionally excluded — it represents thickness, not quantity
  const match = text.trim().match(/^(\d[\d\s]*[,.]?\d*)\s*(м\s*\.?\s*п\.?|м\s*[23]|шт|кг|т|л|компл\.?|слоя?)\s*$/i);
  if (match) {
    const numStr = match[1].replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(numStr);
    const unit = match[2].replace(/\s/g, '');
    return { qty: isNaN(num) ? null : num, unit };
  }

  return { qty: null, unit: null };
}

/**
 * Extract unit from a column header like "Объем, м 3" → "м3", "Площадь, м 2" → "м2"
 */
function extractUnitFromHeader(header: string): string | null {
  const match = header.match(/,\s*(м\s*[23]|шт|м\.?п\.?|кг|т|л|компл)/i);
  if (match) return match[1].replace(/\s/g, '');
  return null;
}

function extractMaterialQty(table: ParsedTable): MaterialFactItem[] {
  const results: MaterialFactItem[] = [];
  const nameIdx = findColumnIndex(table.headers, 'наименование');
  const qtyIdx = findQtyColumnIndex(table.headers);
  const unitIdx = findColumnIndex(table.headers, 'ед.изм', 'ед.', 'ед');

  if (nameIdx === -1) return results;

  // Try extracting unit from quantity column header (e.g. "Объем, м 3")
  const headerUnit = qtyIdx !== -1 ? extractUnitFromHeader(table.headers[qtyIdx]) : null;

  for (const row of table.rows) {
    const rawName = row[nameIdx]?.trim();
    if (!rawName) continue;

    let quantity = qtyIdx !== -1 ? parseRussianNumber(row[qtyIdx]) : null;
    let unit = unitIdx !== -1 ? (row[unitIdx]?.trim() || null) : headerUnit;

    // If no dedicated qty/unit columns, scan all cells for combined "number + unit" values
    if (quantity === null && unit === null) {
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === nameIdx) continue; // Skip name column
        const parsed = parseQtyWithUnit(row[ci]);
        if (parsed.qty !== null) {
          quantity = parsed.qty;
          unit = parsed.unit;
          break;
        }
      }
    }

    // If unit column exists but contains combined value (e.g. "10,5 м 2")
    if (quantity === null && unitIdx !== -1) {
      const parsed = parseQtyWithUnit(row[unitIdx]);
      if (parsed.qty !== null) {
        quantity = parsed.qty;
        unit = parsed.unit;
      }
    }

    // "мм" is thickness, not a quantity unit — move to description
    let description: string | null = null;
    if (unit && /^мм$/i.test(unit.trim())) {
      description = quantity !== null ? `толщина ${quantity} мм` : null;
      quantity = null;
      unit = null;
    }

    // Skip section headers (rows where name exists but qty and unit are empty)
    // These are like "K6", "K6.1" etc.
    if (quantity === null && !unit && rawName.length < 10 && /^[A-Za-zА-Яа-я0-9.]+$/.test(rawName)) {
      continue;
    }

    // Skip rows with very short/truncated names (OCR artifacts)
    if (rawName.length < 3) continue;

    results.push({
      raw_name: rawName,
      canonical_name: rawName,
      canonical_key: generateCanonicalKey(rawName),
      quantity,
      unit,
      mark: null,
      gost: extractGost(rawName),
      description,
      note: null,
      source_snippet: buildSnippet(rawName, quantity, unit),
      confidence: 0.95,
    });
  }

  return results;
}

function extractElementSpec(table: ParsedTable): MaterialFactItem[] {
  const results: MaterialFactItem[] = [];
  const markIdx = findColumnIndex(table.headers, 'марка');
  const descIdx = findColumnIndex(table.headers, 'описание', 'наименование');
  const qtyIdx = findQtyColumnIndex(table.headers) !== -1 ? findQtyColumnIndex(table.headers) : findColumnIndex(table.headers, 'шт');
  const noteIdx = findColumnIndex(table.headers, 'примечание');

  if (descIdx === -1 && markIdx === -1) return results;

  for (const row of table.rows) {
    const mark = markIdx !== -1 ? row[markIdx]?.trim() || null : null;
    const desc = descIdx !== -1 ? row[descIdx]?.trim() : null;
    const rawName = desc || mark || '';
    if (!rawName || rawName.length < 3) continue;

    const quantity = qtyIdx !== -1 ? parseRussianNumber(row[qtyIdx]) : null;
    const note = noteIdx !== -1 ? row[noteIdx]?.trim() || null : null;

    results.push({
      raw_name: rawName,
      canonical_name: rawName,
      canonical_key: generateCanonicalKey(rawName),
      quantity,
      unit: 'шт',
      mark,
      gost: extractGost(rawName + ' ' + (note || '')),
      description: note !== rawName ? note : null,
      note: null,
      source_snippet: buildSnippet(rawName, quantity, 'шт'),
      confidence: 0.9,
    });
  }

  return results;
}

/** Generic names that should be replaced by the description column if available */
const GENERIC_NAMES = ['инд. изготовления', 'инд.изготовления', 'индивидуальный', 'по проекту', 'по месту'];

function extractSpecElements(table: ParsedTable): MaterialFactItem[] {
  const results: MaterialFactItem[] = [];
  const posIdx = findColumnIndex(table.headers, 'поз');
  const designationIdx = findColumnIndex(table.headers, 'обозначение');
  const nameIdx = findColumnIndex(table.headers, 'наименование', 'назначение');
  const descIdx = findColumnIndex(table.headers, 'описание');
  const qtyIdx = findQtyColumnIndex(table.headers);
  const noteIdx = findColumnIndex(table.headers, 'примечание');

  const primaryNameIdx = nameIdx !== -1 ? nameIdx : designationIdx;
  if (primaryNameIdx === -1) return results;

  for (const row of table.rows) {
    let rawName = row[primaryNameIdx]?.trim();
    if (!rawName || rawName.length < 3) continue;

    const mark = posIdx !== -1 ? row[posIdx]?.trim() || null : null;
    const quantity = qtyIdx !== -1 ? parseRussianNumber(row[qtyIdx]) : null;
    const note = noteIdx !== -1 ? row[noteIdx]?.trim() || null : null;
    const designation = designationIdx !== -1 && designationIdx !== primaryNameIdx
      ? row[designationIdx]?.trim() || null
      : null;
    const descText = descIdx !== -1 ? row[descIdx]?.trim() || null : null;

    // If the name column is generic (e.g. "Инд. изготовления") and there's a description
    // column with a more specific name, use the description as the canonical name
    let canonicalName = rawName;
    if (GENERIC_NAMES.includes(rawName.toLowerCase()) && descText && descText.length > 3) {
      canonicalName = descText;
    }
    // Also incorporate mark into raw_name for uniqueness if mark is present and name is generic
    if (GENERIC_NAMES.includes(rawName.toLowerCase()) && mark) {
      rawName = `${mark} — ${canonicalName}`;
    }

    results.push({
      raw_name: rawName,
      canonical_name: canonicalName,
      canonical_key: generateCanonicalKey(canonicalName),
      quantity,
      unit: 'шт',
      mark,
      gost: extractGost(rawName + ' ' + (designation || '') + ' ' + (note || '')),
      description: descText || designation,
      note,
      source_snippet: buildSnippet(rawName, quantity, 'шт'),
      confidence: 0.9,
    });
  }

  return results;
}

function extractGost(text: string): string | null {
  const match = text.match(/(?:ГОСТ|GOST)\s*(?:Р\s*)?[\d.\-]+(?:\s*[\-–]\s*\d+)?/i);
  return match ? match[0] : null;
}

function buildSnippet(name: string, qty: number | null, unit: string | null): string {
  let s = name;
  if (qty !== null) s += ` | ${qty}`;
  if (unit) s += ` ${unit}`;
  return s;
}

// ── LLM extraction ──

export interface BlockForExtraction {
  block: ParsedBlock;
  pageNo: number;
  blockDbId: string;
  sectionContext: string | null;
}

/**
 * Extract materials from a batch of blocks using LLM.
 * Each block is sent individually to get best results.
 */
export async function llmExtractBatch(
  blocks: BlockForExtraction[],
  onProgress?: (completed: number, total: number) => void,
  model?: string,
): Promise<Map<string, MaterialFactItem[]>> {
  const results = new Map<string, MaterialFactItem[]>();

  for (let i = 0; i < blocks.length; i++) {
    const { block, pageNo, blockDbId, sectionContext } = blocks[i];

    try {
      const response = await callLlmJson({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(block, pageNo, sectionContext) },
        ],
        temperature: 0.1,
        model,
      });

      const parsed = JSON.parse(response.content);
      const validated = ExtractionResponseSchema.parse(parsed);

      // Filter out items without source_snippet
      const validItems = validated.items.filter(item => item.source_snippet);

      // Always regenerate canonical_key using our transliteration to ensure consistency.
      // LLM-generated keys use different transliteration (e.g. й→j vs й→y) causing duplicates.
      for (const item of validItems) {
        item.canonical_key = generateCanonicalKey(item.canonical_name || item.raw_name);
      }

      results.set(blockDbId, validItems);
    } catch (err) {
      console.error(`LLM extraction failed for block ${block.uid}:`, err);
      results.set(blockDbId, []);
    }

    onProgress?.(i + 1, blocks.length);

    // Пауза между запросами, чтобы не упираться в rate limit
    if (i < blocks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

// ── Merge and dedup ──

/**
 * Merge rule-based and LLM results, deduplicating by normalized name + qty + unit.
 */
export function mergeResults(
  ruleBased: MaterialFactItem[],
  llmItems: MaterialFactItem[],
): MaterialFactItem[] {
  const seen = new Set<string>();
  const merged: MaterialFactItem[] = [];

  // Add rule-based first (higher confidence for structured tables)
  for (const item of ruleBased) {
    const key = dedupKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  // Add LLM items that weren't already found by rules
  for (const item of llmItems) {
    const key = dedupKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function dedupKey(item: MaterialFactItem): string {
  const name = item.raw_name.toLowerCase().trim();
  const qty = item.quantity !== null ? item.quantity.toString() : '';
  const unit = (item.unit || '').toLowerCase().trim();
  return `${name}|${qty}|${unit}`;
}
