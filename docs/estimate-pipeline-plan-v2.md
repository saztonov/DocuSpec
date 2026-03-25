# DocuSpec: Сметный пайплайн v2 (с учётом review)

## Контекст

DocuSpec извлекает материалы из рабочей документации через 3-фазный пайплайн и формирует BOM. Этот план описывает продолжение: от BOM к кандидатам в смету с расценками ФСНБ-2022.

**Ключевой принцип** (по итогам review): система формирует **кандидатов в смету** с объяснениями и трассировкой, а не автоматическую смету. LLM — для классификации, извлечения сложных признаков и re-ranking, а не замена инженерной логики.

**Принятые изменения из review**:
- VolumeCalculator (Quantity Engine) — часть ядра MVP, не "потом"
- Разделение fact_type: observed / derived / inferred / layer
- Пироги → layer_facts (не количественные материалы)
- Unit compatibility check при сопоставлении ресурсов
- dependency_flags для межтомовых зависимостей
- Reconciliation-слой до LLM-агентов
- Приоритет exact match (ГОСТ/код) над embeddings
- Типизация quantities + double_count_guard

---

## Архитектура: 4 агента + reconciliation + quantity engine

```
material_facts + product_facts (из существующего пайплайна)
          │
  ════════╧═══════════════════════════════════════════
  СМЕТНЫЙ ПАЙПЛАЙН v2 (estimatePipeline.ts)
  ═══════════════════════════════════════════════════

Phase A: Подготовка контекста (rule-based)
   │  Загрузка, группировка, извлечение work_hints
   ▼
Phase A.5: Reconciliation (rule-based, ДО агентов)
   │  Дедупликация, сверка, alias-схлопывание,
   │  типизация quantities, conflict detection
   ▼
Phase B: WorkClassifier (Agent 1)
   │  Tools: search_norms, get_material_facts
   │  Определяет виды работ
   ▼
Phase C: ResourceMatcher (Agent 2)
   │  Tools: search_resources, search_by_gost, check_unit_compatibility
   │  Сопоставляет материалы с КСР + проверка единиц
   ▼
Phase D: PricePicker (Agent 3)
   │  Tools: search_norms, get_norm_composition, compare_resources
   │  Подбирает расценки ГЭСН/ФЕР
   ▼
Phase E: VolumeCalculator (Agent 4) ◄── В ЯДРЕ MVP (не отложен)
   │  Tools: get_material_quantities, convert_units, calc_volume
   │  Rule-based + LLM: пересчёт в единицы расценки
   ▼
Phase F: Validation (rule-based)
   │  Проверки: unit_mismatch, double_count, cross_volume_dep
   │  Формирование review queue
   ▼
КАНДИДАТЫ В СМЕТУ (estimate_candidates)
   + review queue + dependency_flags + трассировка
```

---

## Изменения в существующем пайплайне (Этап 2)

### Новое поле `fact_type` в material_facts

Миграция `sql/004_fact_types.sql`:
```sql
ALTER TABLE material_facts ADD COLUMN fact_type text NOT NULL DEFAULT 'observed';
-- observed: прямо из документа (таблицы, текст)
-- derived: расчётный (assembly_total, умножение)
-- inferred: предложенный LLM (низкая уверенность)
-- layer: слой конструкции из пирога (толщина без площади)
```

**Влияние**: пироги (source_section='pirog') получают fact_type='layer'. Движок умножения (assembly_total) — fact_type='derived'. LLM-извлечения с confidence < 0.7 — fact_type='inferred'.

### Новое поле `quantity_type` в material_facts

```sql
ALTER TABLE material_facts ADD COLUMN quantity_type text;
-- assembly_total: кол-во сборок/изделий
-- component_per_assembly: компонент на 1 сборку
-- route_length: длина трассы/кабеля
-- layer_thickness: толщина слоя (мм)
-- area: площадь (м2)
-- volume: объём (м3)
-- count: штуки
-- equipment_count: единицы оборудования
-- weight: масса (кг, т)
```

### Новая таблица `work_hints`

```sql
CREATE TABLE work_hints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  block_id uuid REFERENCES doc_blocks(id),
  hint_text text NOT NULL,
  hint_type text, -- 'coating', 'waterproofing', 'fire_protection', 'mounting', 'preparation'
  related_materials text[], -- упомянутые материалы/ГОСТ
  confidence real DEFAULT 0.8,
  created_at timestamptz DEFAULT now()
);
```

### Новая таблица `dependency_flags`

```sql
CREATE TABLE dependency_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  block_id uuid REFERENCES doc_blocks(id),
  referenced_doc_code text NOT NULL, -- "133/23-ГК-КЖ23"
  referenced_sheet text, -- "л.12-13"
  dependency_type text, -- 'material', 'geometry', 'volume', 'detail'
  description text,
  created_at timestamptz DEFAULT now()
);
```

---

## Phase A.5: Reconciliation Engine (rule-based, ДО агентов)

Новый файл `src/lib/reconciliation.ts`:

1. **Alias-схлопывание**: кириллица/латиница нормализация (х→x, Н→H), ГОСТ-парсинг
2. **Дедупликация с учётом source_section**: если один материал в ведомости и спецификации — определить, это дубль или разный scope
3. **Quantity type detection**: по unit и context определить quantity_type (шт→count, м→route_length, мм→layer_thickness...)
4. **Double-count guard**: если assembly_total + vedomost содержат одинаковый материал — пометить conflict
5. **Cross-volume dependency extraction**: regex-поиск "см. 133/23-ГК-..." → INSERT dependency_flags
6. **Work hint extraction**: поиск в блоках "Общие указания" → INSERT work_hints

---

## Phase C: ResourceMatcher — с проверкой единиц

Добавлен tool `check_unit_compatibility`:

```typescript
// Tool для Agent 2
{
  name: "check_unit_compatibility",
  description: "Проверяет совместимость единиц измерения между материалом из документа и ресурсом КСР",
  execute: async (input: { docUnit: string, ksrUnit: string }) => {
    // Возвращает: {compatible: boolean, conversionFormula?: string, warning?: string}
    // Пример: {docUnit: "м3", ksrUnit: "тыс.шт"} → {compatible: false, warning: "Требуется формула пересчёта"}
  }
}
```

Агент обязан вызвать `check_unit_compatibility` перед `confirm_match`. Если единицы несовместимы → `needs_review=true` + сохранить предполагаемую формулу пересчёта.

**Приоритет matching** (вместо "всё через embeddings"):
1. Exact — по ГОСТ/ТУ/коду → confidence 0.95
2. Exact — по марке/модели → confidence 0.9
3. Rule-based синонимы (из таблицы fsnb_synonyms) → confidence 0.85
4. RAG/embeddings (pgvector) как fallback → confidence 0.7-0.8
5. LLM re-ranking top-кандидатов → confidence от LLM

---

## Phase E: VolumeCalculator (В ЯДРЕ MVP)

**Файл**: `src/lib/agents/volumeCalculator.ts`

НЕ sum(quantity). Вместо этого — формальный пересчёт:

**Tools агента**:

| Tool | Что делает |
|------|-----------|
| `get_material_quantities(factIds)` | Загрузить material_facts с quantity, unit, quantity_type |
| `get_rate_unit(rateId)` | Единица измерения расценки ("100 м2", "м3") |
| `convert_units(value, fromUnit, toUnit)` | Rule-based конвертация (м2→100м2, шт→1000шт) |
| `calc_volume(formula, params)` | Расчёт по формуле (площадь×толщина, длина×сечение) |
| `flag_needs_geometry(description)` | Пометить: нужна геометрическая база из смежного тома |

**Правила**:
- fact_type='layer' → НЕ создавать estimate_line (нет площади). Пометить dependency: "нужна площадь из геометрии"
- fact_type='derived' (assembly_total) → использовать уже рассчитанный quantity
- quantity_type='layer_thickness' → нужна площадь × толщина
- quantity_type='route_length' → можно использовать напрямую (метраж кабеля)
- Если единица расценки != единица факта → конвертация через `convert_units`
- Если конвертация невозможна → `needs_review=true` + flag_needs_geometry

---

## Phase F: Validation (rule-based, замена Agent 5)

Вместо полноценного Verifier-агента — rule-based проверки:

**Файл**: `src/lib/estimateValidator.ts`

| Проверка | Тип | Действие |
|----------|-----|----------|
| Материал без работы | `uncovered_material` | warning |
| unit mismatch между фактом и расценкой | `unit_mismatch` | error → needs_review |
| Двойной счёт (одинаковый материал из разных sources) | `double_count` | error → conflict case |
| Межтомовая зависимость не разрешена | `cross_volume_dep` | warning + dependency_flag |
| Layer fact без геометрической базы | `no_geometry` | info (ожидаемо) |
| resource_coverage расценки < 50% | `low_coverage` | warning |

**Результат**: `estimate_review_queue` — таблица с типизированными проблемами для UI.

---

## Обновлённый UI: Review-ориентированный

Вместо "подтверди кандидата" → "разреши конфликт / подтверди вычисление / утверди match":

**EstimatePage вкладки**:

1. **Обзор** — статус, прогресс, агент-лог, dependency_flags (какие тома нужны)
2. **Работы** — виды работ + work_hints из "Общих указаний"
3. **Ресурсы** — сопоставления с КСР + unit compatibility status
4. **Расценки** — подобранные расценки + resource_coverage
5. **Объёмы** — расчёт объёмов с формулами пересчёта, пометки "нужна геометрия"
6. **Review Queue** — типизированные проблемы: conflicts, unit mismatches, dependencies, low confidence

---

## Новые файлы (обновлённый список MVP)

### SQL-миграции
| Файл | Назначение |
|------|-----------|
| `sql/004_fact_types.sql` | + fact_type, quantity_type в material_facts; work_hints; dependency_flags |
| `sql/005_fsnb_reference_tables.sql` | pgvector + справочники ФСНБ + fsnb_synonyms |
| `sql/006_estimate_tables.sql` | estimates, work_items, resource_matches, rate_matches, estimate_lines, review_queue |

### Библиотеки
| Файл | Назначение |
|------|-----------|
| `src/lib/ragSearch.ts` | RAG: embedding + pgvector + FTS |
| `src/lib/reconciliation.ts` | Phase A.5: дедупликация, alias, conflicts, dependency extraction |
| `src/lib/agents/agentRunner.ts` | Общий движок ReAct-агентов |
| `src/lib/agents/workClassifier.ts` | Agent 1 |
| `src/lib/agents/resourceMatcher.ts` | Agent 2 (+ unit check) |
| `src/lib/agents/pricePicker.ts` | Agent 3 |
| `src/lib/agents/volumeCalculator.ts` | Agent 4 (Quantity Engine, в ядре) |
| `src/lib/estimateValidator.ts` | Phase F: rule-based validation |
| `src/lib/estimatePipeline.ts` | Оркестратор Phase A→F |
| `src/lib/fsnbImporter.ts` | Импорт XML ГрандСмета |
| `src/lib/unitConverter.ts` | Rule-based конвертация единиц |

### Хуки, типы, страницы, компоненты
(без изменений от предыдущей версии плана — см. docs/estimate-pipeline-plan.md)

---

## Что отложено (production-этапы)

| Отложено | Причина |
|----------|---------|
| Серверная оркестрация (job queue, audit log) | Production concern. MVP в браузере. |
| Полный Evidence Graph (11 типов сущностей) | Заменён на fact_type + quantity_type + work_hints + dependency_flags |
| Discipline packs (AR/KR, КЖ, ОВ, ЭОМ) | В MVP — через section_code-aware промпты |
| Полный normalization engine | В MVP — ГОСТ-парсинг + кириллица/латиница |
| QA-слой входа (checksum, quarantine) | В MVP — существующие has_error + error_text |
| Verifier с циклами обратной связи (Agent 5) | Заменён на rule-based estimateValidator |
| Assembler (Agent 6): накладные, прибыль, индексы | Pilot-этап |

---

## Верификация MVP

1. **Reconciliation**: загрузить АР6 → проверить: dependency_flags содержат ссылки на КЖ23, АР3, АР8 и т.д.; work_hints содержат "ПФ-115 за два раза по грунту ГФ-021"; пироги имеют fact_type='layer'

2. **ResourceMatcher + unit check**: "Кирпич полнотелый ГОСТ 530-2012" → ресурс КСР. Если КСР в тыс.шт, а документ в м³ → `needs_review=true` + warning в review queue

3. **VolumeCalculator**: assembly_total (derived, qty=65) → расценка в "100 шт" → volume = 0.65. Layer facts → не формируют estimate_line, а помечают "нужна площадь"

4. **Validation**: двойной счёт (один материал в ведомости + assembly_total) → conflict case в review queue

5. **Review Queue UI**: сметчик видит типизированные проблемы, может подтвердить/отклонить/скорректировать каждого кандидата
