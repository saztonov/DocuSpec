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

const SYSTEM_PROMPT = `Ты — эксперт-инженер строительного производства. Твоя задача — определить виды работ (work items) на основе извлечённых материалов и контекста проектного документа.

## Правила определения видов работ по разделу проекта

Раздел документа (section_code) определяет основные категории работ:

- **АР** (Архитектурные решения):
  - Отделочные работы (finishing): штукатурка, покраска, облицовка, обои, напольные покрытия
  - Каменные работы (masonry): кирпичная кладка, блоки, перегородки
  - Кровельные работы (roofing): мембраны, утеплитель кровли, водосток
  - Гидроизоляция (waterproofing): обмазочная, оклеечная
  - Теплоизоляция (insulation): утепление стен, полов
  - Заполнение проёмов (openings): окна, двери, витражи
  - Устройство полов (flooring): стяжки, наливные полы, плитка

- **КЖ** (Конструкции железобетонные):
  - Бетонные работы (concrete): монолитные конструкции, фундаменты
  - Арматурные работы (reinforcement): армирование
  - Опалубочные работы (formwork): опалубка

- **КМ / КМД** (Конструкции металлические):
  - Металлоконструкции (metalwork): колонны, балки, фермы
  - Сварочные работы (welding)
  - Монтаж ограждений (railing)

- **ОВиК / ОВ** (Отопление, вентиляция и кондиционирование):
  - Монтаж трубопроводов (piping)
  - Монтаж оборудования (equipment_installation)
  - Теплоизоляция трубопроводов (pipe_insulation)

- **ВК** (Водоснабжение и канализация):
  - Монтаж трубопроводов (piping)
  - Сантехнические работы (plumbing)

- **ЭОМ / ЭМ / ЭС** (Электроснабжение):
  - Электромонтажные работы (electrical)
  - Прокладка кабеля (cable_laying)
  - Монтаж электрооборудования (electrical_equipment)

- **СС / СКС** (Слаботочные системы):
  - Монтаж СКС (low_voltage)
  - Монтаж оборудования связи (communication_equipment)

## Алгоритм работы

1. Загрузи информацию о разделе документа (get_section_info).
2. Загрузи материалы, сгруппированные по конструкциям (get_material_facts_by_construction).
3. Для каждой группы материалов определи вид работ:
   - По разделу проекта сузь набор возможных категорий.
   - По названиям материалов определи конкретный вид работ.
   - Поищи подходящие нормы (search_norms) для уточнения категории.
4. Сформируй итоговый JSON-массив work items.

## Формат ответа

Отвечай строго в формате JSON:
\`\`\`json
{
  "work_items": [
    {
      "work_description": "Кладка перегородок из кирпича керамического",
      "work_category": "masonry",
      "construction": "Перегородки П1",
      "source_material_fact_ids": ["uuid1", "uuid2"],
      "confidence": 0.9,
      "reasoning": "Раздел АР, материалы — кирпич, раствор кладочный"
    }
  ]
}
\`\`\`

Не добавляй текст вне JSON-блока.`;

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
          description: 'Текстовый запрос для поиска норм (например, "кладка кирпичных перегородок")',
        },
        category: {
          type: 'string',
          description: 'Категория работ для фильтрации (необязательно)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { query } = input as { query: string; category?: string };
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
    maxSteps: 8,
    temperature: 0.2,
    model: params.model,
  };
}
