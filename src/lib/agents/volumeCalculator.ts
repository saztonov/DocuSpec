/**
 * Agent 4 — VolumeCalculator
 *
 * Вычисляет объёмы работ для позиций сметы.
 * Загружает количества из material_facts, пересчитывает единицы
 * в единицы нормы и формирует расчётные пояснения.
 */

import { supabase } from '../supabase';
import type { AgentTool, AgentConfig } from '../../types/skills';

// ── Параметры ────────────────────────────────────────────────────

interface VolumeCalculatorParams {
  model?: string;
}

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — инженер по расчёту объёмов работ для составления строительной сметы. Твоя задача — вычислить объём работ для каждой позиции сметы, пересчитав количества материалов в единицы измерения нормы.

## Правила пересчёта единиц

Стандартные конвертации:
- м2 → 100 м2: делить на 100 (value / 100)
- м3 → 1000 м3: делить на 1000 (value / 1000)
- шт → 1000 шт: делить на 1000 (value / 1000)
- кг → т: делить на 1000 (value / 1000)
- м → 100 м: делить на 100 (value / 100)
- т → кг: умножить на 1000 (value * 1000)
- 100 м2 → м2: умножить на 100 (value * 100)

## Алгоритм работы

Для каждой позиции сметы (работа + норма):

1. Загрузи количества материалов (get_material_quantities) по привязанным fact_ids.
2. Получи единицу нормы (get_rate_unit).
3. Определи объём работ:
   a. Если единица нормы — площадные (100 м2, м2) — используй площадь.
   b. Если единица нормы — объёмные (м3, 1000 м3) — используй объём.
   c. Если единица нормы — штуки (шт, 1000 шт) — используй количество.
   d. Если единица нормы — погонные (м, 100 м) — используй длину.
   e. Если единица нормы — массовые (кг, т) — используй массу.
4. Конвертируй единицы (convert_units).
5. Сформулируй calc_note — пояснение к расчёту.

## Особые случаи

- **layer (слой конструкции)**: толщина есть, площади нет → flag_needs_geometry.
- **Суммирование**: если несколько fact_ids дают количества для одной работы — суммируй.
- **quantity_type = 'component_per_assembly'**: нужен multiplier (кол-во изделий).
- **quantity_type = 'assembly_total'**: это уже итоговое количество.

## Формат ответа

\`\`\`json
{
  "volumes": [
    {
      "work_item_id": "uuid",
      "rate_match_id": "uuid",
      "volume": 7.13,
      "measure_unit": "100 м2",
      "calc_note": "713 м2 / 100 = 7.13 (100 м2)",
      "source_fact_ids": ["uuid1", "uuid2"],
      "needs_geometry": false
    }
  ],
  "issues": ["описание проблем"]
}
\`\`\`

Не добавляй текст вне JSON.`;

// ── Правила конвертации ──────────────────────────────────────────

interface ConversionResult {
  value: number;
  fromUnit: string;
  toUnit: string;
  formula: string;
  calcNote: string;
}

/** Таблица конвертации: ключ "from→to" → множитель. */
const CONVERSION_TABLE: Record<string, { factor: number; formula: string }> = {
  'м2→100м2':        { factor: 0.01,   formula: 'value / 100' },
  '100м2→м2':        { factor: 100,    formula: 'value * 100' },
  'м3→1000м3':       { factor: 0.001,  formula: 'value / 1000' },
  '1000м3→м3':       { factor: 1000,   formula: 'value * 1000' },
  'шт→1000шт':       { factor: 0.001,  formula: 'value / 1000' },
  '1000шт→шт':       { factor: 1000,   formula: 'value * 1000' },
  'кг→т':            { factor: 0.001,  formula: 'value / 1000' },
  'т→кг':            { factor: 1000,   formula: 'value * 1000' },
  'м→100м':          { factor: 0.01,   formula: 'value / 100' },
  '100м→м':          { factor: 100,    formula: 'value * 100' },
};

/** Нормализация единицы для ключа таблицы. */
function normalizeUnitKey(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/кв\.?\s*м/g, 'м2')
    .replace(/куб\.?\s*м/g, 'м3')
    .replace(/пог\.?\s*м/g, 'м')
    .replace(/тыс\.?\s*/g, '1000')
    .replace(/\./g, '')
    .trim();
}

function convertUnitsImpl(
  value: number,
  fromUnit: string,
  toUnit: string,
): ConversionResult {
  const fromNorm = normalizeUnitKey(fromUnit);
  const toNorm = normalizeUnitKey(toUnit);

  // Одинаковые единицы
  if (fromNorm === toNorm) {
    return {
      value,
      fromUnit,
      toUnit,
      formula: 'без пересчёта',
      calcNote: `${value} ${fromUnit}`,
    };
  }

  const key = `${fromNorm}→${toNorm}`;
  const rule = CONVERSION_TABLE[key];

  if (rule) {
    const result = value * rule.factor;
    const rounded = Math.round(result * 1e6) / 1e6;
    return {
      value: rounded,
      fromUnit,
      toUnit,
      formula: rule.formula,
      calcNote: `${value} ${fromUnit} → ${rounded} ${toUnit} (${rule.formula})`,
    };
  }

  // Нет правила — вернём как есть с предупреждением
  return {
    value,
    fromUnit,
    toUnit,
    formula: 'КОНВЕРТАЦИЯ НЕ НАЙДЕНА',
    calcNote: `${value} ${fromUnit} → ? ${toUnit} (правило конвертации не найдено)`,
  };
}

// ── Вычисление простых формул ────────────────────────────────────

function evaluateFormula(
  formula: string,
  params: Record<string, number>,
): { result: number; note: string } | { error: string } {
  try {
    // Подставляем параметры в формулу
    let expression = formula;
    for (const [key, val] of Object.entries(params)) {
      expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
    }

    // Разрешаем только безопасные символы: цифры, операторы, скобки, точки, пробелы
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      return { error: `Недопустимые символы в формуле: "${expression}"` };
    }

    // Безопасное вычисление через Function (только арифметика)
    const fn = new Function(`"use strict"; return (${expression});`) as () => number;
    const result = fn();

    if (typeof result !== 'number' || !isFinite(result)) {
      return { error: `Результат вычисления некорректен: ${result}` };
    }

    const rounded = Math.round(result * 1e6) / 1e6;
    return {
      result: rounded,
      note: `${formula} → ${expression} = ${rounded}`,
    };
  } catch (err) {
    return { error: `Ошибка вычисления: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Инструменты ──────────────────────────────────────────────────

function buildTools(): AgentTool[] {
  // 1. get_material_quantities — загрузить количества из material_facts
  const getMaterialQuantitiesTool: AgentTool = {
    name: 'get_material_quantities',
    description:
      'Загрузить количества из material_facts по массиву ID. ' +
      'Возвращает: id, raw_name, quantity, unit, quantity_type, fact_type, construction, multiplier, calc_note.',
    parameters: {
      type: 'object',
      properties: {
        fact_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Массив UUID material_facts',
        },
      },
      required: ['fact_ids'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { fact_ids } = input as { fact_ids: string[] };

      if (fact_ids.length === 0) {
        return { facts: [], total: 0 };
      }

      const { data, error } = await supabase
        .from('material_facts')
        .select(
          'id, raw_name, canonical_name, quantity, unit, quantity_type, fact_type, ' +
          'construction, kind, multiplier, calc_note, qty_scope, derived_from_fact_id',
        )
        .in('id', fact_ids);

      if (error) {
        throw new Error(`get_material_quantities failed: ${error.message}`);
      }

      return {
        facts: (data ?? []).map((f) => ({
          id: f.id,
          raw_name: f.raw_name,
          canonical_name: f.canonical_name,
          quantity: f.quantity,
          unit: f.unit,
          quantity_type: f.quantity_type,
          fact_type: f.fact_type,
          construction: f.construction,
          kind: f.kind,
          multiplier: f.multiplier,
          calc_note: f.calc_note,
          qty_scope: f.qty_scope,
          derived_from_fact_id: f.derived_from_fact_id,
        })),
        total: (data ?? []).length,
      };
    },
  };

  // 2. get_rate_unit — получить единицу измерения нормы
  const getRateUnitTool: AgentTool = {
    name: 'get_rate_unit',
    description:
      'Получить единицу измерения нормы ГЭСН по её UUID. Возвращает norm_code, name и measure_unit.',
    parameters: {
      type: 'object',
      properties: {
        norm_id: {
          type: 'string',
          description: 'UUID нормы из fsnb_norms',
        },
      },
      required: ['norm_id'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { norm_id } = input as { norm_id: string };

      const { data, error } = await supabase
        .from('fsnb_norms')
        .select('norm_code, name, measure_unit')
        .eq('id', norm_id)
        .single();

      if (error) {
        throw new Error(`get_rate_unit failed: ${error.message}`);
      }

      return {
        norm_id,
        norm_code: data?.norm_code ?? null,
        name: data?.name ?? null,
        measure_unit: data?.measure_unit ?? null,
      };
    },
  };

  // 3. convert_units — пересчёт единиц
  const convertUnitsTool: AgentTool = {
    name: 'convert_units',
    description:
      'Пересчитать значение из одной единицы в другую. ' +
      'Поддерживаемые пересчёты: м2↔100м2, м3↔1000м3, шт↔1000шт, кг↔т, м↔100м.',
    parameters: {
      type: 'object',
      properties: {
        value: {
          type: 'number',
          description: 'Числовое значение для пересчёта',
        },
        from_unit: {
          type: 'string',
          description: 'Исходная единица измерения',
        },
        to_unit: {
          type: 'string',
          description: 'Целевая единица измерения',
        },
      },
      required: ['value', 'from_unit', 'to_unit'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { value, from_unit, to_unit } = input as {
        value: number;
        from_unit: string;
        to_unit: string;
      };
      return convertUnitsImpl(value, from_unit, to_unit);
    },
  };

  // 4. calc_volume — вычислить формулу
  const calcVolumeTool: AgentTool = {
    name: 'calc_volume',
    description:
      'Вычислить простую арифметическую формулу с параметрами. ' +
      'Например: formula="qty / 100", params={"qty": 713} → result: 7.13.',
    parameters: {
      type: 'object',
      properties: {
        formula: {
          type: 'string',
          description: 'Формула (например, "qty / 100", "area * thickness / 1000")',
        },
        params: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Параметры формулы: {"qty": 713, "area": 120.5}',
        },
      },
      required: ['formula', 'params'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { formula, params } = input as {
        formula: string;
        params: Record<string, number>;
      };
      return evaluateFormula(formula, params);
    },
  };

  // 5. flag_needs_geometry — пометить, что нужна геометрическая база
  const flagNeedsGeometryTool: AgentTool = {
    name: 'flag_needs_geometry',
    description:
      'Пометить, что для расчёта объёма необходима геометрическая база (площадь, длина), ' +
      'которая отсутствует в текущем документе. Создаёт запись в estimate_review_queue.',
    parameters: {
      type: 'object',
      properties: {
        estimate_id: {
          type: 'string',
          description: 'UUID сметы',
        },
        work_item_id: {
          type: 'string',
          description: 'UUID вида работ (необязательно)',
        },
        material_fact_id: {
          type: 'string',
          description: 'UUID material_fact (необязательно)',
        },
        description: {
          type: 'string',
          description:
            'Описание проблемы (например, "Слой утеплителя 50мм — нет площади стены")',
        },
        suggested_source: {
          type: 'string',
          description:
            'Предполагаемый источник геометрии (например, "том КЖ, план этажа", "ведомость отделки")',
        },
      },
      required: ['estimate_id', 'description'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const {
        estimate_id,
        work_item_id,
        material_fact_id,
        description,
        suggested_source,
      } = input as {
        estimate_id: string;
        work_item_id?: string;
        material_fact_id?: string;
        description: string;
        suggested_source?: string;
      };

      const suggestedAction = suggested_source
        ? `Загрузить геометрию из: ${suggested_source}`
        : 'Необходимо указать геометрическую базу вручную или загрузить смежный том';

      const { data, error } = await supabase
        .from('estimate_review_queue')
        .insert({
          estimate_id,
          severity: 'warning',
          issue_type: 'no_geometry',
          description,
          related_work_item_id: work_item_id ?? null,
          related_material_fact_id: material_fact_id ?? null,
          suggested_action: suggestedAction,
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`flag_needs_geometry INSERT failed: ${error.message}`);
      }

      return {
        review_item_id: data?.id,
        issue_type: 'no_geometry',
        description,
        suggested_action: suggestedAction,
        flagged: true,
      };
    },
  };

  return [
    getMaterialQuantitiesTool,
    getRateUnitTool,
    convertUnitsTool,
    calcVolumeTool,
    flagNeedsGeometryTool,
  ];
}

// ── Фабрика конфигурации ─────────────────────────────────────────

export function createVolumeCalculatorConfig(
  params: VolumeCalculatorParams = {},
): AgentConfig {
  return {
    name: 'volume_calculator',
    systemPrompt: SYSTEM_PROMPT,
    tools: buildTools(),
    maxSteps: 12,
    temperature: 0.1,
    model: params.model,
  };
}
