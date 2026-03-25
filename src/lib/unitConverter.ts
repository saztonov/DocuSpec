/**
 * Rule-based конвертер единиц измерения для сметного пайплайна.
 * Пересчитывает количества из единиц документации в единицы расценок ГЭСН.
 */

export interface ConversionResult {
  value: number;
  formula: string;        // "7.13 м3 / 1000 = 0.00713"
  compatible: true;
}

export interface ConversionError {
  compatible: false;
  warning: string;        // "Несовместимые единицы: м3 → тыс.шт"
  suggestedAction?: string;
}

export type ConversionOutcome = ConversionResult | ConversionError;

interface ConversionRule {
  from: string;
  to: string;
  factor: number;
  operation: 'multiply' | 'divide';
}

const CONVERSION_RULES: ConversionRule[] = [
  // Площадь
  { from: 'м2', to: '100 м2', factor: 100, operation: 'divide' },
  { from: 'м2', to: '1000 м2', factor: 1000, operation: 'divide' },
  { from: '100 м2', to: 'м2', factor: 100, operation: 'multiply' },

  // Объём
  { from: 'м3', to: '1000 м3', factor: 1000, operation: 'divide' },
  { from: '1000 м3', to: 'м3', factor: 1000, operation: 'multiply' },

  // Штуки
  { from: 'шт', to: '1000 шт', factor: 1000, operation: 'divide' },
  { from: 'шт', to: '100 шт', factor: 100, operation: 'divide' },
  { from: 'шт', to: 'тыс.шт', factor: 1000, operation: 'divide' },
  { from: '1000 шт', to: 'шт', factor: 1000, operation: 'multiply' },
  { from: 'тыс.шт', to: 'шт', factor: 1000, operation: 'multiply' },

  // Масса
  { from: 'кг', to: 'т', factor: 1000, operation: 'divide' },
  { from: 'т', to: 'кг', factor: 1000, operation: 'multiply' },

  // Линейные
  { from: 'м', to: '100 м', factor: 100, operation: 'divide' },
  { from: 'м', to: 'км', factor: 1000, operation: 'divide' },
  { from: 'м', to: '1000 м', factor: 1000, operation: 'divide' },
  { from: 'м.п.', to: '100 м', factor: 100, operation: 'divide' },
  { from: 'м.п.', to: 'км', factor: 1000, operation: 'divide' },
  { from: 'м.п.', to: 'м', factor: 1, operation: 'multiply' },
  { from: 'м', to: 'м.п.', factor: 1, operation: 'multiply' },

  // Комплекты
  { from: 'компл', to: '100 компл', factor: 100, operation: 'divide' },
  { from: 'компл.', to: '100 компл', factor: 100, operation: 'divide' },

  // Тождественные
  { from: 'шт', to: 'шт.', factor: 1, operation: 'multiply' },
  { from: 'шт.', to: 'шт', factor: 1, operation: 'multiply' },
  { from: 'маш.-ч', to: 'маш.-ч', factor: 1, operation: 'multiply' },
  { from: 'чел.-ч', to: 'чел.-ч', factor: 1, operation: 'multiply' },
];

function normalizeUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '');
}

/**
 * Проверяет совместимость единиц и возвращает формулу пересчёта.
 */
export function checkUnitCompatibility(
  docUnit: string,
  rateUnit: string,
): { compatible: boolean; conversionFormula?: string; warning?: string } {
  const from = normalizeUnit(docUnit);
  const to = normalizeUnit(rateUnit);

  if (from === to) {
    return { compatible: true };
  }

  const rule = CONVERSION_RULES.find(
    r => normalizeUnit(r.from) === from && normalizeUnit(r.to) === to,
  );

  if (rule) {
    const formula = rule.operation === 'divide'
      ? `qty / ${rule.factor}`
      : `qty * ${rule.factor}`;
    return { compatible: true, conversionFormula: formula };
  }

  return {
    compatible: false,
    warning: `Несовместимые единицы: ${docUnit} → ${rateUnit}. Требуется ручной пересчёт.`,
  };
}

/**
 * Конвертирует значение из одной единицы в другую.
 */
export function convertUnits(
  value: number,
  fromUnit: string,
  toUnit: string,
): ConversionOutcome {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (from === to) {
    return {
      compatible: true,
      value,
      formula: `${value} ${fromUnit} = ${value} ${toUnit}`,
    };
  }

  const rule = CONVERSION_RULES.find(
    r => normalizeUnit(r.from) === from && normalizeUnit(r.to) === to,
  );

  if (!rule) {
    return {
      compatible: false,
      warning: `Нет правила конвертации: ${fromUnit} → ${toUnit}`,
      suggestedAction: 'Добавьте правило конвертации или укажите формулу вручную',
    };
  }

  const result = rule.operation === 'divide'
    ? value / rule.factor
    : value * rule.factor;

  const op = rule.operation === 'divide' ? '/' : '×';

  return {
    compatible: true,
    value: result,
    formula: `${value} ${fromUnit} ${op} ${rule.factor} = ${result} ${toUnit}`,
  };
}
