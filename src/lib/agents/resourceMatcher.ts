/**
 * Agent 3 — ResourceMatcher
 *
 * Сопоставляет material_facts с ресурсами КСР ФСНБ-2022.
 * Использует технические группы (ТГ) для сужения поиска,
 * проверяет совместимость единиц измерения и сохраняет результат.
 */

import {
  searchResources,
  searchByGost,
  getAllowedResources,
  searchWithinTg,
} from '../ragSearch';
import { supabase } from '../supabase';
import type { AgentTool, AgentConfig } from '../../types/skills';

// ── Параметры ────────────────────────────────────────────────────

interface ResourceMatcherParams {
  model?: string;
}

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — специалист по сопоставлению строительных материалов. Твоя задача — подобрать ресурс из КСР ФСНБ-2022 для каждого проектного материала (material_fact).

## Стратегия сопоставления (в порядке приоритета)

1. **По ГОСТ**: если у material_fact есть ГОСТ — ищи точное совпадение через search_by_gost.
2. **По ТГ (техническая группа)**: если известна норма (norm_id) — получи допустимые ресурсы через get_allowed_resources, затем ищи внутри ТГ через search_within_tg.
3. **Семантический поиск**: если ТГ не дала результатов — ищи по всему КСР через search_resources.

## Правила проверки единиц (check_unit_compatibility)

Совместимые пары единиц:
- Одинаковые единицы → совместимы (без пересчёта)
- м2 ↔ 100 м2 → совместимы (формула: /100 или *100)
- м3 ↔ 1000 м3 → совместимы (формула: /1000 или *1000)
- шт ↔ 1000 шт → совместимы (формула: /1000 или *1000)
- кг ↔ т → совместимы (формула: /1000 или *1000)
- м ↔ 100 м → совместимы (формула: /100 или *100)
- м3 ↔ тыс.шт → НЕ совместимы (разная физическая величина)
- кг ↔ м → НЕ совместимы (разная физическая величина)

При несовместимости — needs_review = true.

## Алгоритм работы

Для каждого material_fact:
1. Если есть ГОСТ — search_by_gost.
2. Если есть norm_id — get_allowed_resources, затем search_within_tg для лучших ТГ.
3. Если не найдено — fallback: search_resources по canonical_name/raw_name.
4. Из кандидатов проверь check_unit_compatibility.
5. Выбери лучший ресурс и зафиксируй (confirm_match).

## Формат итогового ответа

\`\`\`json
{
  "summary": "Сопоставлено N из M материалов",
  "results": [
    {
      "fact_id": "uuid",
      "resource_code": "21.1.01.01-0001",
      "resource_name": "Кирпич керамический...",
      "confidence": 0.9,
      "method": "tg_semantic",
      "unit_compatible": true
    }
  ],
  "issues": ["описание проблем"]
}
\`\`\`

Не добавляй текст вне JSON.`;

// ── Таблица совместимости единиц ─────────────────────────────────

interface UnitCompatResult {
  compatible: boolean;
  conversionFormula: string | null;
  warning: string | null;
}

/** Нормализация единицы измерения для сравнения. */
function normalizeUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/кв\.?\s*м/g, 'м2')
    .replace(/куб\.?\s*м/g, 'м3')
    .replace(/пог\.?\s*м/g, 'м')
    .replace(/тыс\.?\s*/g, '1000')
    .trim();
}

/** Правила конвертации единиц. */
const CONVERSION_RULES: Array<{
  from: RegExp;
  to: RegExp;
  formula: string;
  reverse: string;
}> = [
  { from: /^м2$/, to: /^100\s*м2$/, formula: 'value / 100', reverse: 'value * 100' },
  { from: /^м3$/, to: /^1000\s*м3$/, formula: 'value / 1000', reverse: 'value * 1000' },
  { from: /^шт\.?$/, to: /^1000\s*шт\.?$/, formula: 'value / 1000', reverse: 'value * 1000' },
  { from: /^кг$/, to: /^т$/, formula: 'value / 1000', reverse: 'value * 1000' },
  { from: /^м$/, to: /^100\s*м$/, formula: 'value / 100', reverse: 'value * 100' },
  { from: /^м3$/, to: /^1000м3$/, formula: 'value / 1000', reverse: 'value * 1000' },
  { from: /^шт$/, to: /^1000шт$/, formula: 'value / 1000', reverse: 'value * 1000' },
];

function checkUnitCompat(docUnit: string, ksrUnit: string): UnitCompatResult {
  const a = normalizeUnit(docUnit);
  const b = normalizeUnit(ksrUnit);

  // Точное совпадение
  if (a === b) {
    return { compatible: true, conversionFormula: null, warning: null };
  }

  // Проверка по правилам конвертации
  for (const rule of CONVERSION_RULES) {
    if (rule.from.test(a) && rule.to.test(b)) {
      return { compatible: true, conversionFormula: rule.formula, warning: null };
    }
    if (rule.to.test(a) && rule.from.test(b)) {
      return { compatible: true, conversionFormula: rule.reverse, warning: null };
    }
  }

  // Несовместимые единицы
  return {
    compatible: false,
    conversionFormula: null,
    warning: `Единицы несовместимы: "${docUnit}" и "${ksrUnit}" — разная физическая величина`,
  };
}

// ── Инструменты ──────────────────────────────────────────────────

function buildTools(estimateId: string): AgentTool[] {
  // 1. get_allowed_resources — допустимые ресурсы по ТГ нормы
  const getAllowedResourcesTool: AgentTool = {
    name: 'get_allowed_resources',
    description:
      'Получить допустимые ресурсы из технических групп (ТГ), привязанных к норме. ' +
      'Возвращает массив групп, каждая с tg_id, tg_code и списком ресурсов.',
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
      const groups = await getAllowedResources(norm_id);
      return groups.map((g) => ({
        tg_id: g.tg_id,
        tg_code: g.tg_code,
        resource_count: g.resources.length,
        resources: g.resources.slice(0, 30).map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          measure_unit: r.measure_unit,
          resource_type: r.resource_type,
        })),
      }));
    },
  };

  // 2. search_within_tg — семантический поиск внутри ТГ
  const searchWithinTgTool: AgentTool = {
    name: 'search_within_tg',
    description:
      'Семантический поиск ресурсов внутри конкретной технической группы (ТГ). ' +
      'Используй после get_allowed_resources для уточнения.',
    parameters: {
      type: 'object',
      properties: {
        tg_id: {
          type: 'string',
          description: 'UUID технической группы',
        },
        query: {
          type: 'string',
          description: 'Текстовый запрос (название материала, ГОСТ и т.д.)',
        },
      },
      required: ['tg_id', 'query'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { tg_id, query } = input as { tg_id: string; query: string };
      const results = await searchWithinTg(tg_id, query, 10);
      return results.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        measure_unit: r.measure_unit,
        resource_type: r.resource_type,
        score: r.score,
      }));
    },
  };

  // 3. search_by_gost — точный поиск по ГОСТ
  const searchByGostTool: AgentTool = {
    name: 'search_by_gost',
    description:
      'Точный поиск ресурсов КСР по коду ГОСТ. Возвращает ресурсы, имеющие ссылку на указанный ГОСТ.',
    parameters: {
      type: 'object',
      properties: {
        gost_code: {
          type: 'string',
          description: 'Код ГОСТ (например, "530-2012", "ГОСТ 530-2012")',
        },
      },
      required: ['gost_code'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { gost_code } = input as { gost_code: string };
      const results = await searchByGost(gost_code);
      return results.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        measure_unit: r.measure_unit,
        resource_type: r.resource_type,
      }));
    },
  };

  // 4. search_resources — fallback: поиск по всему КСР
  const searchResourcesTool: AgentTool = {
    name: 'search_resources',
    description:
      'Семантический поиск ресурсов по всему КСР ФСНБ-2022. Используй как fallback, если ТГ и ГОСТ не дали результатов.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Текстовый запрос (название материала, марка, описание)',
        },
        resource_type: {
          type: 'string',
          description: 'Тип ресурса: "material", "equipment", "machine" (необязательно)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { query, resource_type } = input as {
        query: string;
        resource_type?: string;
      };
      const results = await searchResources(query, {
        resourceType: resource_type,
        limit: 15,
      });
      return results.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        measure_unit: r.measure_unit,
        resource_type: r.resource_type,
        score: r.score,
      }));
    },
  };

  // 5. check_unit_compatibility — проверка совместимости единиц
  const checkUnitCompatTool: AgentTool = {
    name: 'check_unit_compatibility',
    description:
      'Проверить совместимость единиц измерения документа и КСР. ' +
      'Возвращает: compatible (bool), conversionFormula (string | null), warning (string | null).',
    parameters: {
      type: 'object',
      properties: {
        doc_unit: {
          type: 'string',
          description: 'Единица измерения из документа (material_facts.unit)',
        },
        ksr_unit: {
          type: 'string',
          description: 'Единица измерения ресурса КСР',
        },
      },
      required: ['doc_unit', 'ksr_unit'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { doc_unit, ksr_unit } = input as {
        doc_unit: string;
        ksr_unit: string;
      };
      return checkUnitCompat(doc_unit, ksr_unit);
    },
  };

  // 6. confirm_match — сохранить сопоставление в БД
  const confirmMatchTool: AgentTool = {
    name: 'confirm_match',
    description:
      'Зафиксировать сопоставление материала с ресурсом КСР: записать в estimate_resource_matches.',
    parameters: {
      type: 'object',
      properties: {
        fact_id: {
          type: 'string',
          description: 'UUID material_fact',
        },
        resource_id: {
          type: 'string',
          description: 'UUID ресурса fsnb_resources',
        },
        resource_code: {
          type: 'string',
          description: 'Код ресурса КСР',
        },
        resource_name: {
          type: 'string',
          description: 'Название ресурса КСР',
        },
        resource_unit: {
          type: 'string',
          description: 'Единица измерения ресурса КСР',
        },
        rate_match_id: {
          type: 'string',
          description: 'UUID расценки (estimate_rate_matches.id), через которую подбирался ресурс (необязательно)',
        },
        tg_id: {
          type: 'string',
          description: 'UUID технической группы, из которой подобран ресурс (необязательно)',
        },
        confidence: {
          type: 'number',
          description: 'Уверенность от 0 до 1',
        },
        match_method: {
          type: 'string',
          enum: ['gost', 'code', 'tg_semantic', 'semantic', 'llm'],
          description: 'Метод сопоставления',
        },
        unit_compatible: {
          type: 'boolean',
          description: 'Совместимы ли единицы измерения',
        },
        conversion_formula: {
          type: 'string',
          description: 'Формула пересчёта единиц (необязательно)',
        },
        reasoning: {
          type: 'string',
          description: 'Обоснование выбора',
        },
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              resource_code: { type: 'string' },
              name: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
          description: 'Альтернативные ресурсы (необязательно)',
        },
      },
      required: ['fact_id', 'resource_id', 'confidence', 'reasoning'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const {
        fact_id,
        resource_id,
        resource_code,
        resource_name,
        resource_unit,
        rate_match_id,
        tg_id,
        confidence,
        match_method,
        unit_compatible,
        conversion_formula,
        reasoning,
        alternatives,
      } = input as {
        fact_id: string;
        resource_id: string;
        resource_code?: string;
        resource_name?: string;
        resource_unit?: string;
        rate_match_id?: string;
        tg_id?: string;
        confidence: number;
        match_method?: string;
        unit_compatible?: boolean;
        conversion_formula?: string;
        reasoning: string;
        alternatives?: Array<{
          resource_code: string;
          name: string;
          confidence: number;
        }>;
      };

      const needsReview = confidence < 0.6 || unit_compatible === false;

      const { data, error } = await supabase
        .from('estimate_resource_matches')
        .insert({
          estimate_id: estimateId,
          material_fact_id: fact_id,
          rate_match_id: rate_match_id ?? null,
          fsnb_resource_id: resource_id,
          fsnb_resource_code: resource_code ?? null,
          fsnb_resource_name: resource_name ?? null,
          fsnb_resource_unit: resource_unit ?? null,
          tg_id: tg_id ?? null,
          match_confidence: confidence,
          match_method: match_method ?? 'llm',
          unit_compatible: unit_compatible ?? null,
          conversion_formula: conversion_formula ?? null,
          needs_review: needsReview,
          agent_reasoning: reasoning,
          alternatives: alternatives ?? [],
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`confirm_match INSERT failed: ${error.message}`);
      }

      return {
        resource_match_id: data?.id,
        fact_id,
        resource_code: resource_code ?? resource_id,
        confidence,
        unit_compatible: unit_compatible ?? null,
        needs_review: needsReview,
        saved: true,
      };
    },
  };

  return [
    getAllowedResourcesTool,
    searchWithinTgTool,
    searchByGostTool,
    searchResourcesTool,
    checkUnitCompatTool,
    confirmMatchTool,
  ];
}

// ── Фабрика конфигурации ─────────────────────────────────────────

export function createResourceMatcherConfig(
  estimateId: string,
  params: ResourceMatcherParams = {},
): AgentConfig {
  return {
    name: 'resource_matcher',
    systemPrompt: SYSTEM_PROMPT,
    tools: buildTools(estimateId),
    maxSteps: 20,
    temperature: 0.1,
    model: params.model,
  };
}
