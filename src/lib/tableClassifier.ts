import type { TableCategory } from '../types/extraction.ts';
import type { ParsedTable } from '../types/parser.ts';

/**
 * Classify a parsed markdown table by its column headers.
 * Returns a category that determines extraction strategy.
 */
export function classifyTable(table: ParsedTable): TableCategory {
  const h = table.headers.map(s => s.toLowerCase().trim());
  const joined = h.join(' ');

  // Change log tables — skip
  if (h.some(x => x.includes('изм')) && h.some(x => x.includes('подп') || x.includes('дата'))) {
    return 'change_log';
  }

  // Room schedule — skip (экспликация помещений)
  if (
    h.some(x => x.includes('№ пом') || x.includes('номер пом')) &&
    h.some(x => x.includes('площадь'))
  ) {
    return 'room_schedule';
  }

  // Direct material quantity tables: Наименование + Количество + Ед.изм.
  if (
    h.some(x => x.includes('наименование')) &&
    h.some(x => x.includes('количество') || x.includes('кол-во') || x.includes('кол')) &&
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

  // Spec elements: Поз. + Обозначение + Наименование + Кол-во (doors, hatches, railings)
  if (
    h.some(x => x.includes('поз')) &&
    h.some(x => x.includes('обозначение') || x.includes('наименование')) &&
    h.some(x => x.includes('кол'))
  ) {
    return 'spec_elements';
  }

  // Element spec: Марка + Описание/Наименование + Кол-во (drainage, ventilation grilles)
  if (
    h.some(x => x.includes('марка')) &&
    h.some(x => x.includes('кол') || x.includes('шт'))
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
  return category !== 'change_log' && category !== 'room_schedule';
}
