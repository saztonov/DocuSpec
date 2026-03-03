import type { ParsedTable, ParsedBlock } from '../types/parser.ts';
import type { MaterialFactItem } from '../types/extraction.ts';
import { ExtractionResponseSchema } from '../types/extraction.ts';
import { classifyTable, isExtractableCategory } from './tableClassifier.ts';
import { generateCanonicalKey } from './canonical.ts';
import { callLlmJson, buildImageMessage } from './llm.ts';

// ── Fallback prompts (used if DB prompts are unavailable) ──

export const FALLBACK_PROMPT_UNIVERSAL = `You are a construction BOM (Bill of Materials) extractor for Russian architectural documentation.
Your task is to extract materials, components, and quantities from the provided content.

ANALYSE THE CONTENT STRUCTURE FIRST:
Determine what type of content you are looking at:
A) "Ведомость материалов" / "Сводная ведомость материалов" — a material inventory list with quantities
B) "Спецификация элементов" — a specification of assembly components (e.g., each railing ОГ-13 has sub-components)
C) "Ведомость изделий" — an inventory of finished assemblies/products (e.g., list of railings ОГ-13, ОГ-14 with lengths)
D) Other table with materials/quantities

RULES:
1. Extract ONLY materials/elements explicitly mentioned in the content.
2. DO NOT invent or hallucinate materials not present in the source.
3. Fix common OCR errors: "спилобата"→"стилобата", "Tun"→"Тип", "опм."→"отм."
4. For canonical_name: normalize the material name (fix typos, standardize, remove "или аналог").
5. For canonical_key: create a lowercase Latin slug (transliterate Russian, replace spaces with underscores).
6. Parse Russian numeric format: "202,6" means 202.6; "1 692,9" means 1692.9.
7. Unit should be standardized: м2, м3, шт, м.п., кг, т, л, компл.
8. "мм" is a THICKNESS, not a quantity unit — put thickness in description field.
9. DO NOT extract normative documents (ГОСТ, СП, СНиП, ФЗ, Постановление) as materials.
10. DO NOT extract section headers or generic category names.
11. DO NOT extract cross-references (see раздел, см. лист, см. 133/23...).

FOR TYPE C (Ведомость изделий — assemblies like ОГ-13, ОГ-14 with counts/lengths):
- Return {"items": []} — assemblies are NOT individual materials.

FOR TYPE B (Спецификация элементов — components grouped under an assembly):
- "construction" field = the assembly name/mark (e.g., "ОГ-13", "ОГ-14", "Витраж В-1")
- "raw_name" = the component material (e.g., "Стальная труба 30x15x2 мм")
- Group headers like "ОГ-13, L=4 700" are assembly identifiers, NOT materials

FOR TYPES A and D:
- "construction" field = the structural element or location this material belongs to (e.g., "Отделка стены", "Ступень дорожная", "Фпод.п-1"), or null if no clear parent element
- Extract each material row as a separate item

Each item in the "items" array must have this structure:
{
  "raw_name": "exact name from document",
  "canonical_name": "normalized Russian name",
  "canonical_key": "latin_slug_key",
  "construction": "parent assembly or structural element name, or null",
  "extra_params": "color RAL, additional specs, or null",
  "quantity": 123.4 or null,
  "unit": "м2" or null,
  "mark": "position/mark identifier" or null,
  "gost": "ГОСТ reference" or null,
  "description": "thickness or additional description" or null,
  "note": "remarks from примечание column" or null,
  "source_snippet": "exact quote from source proving this item exists",
  "confidence": 0.9
}`;

export const FALLBACK_PROMPT_LAYER_CAKE = `You are extracting construction layer cakes (строительные "пироги") from Russian architectural cross-section drawings.

Your input is a description of a cross-section, section, or detail drawing with text annotations.

TASK: Extract the ordered list of construction layers (пирог) described in the drawing text.

RULES:
1. Look for layer descriptions in "Текст на чертеже:" section — these are the most reliable.
2. A layer description typically includes: material name + thickness (e.g., "Облицовка плитами натурального камня - гранит на клею -20мм").
3. Each layer = one item in the output.
4. "construction" field = the name/identifier of the cross-section (e.g., "Сечение Л7-Л7", "Узел А-А", "Разрез 1-1").
5. "raw_name" = the layer material (e.g., "Облицовка плитами натурального камня - гранит").
6. "description" = thickness if mentioned (e.g., "20 мм").
7. "quantity" = null (layers don't have quantities in cross-sections).
8. "unit" = null.
9. "note" = any reference to another document (e.g., "см. 133/23-ГК-КЖ23").
10. Preserve the layer ORDER as it appears in the drawing (top to bottom or outside to inside).
11. DO NOT extract dimensional annotations, axis labels, or elevation marks as layers.
12. DO NOT extract cross-references to other sheets (люк-лаз, стремянка, etc.) as layers.
13. If no layer cake structure is found (only dimensions/axes), return {"items": []}.
14. If the drawing text is ambiguous and an image is provided, use it to verify the layer sequence.

Each item in the "items" array must have this structure:
{
  "raw_name": "layer material name",
  "canonical_name": "normalized Russian name",
  "canonical_key": "latin_slug_key",
  "construction": "cross-section name from drawing header",
  "extra_params": null,
  "quantity": null,
  "unit": null,
  "mark": null,
  "gost": null,
  "description": "thickness in mm if mentioned, e.g. '20 мм'",
  "note": "reference to other document if any",
  "source_snippet": "exact quote from drawing text",
  "confidence": 0.85
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

    if (category === 'material_qty' || category === 'vedomost_materialov') {
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
  const patterns = [
    (col: string) => col.includes('количество'),
    (col: string) => col.includes('кол-во'),
    (col: string) => col.includes('кол.шт') || col.includes('кол. шт'),
    (col: string) => col.includes('кол.') && !col.includes('колер') && !col.includes('колон'),
    (col: string) => /\bкол\b/.test(col),
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
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse a cell value that contains both number and unit, e.g. "10,5 м 2" → { qty: 10.5, unit: "м2" }
 */
function parseQtyWithUnit(text: string): { qty: number | null; unit: string | null } {
  if (!text || text.trim() === '' || text.trim() === '-') return { qty: null, unit: null };

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
 * Extract unit from a column header like "Объем, м 3" → "м3"
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

  const headerUnit = qtyIdx !== -1 ? extractUnitFromHeader(table.headers[qtyIdx]) : null;

  for (const row of table.rows) {
    const rawName = row[nameIdx]?.trim();
    if (!rawName) continue;

    let quantity = qtyIdx !== -1 ? parseRussianNumber(row[qtyIdx]) : null;
    let unit = unitIdx !== -1 ? (row[unitIdx]?.trim() || null) : headerUnit;

    if (quantity === null && unit === null) {
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === nameIdx) continue;
        const parsed = parseQtyWithUnit(row[ci]);
        if (parsed.qty !== null) {
          quantity = parsed.qty;
          unit = parsed.unit;
          break;
        }
      }
    }

    if (quantity === null && unitIdx !== -1) {
      const parsed = parseQtyWithUnit(row[unitIdx]);
      if (parsed.qty !== null) {
        quantity = parsed.qty;
        unit = parsed.unit;
      }
    }

    let description: string | null = null;
    if (unit && /^мм$/i.test(unit.trim())) {
      description = quantity !== null ? `толщина ${quantity} мм` : null;
      quantity = null;
      unit = null;
    }

    if (quantity === null && !unit && rawName.length < 10 && /^[A-Za-zА-Яа-я0-9.]+$/.test(rawName)) {
      continue;
    }

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

    let canonicalName = rawName;
    if (GENERIC_NAMES.includes(rawName.toLowerCase()) && descText && descText.length > 3) {
      canonicalName = descText;
    }
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
  imageUrl?: string | null;
  sourceSection?: string;
  blockTypeDisplay?: string;
}

/**
 * Extract materials from a batch of TEXT blocks using LLM.
 * Accepts systemPrompt as a parameter (loaded from DB or fallback).
 */
export async function llmExtractBatch(
  blocks: BlockForExtraction[],
  systemPrompt: string,
  onProgress?: (completed: number, total: number) => void,
  model?: string,
): Promise<Map<string, MaterialFactItem[]>> {
  const results = new Map<string, MaterialFactItem[]>();

  for (let i = 0; i < blocks.length; i++) {
    const { block, pageNo, blockDbId, sectionContext } = blocks[i];

    try {
      const response = await callLlmJson({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserPrompt(block, pageNo, sectionContext) },
        ],
        temperature: 0.1,
        model,
      });

      const parsed = JSON.parse(response.content);
      const validated = ExtractionResponseSchema.parse(parsed);

      const validItems = validated.items.filter(item => item.source_snippet);

      for (const item of validItems) {
        item.canonical_key = generateCanonicalKey(item.canonical_name || item.raw_name);
      }

      results.set(blockDbId, validItems);
    } catch (err) {
      console.error(`LLM extraction failed for block ${block.uid}:`, err);
      results.set(blockDbId, []);
    }

    onProgress?.(i + 1, blocks.length);

    if (i < blocks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Extract layer cake from a single IMAGE block (Разрез/Сечение/Узел).
 * Sends text content + optional image URL to LLM.
 */
export async function llmExtractImageBlock(
  blockForExtraction: BlockForExtraction,
  systemPrompt: string,
  model?: string,
): Promise<MaterialFactItem[]> {
  const { block, pageNo, blockDbId, sectionContext, imageUrl } = blockForExtraction;

  const textContent = buildUserPrompt(block, pageNo, sectionContext);

  const messages = imageUrl
    ? [
        { role: 'system' as const, content: systemPrompt },
        buildImageMessage(imageUrl, textContent),
      ]
    : [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: textContent },
      ];

  try {
    const response = await callLlmJson({ messages, temperature: 0.1, model });
    const parsed = JSON.parse(response.content);
    const validated = ExtractionResponseSchema.parse(parsed);

    const validItems = validated.items.filter(item => item.source_snippet);

    for (const item of validItems) {
      item.canonical_key = generateCanonicalKey(item.canonical_name || item.raw_name);
    }

    return validItems;
  } catch (err) {
    console.error(`LLM image extraction failed for block ${blockDbId}:`, err);
    return [];
  }
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

  for (const item of ruleBased) {
    const key = dedupKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

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
