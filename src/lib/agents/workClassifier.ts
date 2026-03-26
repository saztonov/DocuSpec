/**
 * Agent 1 — WorkClassifier
 *
 * Определяет виды строительных работ по материалам и контексту документа.
 * На основе раздела проекта (АР, КЖ, КМ и т.д.) и состава материалов
 * формирует список work_items для дальнейшей расценки.
 */

import { searchNorms } from '../ragSearch';
import { supabase } from '../supabase';
import type { AgentTool, AgentConfig } from '../../types/skills';

// ── Параметры ────────────────────────────────────────────────────

interface WorkClassifierParams {
  model?: string;
}

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — эксперт-инженер строительного производства и сметчик. Определяешь виды строительных работ по материалам из рабочей документации.

## ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА

### Правило 1: ПОЛНОТА
КАЖДЫЙ material_fact.id из входных данных ОБЯЗАН попасть в source_material_fact_ids ровно ОДНОГО work_item. Нулевая потеря материалов. После формирования work_items проверь, что объединение всех source_material_fact_ids покрывает ВСЕ входные ID. Если есть пропущенные — создай дополнительный work_item "Прочие работы" с непокрытыми материалами.

### Правило 2: БЕЗ ДУБЛЕЙ
Каждый material_fact.id появляется МАКСИМУМ в ОДНОМ work_item. Запрещено назначать один материал нескольким работам. Если материал используется в нескольких конструкциях — назначь его работе основной конструкции.

### Правило 3: ГРУППИРОВКА ПО КОНСТРУКЦИЯМ
- Материалы с одинаковым полем construction группируются в ОДИН work_item
- Конструкции одного типа работ можно объединить (ОГ-13, ОГ-14, ОГ-15 → "Монтаж металлических ограждений")
- Крепёж (анкеры, дюбели, шпильки) группируется с основным материалом конструкции, а НЕ как отдельная работа
- Если construction пуст — группируй по типу материала

### Правило 4: РАЗДЕЛ КАК ПОДСКАЗКА (не ограничение)
section_code помогает определить типичные категории, но не ограничивает. Любой материал должен получить work_item.

Типичные категории по разделам:
- АР: finishing, masonry, flooring, railing, glazing, waterproofing, insulation, openings, roofing
- КЖ: concrete, reinforcement, formwork, earthwork
- КР/КМ: metalwork, welding, railing
- ЭОМ/ЭС: electrical, cable_laying, electrical_equipment
- СС/АТ: low_voltage, communication_equipment
- ОВ/ОВиК: piping, ventilation, equipment_installation, pipe_insulation
- ВК: piping, plumbing

### Правило 5: ОПИСАНИЕ РАБОТ
work_description должно быть конкретным и сметно-корректным:
- ✅ "Облицовка ступеней и площадок натуральным камнем (гранит)"
- ✅ "Монтаж металлических ограждений лестниц (ОГ-13, ОГ-14, ОГ-15, ОГ-17, ОГ-18)"
- ❌ "Работы по облицовке" (слишком общо)
- ❌ "Монтаж ограждений" (не указан тип)

## ФОРМАТ ОТВЕТА

Строго JSON, без текста вне блока:
\`\`\`json
{
  "work_items": [
    {
      "work_description": "Кладка перегородок из кирпича керамического",
      "work_category": "masonry",
      "construction": "Перегородки П1",
      "source_material_fact_ids": ["uuid1", "uuid2"],
      "confidence": 0.9,
      "reasoning": "Кирпич + раствор → кладочные работы"
    }
  ]
}
\`\`\`
`;

// ── Инструменты ──────────────────────────────────────────────────

function buildTools(/* no extra context needed */): AgentTool[] {
  // 1. search_norms — поиск норм ГЭСН
  const searchNormsTool: AgentTool = {
    name: 'search_norms',
    description:
      'Поиск норм ГЭСН/ГЭСНм/ГЭСНр по текстовому запросу. Возвращает список норм с кодом, названием и релевантностью.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Текстовый запрос для поиска норм ГЭСН (например, "кладка кирпичных перегородок")',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      const results = await searchNorms(query, { limit: 10 });
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

  // 2. get_material_facts_by_construction — загрузка material_facts с группировкой
  const getMaterialFactsTool: AgentTool = {
    name: 'get_material_facts_by_construction',
    description:
      'Загрузить material_facts для документа, сгруппированные по полю construction. ' +
      'Если передан construction — вернёт только эту группу.',
    parameters: {
      type: 'object',
      properties: {
        doc_id: {
          type: 'string',
          description: 'UUID документа',
        },
        construction: {
          type: 'string',
          description: 'Фильтр по construction (необязательно)',
        },
      },
      required: ['doc_id'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { doc_id, construction } = input as {
        doc_id: string;
        construction?: string;
      };

      let query = supabase
        .from('material_facts')
        .select(
          'id, raw_name, canonical_name, canonical_key, quantity, unit, mark, gost, ' +
          'construction, source_section, kind, fact_type, quantity_type, extra_params, block_type_display',
        )
        .eq('doc_id', doc_id)
        .order('construction', { ascending: true, nullsFirst: false });

      if (construction) {
        query = query.eq('construction', construction);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`get_material_facts_by_construction failed: ${error.message}`);
      }

      // Группировка по construction
      const groups: Record<string, typeof data> = {};
      for (const row of data ?? []) {
        const key = (row.construction as string) ?? '__без_конструкции__';
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      }

      return Object.entries(groups).map(([name, facts]) => ({
        construction: name,
        fact_count: facts.length,
        facts: facts.map((f) => ({
          id: f.id,
          raw_name: f.raw_name,
          canonical_name: f.canonical_name,
          quantity: f.quantity,
          unit: f.unit,
          mark: f.mark,
          gost: f.gost,
          kind: f.kind,
          fact_type: f.fact_type,
          quantity_type: f.quantity_type,
          source_section: f.source_section,
          extra_params: f.extra_params,
        })),
      }));
    },
  };

  // 3. get_section_info — получить код и название раздела документа
  const getSectionInfoTool: AgentTool = {
    name: 'get_section_info',
    description:
      'Получить код и название раздела проекта (section_code, section_name) для документа. ' +
      'Например: code="АР", name="Архитектурные решения".',
    parameters: {
      type: 'object',
      properties: {
        doc_id: {
          type: 'string',
          description: 'UUID документа',
        },
      },
      required: ['doc_id'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { doc_id } = input as { doc_id: string };

      // Загружаем документ с section_id
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('section_id, doc_code, filename')
        .eq('id', doc_id)
        .single();

      if (docError) {
        throw new Error(`get_section_info (document) failed: ${docError.message}`);
      }

      if (!doc?.section_id) {
        return {
          section_code: null,
          section_name: null,
          doc_code: doc?.doc_code ?? null,
          filename: doc?.filename ?? null,
          hint: 'Раздел не определён — используйте doc_code и filename для определения типа документа',
        };
      }

      const { data: section, error: secError } = await supabase
        .from('sections')
        .select('code, name')
        .eq('id', doc.section_id)
        .single();

      if (secError) {
        throw new Error(`get_section_info (section) failed: ${secError.message}`);
      }

      return {
        section_code: section?.code ?? null,
        section_name: section?.name ?? null,
        doc_code: doc.doc_code ?? null,
        filename: doc.filename ?? null,
      };
    },
  };

  return [searchNormsTool, getMaterialFactsTool, getSectionInfoTool];
}

// ── Фабрика конфигурации ─────────────────────────────────────────

export function createWorkClassifierConfig(
  params: WorkClassifierParams = {},
): AgentConfig {
  return {
    name: 'work_classifier',
    systemPrompt: SYSTEM_PROMPT,
    tools: buildTools(),
    maxSteps: 10,
    temperature: 0.2,
    model: params.model,
  };
}
