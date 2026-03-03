import type { TableCategory } from '../types/extraction.ts';
import type { ParsedTable } from '../types/parser.ts';

/**
 * Check if a column header represents a quantity column.
 * Avoids false positives like "колера" (color) matching "кол".
 */
function isQtyHeader(col: string): boolean {
  return col.includes('количество') || col.includes('кол-во') ||
    col.includes('кол.шт') || col.includes('кол. шт') ||
    (col.includes('кол.') && !col.includes('колер') && !col.includes('колон')) ||
    /\bкол\b/.test(col);
}

/**
 * Classify a parsed markdown table by its column headers.
 * Returns a category that determines extraction strategy.
 */
export function classifyTable(table: ParsedTable): TableCategory {
  const h = table.headers.map(s => s.toLowerCase().trim());
  const joined = h.join(' ');
  const sectionLower = (table.sectionContext || '').toLowerCase();

  // Change log tables — skip
  if (h.some(x => x.includes('изм')) && h.some(x => x.includes('подп') || x.includes('дата'))) {
    return 'change_log';
  }

  // Сводная ведомость материалов / Ведомость материалов — detect by section context first
  if (
    sectionLower.includes('ведомость материалов') ||
    sectionLower.includes('сводная ведомость материалов')
  ) {
    return 'vedomost_materialov';
  }

  // Ведомость изделий / Ведомость ограждений — assemblies, not individual materials
  if (
    sectionLower.includes('ведомость изделий') ||
    sectionLower.includes('ведомость ограждений') ||
    sectionLower.includes('ведомость заполнен') ||
    sectionLower.includes('ведомость дверей') ||
    sectionLower.includes('ведомость окон') ||
    sectionLower.includes('ведомость витражей') ||
    sectionLower.includes('ведомость перегородок')
  ) {
    return 'vedomost_izdelij';
  }

  // Спецификация элементов сборок (ограждений, конструкций) — иерархические таблицы,
  // где строки-заголовки являются сборными единицами, а подстроки — их компонентами.
  // Детектируется по секции "спецификация элементов ограждений" / "спецификация ограждений"
  if (
    sectionLower.includes('спецификация элементов ограждений') ||
    sectionLower.includes('спецификация ограждений')
  ) {
    return 'assembly_spec';
  }

  // Room schedule — skip (экспликация помещений)
  if (
    h.some(x => x.includes('№ пом') || x.includes('номер пом')) &&
    h.some(x => x.includes('площадь'))
  ) {
    return 'room_schedule';
  }

  // Reference documents (ведомость ссылочных/прилагаемых документов, ведомость нормативных) — skip
  // Headers like: Обозначение | Наименование | Примечание (without quantity columns)
  // Also matches via section context keywords
  const hasDesignation = h.some(x => x.includes('обозначение'));
  const hasName = h.some(x => x.includes('наименование'));
  const hasQtyLike = h.some(x =>
    isQtyHeader(x) ||
    x.includes('объем') || x.includes('объём') || x.includes('площадь')
  );
  const isRefByContext = sectionLower.includes('ссылочн') || sectionLower.includes('прилагаем') ||
    sectionLower.includes('нормативн');

  if (hasDesignation && hasName && !hasQtyLike && isRefByContext) {
    return 'reference_docs';
  }

  // Broader reference_docs detection: Обозначение + Наименование + Примечание, no quantity columns,
  // and content looks like normative docs (ГОСТ, СП, etc.)
  const hasNote = h.some(x => x.includes('примечание'));
  if (hasDesignation && hasName && !hasQtyLike && hasNote && h.length <= 4) {
    return 'reference_docs';
  }

  // Drawing/sheet list (ведомость рабочих чертежей, ведомость спецификаций, ведомость основных комплектов) — skip
  // Headers like: № Листа | Наименование | Примечание
  const hasSheetNo = h.some(x => x.includes('№ листа') || x.includes('лист'));
  const isDrawingByContext = sectionLower.includes('ведомость рабочих чертежей') ||
    sectionLower.includes('ведомость спецификаций') ||
    sectionLower.includes('ведомость основных комплект');

  if (hasSheetNo && hasName && !hasQtyLike) {
    return 'drawing_list';
  }
  if (isDrawingByContext && hasName && !hasQtyLike) {
    return 'drawing_list';
  }

  // Direct material quantity tables: Наименование + Количество + Ед.изм.
  if (
    h.some(x => x.includes('наименование')) &&
    h.some(x => isQtyHeader(x)) &&
    h.some(x => x.includes('ед') || x.includes('изм'))
  ) {
    return 'material_qty';
  }

  // Direct material quantity (variant without explicit unit column)
  if (
    h.some(x => x.includes('наименование')) &&
    h.some(x => x.includes('количество'))
  ) {
    return 'material_qty';
  }

  // Material quantity with "Объем" column (Сводная ведомость материалов)
  if (
    h.some(x => x.includes('наименование')) &&
    h.some(x => x.includes('объем') || x.includes('объём'))
  ) {
    return 'material_qty';
  }

  // Spec elements: Поз. + Обозначение + Наименование + Кол-во (doors, hatches, railings)
  if (
    h.some(x => x.includes('поз')) &&
    h.some(x => x.includes('обозначение') || x.includes('наименование')) &&
    h.some(x => isQtyHeader(x))
  ) {
    return 'spec_elements';
  }

  // Element spec: Марка + Описание/Наименование + Кол-во (drainage, ventilation grilles)
  if (
    h.some(x => x.includes('марка')) &&
    h.some(x => isQtyHeader(x) || x.includes('шт'))
  ) {
    return 'element_spec';
  }

  // Floor spec: Тип пола + Данные элементов + Площадь
  if (
    joined.includes('тип пола') ||
    (h.some(x => x.includes('пол')) && h.some(x => x.includes('данные элементов')))
  ) {
    return 'floor_spec';
  }

  // Roof spec: Тип покрытия + Данные элементов
  if (
    joined.includes('тип покрытия') ||
    joined.includes('покрыт') && h.some(x => x.includes('данные элементов'))
  ) {
    return 'roof_spec';
  }

  // Spec elements (broader): has Поз and Наименование
  if (
    h.some(x => x.includes('поз')) &&
    h.some(x => x.includes('наименование') || x.includes('назначение'))
  ) {
    return 'spec_elements';
  }

  return 'unknown';
}

/**
 * Check if a table category should be extracted for materials.
 */
export function isExtractableCategory(category: TableCategory): boolean {
  return category !== 'change_log' && category !== 'room_schedule' &&
    category !== 'reference_docs' && category !== 'drawing_list' &&
    category !== 'vedomost_izdelij';
}

/**
 * Check if a category is an assembly specification (produces both material_facts and product_facts).
 */
export function isAssemblySpec(category: TableCategory): boolean {
  return category === 'assembly_spec';
}

/**
 * Check if a category is a "ведомость материалов" (highest priority, phase 1).
 */
export function isVedomostMaterialov(category: TableCategory): boolean {
  return category === 'vedomost_materialov' || category === 'material_qty';
}
