/**
 * Agent 2 — PricePicker
 *
 * Подбирает нормы ГЭСН для видов работ (work items).
 * Проверяет ресурсный состав нормы на совпадение с фактическими материалами,
 * рассчитывает покрытие и сохраняет результат в estimate_rate_matches.
 */

import { searchNorms, getNormComposition } from '../ragSearch';
import { supabase } from '../supabase';
import type { AgentTool, AgentConfig } from '../../types/skills';

// ── Параметры ────────────────────────────────────────────────────

interface PricePickerParams {
  model?: string;
}

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — эксперт-сметчик строительного производства. Твоя задача — подобрать наиболее подходящую норму ГЭСН (или ГЭСНм, ГЭСНр, ГЭСНп) для каждого вида работ.

## Принципы подбора

1. **Точность описания**: норма должна максимально точно описывать вид работы.
2. **Ресурсное покрытие**: ресурсный состав нормы должен содержать материалы, близкие к фактическим.
3. **Единица измерения**: норма должна иметь единицу измерения, совместимую с объёмом работ.
4. **Категория работ**: норма должна быть из подходящего сборника ГЭСН.

## Алгоритм работы

Для каждого work_item:

1. Сформулируй поисковый запрос на основе work_description и категории.
2. Выполни search_norms — получи кандидатов.
3. Для 2-3 лучших кандидатов:
   a. Загрузи ресурсный состав (get_norm_composition).
   b. Сравни с фактическими материалами (compare_resources).
4. Выбери лучшую норму (с наибольшим покрытием и релевантностью).
5. Зафиксируй результат (confirm_rate).

## Правила оценки покрытия (coverage)

- **>= 80%** — отличное покрытие, уверенность высокая
- **50-79%** — приемлемое, но стоит добавить альтернативы
- **< 50%** — низкое покрытие, needs_review = true

## Формат итогового ответа

После подбора всех расценок ответь JSON:
\`\`\`json
{
  "summary": "Подобрано N расценок из M видов работ",
  "results": [
    {
      "work_item_id": "uuid",
      "norm_code": "ГЭСН 08-02-001-01",
      "norm_name": "Кладка перегородок...",
      "confidence": 0.85,
      "coverage": 0.72,
      "reasoning": "..."
    }
  ],
  "issues": ["описание проблем, если есть"]
}
\`\`\`

Не добавляй текст вне JSON.

## Важные правила

- Если 3 последовательных search_norms не дали релевантных результатов — ПРЕКРАТИТЕ поиск. Вызовите confirm_rate с confidence=0.3 и reasoning, объясняющим почему подходящая норма не найдена.
- НИКОГДА не возвращайте пустой ответ. Всегда возвращайте JSON с результатами или с объяснением.
- НЕ повторяйте одинаковые или очень похожие поисковые запросы — если запрос уже выполнялся, попробуйте принципиально другую формулировку или примите решение.`;

// ── Инструменты ──────────────────────────────────────────────────

function buildTools(estimateId: string): AgentTool[] {
  // 1. search_norms — поиск норм
  const searchNormsTool: AgentTool = {
    name: 'search_norms',
    description:
      'Поиск норм ГЭСН/ГЭСНм/ГЭСНр/ГЭСНп по текстовому запросу. ' +
      'Возвращает список с кодом, названием, единицей измерения и score.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Текстовый запрос для поиска (например, "кладка перегородок из кирпича")',
        },
        base_type: {
          type: 'string',
          description: 'Тип базы: "ГЭСН", "ГЭСНм", "ГЭСНр", "ГЭСНп" (необязательно)',
        },
        work_category: {
          type: 'string',
          description: 'Категория работ для фильтрации (необязательно)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { query, base_type, work_category } = input as {
        query: string;
        base_type?: string;
        work_category?: string;
      };
      const results = await searchNorms(query, {
        baseType: base_type,
        // workCategory не передаём — поле не заполнено при импорте, ищем по тексту + embedding
        limit: 15,
      });
      return results.map((r) => ({
        id: r.id,
        norm_code: r.norm_code,
        name: r.name,
        measure_unit: r.measure_unit,
        base_type: r.base_type,
        work_category: r.work_category,
        score: r.score,
      }));
    },
  };

  // 2. get_norm_composition — ресурсный состав нормы
  const getNormCompositionTool: AgentTool = {
    name: 'get_norm_composition',
    description:
      'Получить ресурсный состав нормы: список материалов, машин и трудозатрат с расходом.',
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
      const composition = await getNormComposition(norm_id);
      return composition.map((r) => ({
        resource_code: r.resource_code,
        resource_name: r.resource_name,
        resource_type: r.resource_type,
        consumption: r.consumption,
        measure_unit: r.measure_unit,
      }));
    },
  };

  // 3. compare_resources — сравнить ресурсы нормы с фактическими материалами
  const compareResourcesTool: AgentTool = {
    name: 'compare_resources',
    description:
      'Сравнить ресурсный состав нормы с фактическими материалами из документа. ' +
      'Возвращает процент покрытия (coverage) и детали сопоставления.',
    parameters: {
      type: 'object',
      properties: {
        norm_resources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              resource_name: { type: 'string' },
              resource_type: { type: 'string' },
            },
          },
          description: 'Ресурсы из состава нормы (resource_name, resource_type)',
        },
        actual_materials: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              gost: { type: 'string' },
              kind: { type: 'string' },
            },
          },
          description: 'Фактические материалы из material_facts (name, gost, kind)',
        },
      },
      required: ['norm_resources', 'actual_materials'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { norm_resources, actual_materials } = input as {
        norm_resources: Array<{ resource_name: string; resource_type: string }>;
        actual_materials: Array<{ name: string; gost?: string; kind?: string }>;
      };

      // Считаем только материальные ресурсы нормы (не трудозатраты и не машины)
      const materialResources = norm_resources.filter(
        (r) => r.resource_type === 'material' || r.resource_type === 'equipment',
      );

      if (materialResources.length === 0) {
        return {
          coverage: 1.0,
          total_norm_materials: 0,
          matched: 0,
          details: [],
          note: 'Норма не содержит материальных ресурсов',
        };
      }

      // Простое сопоставление по вхождению подстрок (нечёткое)
      const actualLower = actual_materials.map((m) => ({
        name: m.name.toLowerCase(),
        gost: m.gost?.toLowerCase() ?? '',
      }));

      let matched = 0;
      const details: Array<{
        norm_resource: string;
        matched_to: string | null;
        matched: boolean;
      }> = [];

      for (const normRes of materialResources) {
        const normNameLower = (normRes.resource_name ?? '').toLowerCase();

        // Ищем совпадение: хотя бы одно ключевое слово нормы есть в фактическом материале
        const normWords = normNameLower
          .split(/[\s,;()/\-]+/)
          .filter((w) => w.length > 3);

        let bestMatch: string | null = null;
        let bestScore = 0;

        for (const actual of actualLower) {
          let score = 0;
          for (const word of normWords) {
            if (actual.name.includes(word)) score++;
            if (actual.gost && actual.gost.includes(word)) score++;
          }
          const normalizedScore = normWords.length > 0 ? score / normWords.length : 0;
          if (normalizedScore > bestScore) {
            bestScore = normalizedScore;
            bestMatch = actual.name;
          }
        }

        const isMatched = bestScore >= 0.3;
        if (isMatched) matched++;

        details.push({
          norm_resource: normRes.resource_name ?? '',
          matched_to: isMatched ? bestMatch : null,
          matched: isMatched,
        });
      }

      const coverage = matched / materialResources.length;

      return {
        coverage: Math.round(coverage * 100) / 100,
        total_norm_materials: materialResources.length,
        matched,
        details,
      };
    },
  };

  // 4. confirm_rate — сохранить подобранную расценку в БД
  const confirmRateTool: AgentTool = {
    name: 'confirm_rate',
    description:
      'Зафиксировать подобранную расценку: записать в estimate_rate_matches.',
    parameters: {
      type: 'object',
      properties: {
        work_item_id: {
          type: 'string',
          description: 'UUID вида работ (estimate_work_items.id)',
        },
        norm_id: {
          type: 'string',
          description: 'UUID нормы из fsnb_norms',
        },
        norm_code: {
          type: 'string',
          description: 'Код нормы (например, "ГЭСН 08-02-001-01")',
        },
        norm_name: {
          type: 'string',
          description: 'Название нормы',
        },
        norm_unit: {
          type: 'string',
          description: 'Единица измерения нормы',
        },
        confidence: {
          type: 'number',
          description: 'Уверенность от 0 до 1',
        },
        coverage: {
          type: 'number',
          description: 'Процент покрытия ресурсов (0..1)',
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
              norm_code: { type: 'string' },
              name: { type: 'string' },
              confidence: { type: 'number' },
              coverage: { type: 'number' },
            },
          },
          description: 'Альтернативные нормы (необязательно)',
        },
      },
      required: ['work_item_id', 'norm_id', 'confidence', 'coverage', 'reasoning'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const {
        work_item_id,
        norm_id,
        norm_code,
        norm_name,
        norm_unit,
        confidence,
        coverage,
        reasoning,
        alternatives,
      } = input as {
        work_item_id: string;
        norm_id: string;
        norm_code?: string;
        norm_name?: string;
        norm_unit?: string;
        confidence: number;
        coverage: number;
        reasoning: string;
        alternatives?: Array<{
          norm_code: string;
          name: string;
          confidence: number;
          coverage: number;
        }>;
      };

      const needsReview = coverage < 0.5 || confidence < 0.6;

      const { data, error } = await supabase
        .from('estimate_rate_matches')
        .insert({
          estimate_id: estimateId,
          work_item_id,
          fsnb_norm_id: norm_id,
          norm_code: norm_code ?? null,
          norm_name: norm_name ?? null,
          norm_unit: norm_unit ?? null,
          match_confidence: confidence,
          match_method: 'llm',
          resource_coverage: coverage,
          needs_review: needsReview,
          agent_reasoning: reasoning,
          alternatives: alternatives ?? [],
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`confirm_rate INSERT failed: ${error.message}`);
      }

      return {
        rate_match_id: data?.id,
        work_item_id,
        norm_code: norm_code ?? norm_id,
        confidence,
        coverage,
        needs_review: needsReview,
        saved: true,
      };
    },
  };

  return [searchNormsTool, getNormCompositionTool, compareResourcesTool, confirmRateTool];
}

// ── Фабрика конфигурации ─────────────────────────────────────────

export function createPricePickerConfig(
  estimateId: string,
  params: PricePickerParams = {},
): AgentConfig {
  return {
    name: 'price_picker',
    systemPrompt: SYSTEM_PROMPT,
    tools: buildTools(estimateId),
    maxSteps: 15,
    temperature: 0.15,
    model: params.model,
  };
}
