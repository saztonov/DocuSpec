import type { ParsedTable, ParsedBlock } from '../types/parser.ts';
import type { MaterialFactItem, GlossaryItem, GlossaryMap, ProductFactItem } from '../types/extraction.ts';
import { ExtractionResponseSchema, GlossaryResponseSchema } from '../types/extraction.ts';
import { classifyTable, isExtractableCategory } from './tableClassifier.ts';
import { generateCanonicalKey } from './canonical.ts';
import { callLlmJson, buildImageMessage } from './llm.ts';
import type { ExtractionLogger } from './extractionLogger.ts';

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

FOR TYPE E (Спецификация элементов фасада/отделки/конструкции — table has TWO name columns):
- If the table has BOTH a "Наименование элементов [фасада/конструкции/...]" column AND a "Наименование материала [отделки/...]" column:
  * "raw_name" = value from "Наименование материала" column (the ACTUAL material)
  * "construction" = value from "Наименование элементов" column (the structural element)
  * "extra_params" = color RAL value if present
  * DO NOT use "Наименование элементов" as raw_name

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

export const FALLBACK_PROMPT_GLOSSARY = `You are analyzing Russian architectural documentation to extract a glossary of all codes, abbreviations, and marks used.

TASK: Scan the provided content and extract all codes/marks/abbreviations with their type classification.

TYPES:
- "assembly" — a finished product/assembly identified by a mark (e.g., ОГ-13, ОГ-14, В-1):
  * Has a numeric suffix after a letter prefix: ОГ-13, ОГ-19, В-1, ЩА-1
  * Listed in "Ведомость изделий/ограждений" sections
  * Appears as a group header in spec tables: "ОГ-13, L=4 700"
  * Counted in whole units (шт) or linear meters (м.п.) as a finished product
- "construction" — a structural element or location code:
  * Appears in Поз. column of facade/floor/finish specifications
  * Examples: Фпод.п-1, Фр-1, Фст-1, Н4, ОС-1
  * Represents a location/zone, NOT a product
- "material" — a raw material code (rare; usually materials have full names)
- "location" — a room or zone identifier (e.g., А1-1, Зал №3)
- "color" — a color standard code (e.g., RAL 9001, RAL-8002, RAL 8002)

RULES:
1. Only extract CODES/ABBREVIATIONS, NOT full material names like "Облицовочный натуральный камень".
2. A code typically matches: [2-5 Cyrillic/Latin letters][optional ./-][digits] OR "RAL [digits]".
3. Include each code only ONCE (deduplicate).
4. For assemblies: use base mark WITHOUT dimensions (ОГ-13, NOT "ОГ-13, L=4 700").
5. Return ONLY valid JSON. No text, no markdown, no explanation outside JSON.

Return exactly this format:
{"glossary": [{"code": "ОГ-13", "item_type": "assembly", "description": "Стальное ограждение"}, {"code": "RAL 9001", "item_type": "color", "description": "Кремово-белый"}]}

If no codes found: {"glossary": []}`;

export function buildUserPrompt(block: ParsedBlock, pageNo: number, sectionContext: string | null): string {
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
 * Works best for material_qty, element_spec and spec_elements tables.
 * assembly_spec is handled separately via extractAssemblySpec.
 */
export function ruleBasedExtract(block: ParsedBlock): MaterialFactItem[] {
  const results: MaterialFactItem[] = [];

  for (const table of block.tables) {
    const category = classifyTable(table);
    if (!isExtractableCategory(category)) continue;
    if (category === 'assembly_spec') continue; // handled by extractAssemblySpec

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

  // Приоритет: если есть колонка "материал отделки" / "наименование материала" —
  // она является raw_name, а "наименование элементов" становится construction.
  const materialColIdx = findColumnIndex(table.headers, 'наименование материала', 'материал отделки', 'материала отделки');
  const elementColIdx = materialColIdx !== -1
    ? findColumnIndex(table.headers, 'наименование элементов', 'наименование элемент', 'элементов фасада', 'элементов конструк')
    : -1;

  const nameIdx = materialColIdx !== -1
    ? materialColIdx
    : findColumnIndex(table.headers, 'наименование', 'назначение');

  const descIdx = findColumnIndex(table.headers, 'описание');
  const qtyIdx = findQtyColumnIndex(table.headers);
  const noteIdx = findColumnIndex(table.headers, 'примечание');

  // Если есть отдельная колонка эталона цвета / RAL
  const colorColIdx = findColumnIndex(table.headers, 'эталон', 'цвет', 'ral', 'колер');

  const primaryNameIdx = nameIdx !== -1 ? nameIdx : designationIdx;
  if (primaryNameIdx === -1) return results;

  // Парсим quantity+unit из одной ячейки (например "10,5 м 2")
  for (const row of table.rows) {
    let rawName = row[primaryNameIdx]?.trim();
    if (!rawName || rawName.length < 3) continue;

    const mark = posIdx !== -1 ? row[posIdx]?.trim() || null : null;

    // construction: элемент/конструкция (колонка elementColIdx, если есть)
    const constructionFromCol = elementColIdx !== -1 ? row[elementColIdx]?.trim() || null : null;

    // Количество: сначала ищем через qtyIdx, потом — через parseQtyWithUnit по всем ячейкам
    let quantity = qtyIdx !== -1 ? parseRussianNumber(row[qtyIdx]) : null;
    let unit: string | null = null;

    if (quantity === null && qtyIdx !== -1) {
      const parsed = parseQtyWithUnit(row[qtyIdx] || '');
      if (parsed.qty !== null) { quantity = parsed.qty; unit = parsed.unit; }
    }

    // Пробуем извлечь qty+unit из каждой ячейки кроме имени
    if (quantity === null) {
      for (let ci = 0; ci < row.length; ci++) {
        if (ci === primaryNameIdx || ci === posIdx || ci === noteIdx || ci === colorColIdx) continue;
        const parsed = parseQtyWithUnit(row[ci] || '');
        if (parsed.qty !== null) { quantity = parsed.qty; unit = parsed.unit; break; }
      }
    }

    const note = noteIdx !== -1 ? row[noteIdx]?.trim() || null : null;
    const designation = designationIdx !== -1 && designationIdx !== primaryNameIdx
      ? row[designationIdx]?.trim() || null
      : null;
    const descText = descIdx !== -1 ? row[descIdx]?.trim() || null : null;
    const colorText = colorColIdx !== -1 ? row[colorColIdx]?.trim() || null : null;

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
      construction: constructionFromCol ?? undefined,
      extra_params: colorText ?? undefined,
      quantity,
      unit: unit || 'шт',
      mark,
      gost: extractGost(rawName + ' ' + (designation || '') + ' ' + (note || '')),
      description: descText || designation,
      note,
      source_snippet: buildSnippet(rawName, quantity, unit || 'шт'),
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
  logger?: ExtractionLogger,
  phase?: string,
): Promise<Map<string, MaterialFactItem[]>> {
  const results = new Map<string, MaterialFactItem[]>();

  for (let i = 0; i < blocks.length; i++) {
    const { block, pageNo, blockDbId, sectionContext } = blocks[i];

    const userPrompt = buildUserPrompt(block, pageNo, sectionContext);

    try {
      const response = await callLlmJson({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        model,
      });

      const parsed = JSON.parse(response.content);
      const validated = ExtractionResponseSchema.parse(parsed);

      const validItems = validated.items.filter(item => item.source_snippet);
      const droppedBySnippet = validated.items.filter(item => !item.source_snippet);

      for (const item of validItems) {
        item.canonical_key = generateCanonicalKey(item.canonical_name || item.raw_name);
      }

      results.set(blockDbId, validItems);

      logger?.logLlmCall(
        block.uid, 'TEXT', phase ?? '',
        Object.keys(parsed), validItems.length,
        response.usage ?? null, response.hasImage, response.durationMs,
      );

      logger?.logLlmCallDetailed({
        blockUid: block.uid,
        blockType: 'TEXT',
        phase: phase ?? '',
        systemPrompt,
        userPrompt,
        rawResponse: response.content,
        parsedItemsCount: validated.items.length,
        validItemsCount: validItems.length,
        droppedItems: droppedBySnippet.map(item => ({ raw_name: item.raw_name, reason: 'no_source_snippet' })),
        responseKeys: Object.keys(parsed),
        usage: response.usage ?? null,
        hasImage: response.hasImage,
        durationMs: response.durationMs,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`LLM extraction failed for block ${block.uid}:`, err);
      results.set(blockDbId, []);
      logger?.logLlmError(block.uid, 'TEXT', phase ?? '', errMsg, systemPrompt, userPrompt);
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
  logger?: ExtractionLogger,
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
    const droppedBySnippet = validated.items.filter(item => !item.source_snippet);

    for (const item of validItems) {
      item.canonical_key = generateCanonicalKey(item.canonical_name || item.raw_name);
    }

    logger?.logLlmCall(
      block.uid, 'IMAGE', 'Фаза 3',
      Object.keys(parsed), validItems.length,
      response.usage ?? null, !!imageUrl, response.durationMs,
    );

    logger?.logLlmCallDetailed({
      blockUid: block.uid,
      blockType: 'IMAGE',
      phase: 'Фаза 3',
      systemPrompt,
      userPrompt: textContent,
      rawResponse: response.content,
      parsedItemsCount: validated.items.length,
      validItemsCount: validItems.length,
      droppedItems: droppedBySnippet.map(item => ({ raw_name: item.raw_name, reason: 'no_source_snippet' })),
      responseKeys: Object.keys(parsed),
      usage: response.usage ?? null,
      hasImage: !!imageUrl,
      durationMs: response.durationMs,
    });

    return validItems;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`LLM image extraction failed for block ${blockDbId}:`, err);
    logger?.logLlmError(block.uid, 'IMAGE', 'Фаза 3', errMsg, systemPrompt, textContent);
    return [];
  }
}

// ── Assembly spec extraction (produces materials + products) ──

/**
 * Assembly header pattern: строка вида "ОГ-13, L=4 700" или просто "ОГ-13" в позиционной колонке.
 */
function isAssemblyHeader(mark: string | null, name: string | null, glossaryMap: GlossaryMap): boolean {
  // Проверка через глоссарий (наиболее надёжно)
  if (mark && glossaryMap.has(mark)) {
    return glossaryMap.get(mark)!.item_type === 'assembly';
  }
  // Паттерн: "ОГ-13, L=4 700" или имя совпадает с маркой+размером
  const combined = [mark, name].filter(Boolean).join(' ');
  return /^[А-ЯA-Z]{1,4}-\d+(?:\.\d+)?,?\s*(?:L|Н|B)=/i.test(combined.trim());
}

export interface AssemblySpecResult {
  materials: MaterialFactItem[];
  products: ProductFactItem[];
}

/**
 * Extract assembly specs: assembly headers → ProductFactItem,
 * component rows under each header → MaterialFactItem with construction=assembly_mark.
 */
export function extractAssemblySpec(table: ParsedTable, glossaryMap: GlossaryMap): AssemblySpecResult {
  const materials: MaterialFactItem[] = [];
  const products: ProductFactItem[] = [];

  const posIdx = findColumnIndex(table.headers, 'поз');
  const nameIdx = findColumnIndex(table.headers, 'наименование', 'назначение', 'обозначение');
  const qtyIdx = findQtyColumnIndex(table.headers);
  const noteIdx = findColumnIndex(table.headers, 'примечание');

  if (nameIdx === -1 && posIdx === -1) return { materials, products };

  let currentAssemblyMark: string | null = null;

  for (const row of table.rows) {
    const mark = posIdx !== -1 ? row[posIdx]?.trim() || null : null;
    const name = nameIdx !== -1 ? row[nameIdx]?.trim() || null : null;
    const note = noteIdx !== -1 ? row[noteIdx]?.trim() || null : null;
    const quantity = qtyIdx !== -1 ? parseRussianNumber(row[qtyIdx]) : null;

    if (!name && !mark) continue;

    if (isAssemblyHeader(mark, name, glossaryMap)) {
      // Сохраняем изделие
      const assemblyMark = mark || name!.split(',')[0].trim();
      const assemblyDesc = name && name !== assemblyMark ? name : null;
      currentAssemblyMark = assemblyMark;
      void assemblyDesc; // сохраняется в product.assembly_name ниже

      products.push({
        assembly_mark: assemblyMark,
        assembly_name: assemblyDesc,
        canonical_key: generateCanonicalKey(assemblyMark),
        quantity,
        unit: 'шт',
        description: note,
        note: null,
        source_snippet: `${assemblyMark}${quantity !== null ? ` | ${quantity} шт` : ''}`,
        confidence: 0.9,
      });
    } else if (name && name.length >= 3) {
      // Строка-компонент — сохраняем как материал
      let qty = quantity;
      let unit: string | null = null;
      if (qty === null && qtyIdx !== -1) {
        const parsed = parseQtyWithUnit(row[qtyIdx] || '');
        if (parsed.qty !== null) { qty = parsed.qty; unit = parsed.unit; }
      }

      materials.push({
        raw_name: name,
        canonical_name: name,
        canonical_key: generateCanonicalKey(name),
        construction: currentAssemblyMark ?? undefined,
        quantity: qty,
        unit: unit || 'шт',
        mark,
        gost: extractGost(name + ' ' + (note || '')),
        description: null,
        note,
        source_snippet: buildSnippet(name, qty, unit || 'шт'),
        confidence: 0.9,
      });
    }
  }

  return { materials, products };
}

// ── LLM Glossary extraction (Pass 0) ──

/**
 * Extract glossary from a chunk of document content using LLM.
 */
export async function llmExtractGlossary(
  contentChunks: string[],
  systemPrompt: string,
  model?: string,
  logger?: ExtractionLogger,
): Promise<GlossaryItem[]> {
  const allItems: GlossaryItem[] = [];
  const seenCodes = new Set<string>();

  for (let ci = 0; ci < contentChunks.length; ci++) {
    const chunk = contentChunks[ci];
    const chunkLabel = `chunk_${ci + 1}/${contentChunks.length}`;
    try {
      const response = await callLlmJson({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chunk },
        ],
        temperature: 0.1,
        model,
      });

      const parsed = JSON.parse(response.content);
      const validated = GlossaryResponseSchema.parse(parsed);

      let chunkNewCodes = 0;
      for (const item of validated.glossary) {
        if (!seenCodes.has(item.code)) {
          seenCodes.add(item.code);
          allItems.push(item);
          chunkNewCodes++;
        }
      }

      logger?.logLlmCall(
        chunkLabel, 'glossary', 'Pass 0',
        Object.keys(parsed), chunkNewCodes,
        response.usage ?? null, false, response.durationMs,
      );

      logger?.logLlmCallDetailed({
        blockUid: chunkLabel,
        blockType: 'glossary',
        phase: 'Pass 0',
        systemPrompt,
        userPrompt: chunk,
        rawResponse: response.content,
        parsedItemsCount: validated.glossary.length,
        validItemsCount: chunkNewCodes,
        droppedItems: [],
        responseKeys: Object.keys(parsed),
        usage: response.usage ?? null,
        hasImage: false,
        durationMs: response.durationMs,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Glossary extraction chunk failed:', err);
      logger?.logLlmError(chunkLabel, 'glossary', 'Pass 0', errMsg, systemPrompt, chunk);
    }

    if (ci < contentChunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return allItems;
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
