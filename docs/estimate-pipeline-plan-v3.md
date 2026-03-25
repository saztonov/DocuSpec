# DocuSpec: Сметный пайплайн v3 (с учётом review + ТГ + RAG)

## Контекст

DocuSpec извлекает материалы из рабочей документации через 3-фазный пайплайн и формирует BOM. Этот план описывает продолжение: от BOM к кандидатам в смету с расценками ФСНБ-2022.

**Ключевой принцип**: система формирует **кандидатов в смету** с объяснениями и трассировкой, а не автоматическую смету. LLM — для классификации, извлечения сложных признаков и re-ranking, а не замена инженерной логики.

**Принятые изменения из review**:
- VolumeCalculator (Quantity Engine) — часть ядра MVP, не "потом"
- Разделение fact_type: observed / derived / inferred / layer
- Пироги → layer_facts (не количественные материалы)
- Unit compatibility check при сопоставлении ресурсов
- dependency_flags для межтомовых зависимостей
- Reconciliation-слой до LLM-агентов
- Приоритет exact match (ГОСТ/код) над embeddings
- Типизация quantities + double_count_guard

**Добавлено в v3**:
- Справочник ТГ (технологических групп) ФСНБ-2022 — фильтрация ресурсов по допустимости для нормы
- Изменение порядка фаз: PricePicker ДО ResourceMatcher (сначала норма, потом ресурс в рамках ТГ)
- Hybrid RAG: pgvector + tsvector BM25 + RRF fusion + ТГ-фильтр
- Neo4j не нужен — PostgreSQL покрывает все запросы

---

## Архитектура: 4 агента + reconciliation + quantity engine

```
material_facts + product_facts (из существующего пайплайна)
          │
  ════════╧═══════════════════════════════════════════
  СМЕТНЫЙ ПАЙПЛАЙН v3 (estimatePipeline.ts)
  ═══════════════════════════════════════════════════

Phase A: Подготовка контекста (rule-based)
   │  Загрузка, группировка, извлечение work_hints
   ▼
Phase A.5: Reconciliation (rule-based, ДО агентов)
   │  Дедупликация, сверка, alias-схлопывание,
   │  типизация quantities, conflict detection,
   │  межтомовые зависимости
   ▼
Phase B: WorkClassifier (Agent 1)
   │  Tools: search_norms, get_material_facts
   │  Определяет виды работ
   ▼
Phase C: PricePicker (Agent 2) ◄── ТЕПЕРЬ ДО ResourceMatcher
   │  Tools: search_norms, get_norm_composition, compare_resources
   │  Подбирает нормы ГЭСН → определяет ТГ
   ▼
Phase D: ResourceMatcher (Agent 3) ◄── ТЕПЕРЬ ПОСЛЕ PricePicker
   │  Tools: get_allowed_resources (из ТГ), search_by_gost,
   │         check_unit_compatibility, search_resources (fallback)
   │  Сопоставляет материалы с КСР В РАМКАХ ТГ нормы
   ▼
Phase E: VolumeCalculator (Agent 4) ◄── В ЯДРЕ MVP
   │  Tools: get_material_quantities, convert_units, calc_volume
   │  Rule-based + LLM: пересчёт в единицы расценки
   ▼
Phase F: Validation (rule-based)
   │  Проверки: unit_mismatch, double_count, cross_volume_dep,
   │  ТГ-совместимость
   ▼
КАНДИДАТЫ В СМЕТУ (estimate_candidates)
   + review queue + dependency_flags + трассировка
```

### Ключевое изменение порядка: PricePicker ДО ResourceMatcher

**Почему**: в ФСНБ-2022 ТГ привязаны к нормам ГЭСН. Чтобы подбирать ресурс в рамках допустимой ТГ, нужно сначала определить норму. Поэтому:
1. Agent 1 определяет вид работы
2. Agent 2 (PricePicker) подбирает норму ГЭСН → из неё извлекаем ТГ
3. Agent 3 (ResourceMatcher) подбирает ресурс **внутри ТГ** этой нормы
4. Если в ТГ нет подходящего → fallback на весь КСР с `needs_review=true`

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

## Справочник ТГ (технологических групп) ФСНБ-2022

### Назначение

В ФСНБ-2022 многие ресурсы в нормах ГЭСН — **открытые** (обобщённые наименования без конкретной марки). ТГ ограничивает выбор конкретного ресурса КСР только технологически допустимыми вариантами для данной нормы. Связь M:N: одна ТГ может относиться к нескольким нормам, одна норма может иметь несколько ТГ.

### Таблицы БД

```sql
-- Справочник ТГ
CREATE TABLE fsnb_tech_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_code text UNIQUE NOT NULL,  -- код ТГ
  tg_name text NOT NULL,         -- "Кирпич керамический обыкновенный"
  description text,
  created_at timestamptz DEFAULT now()
);

-- Связь ТГ → допустимые ресурсы
CREATE TABLE fsnb_tg_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id uuid REFERENCES fsnb_tech_groups(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES fsnb_resources(id) ON DELETE CASCADE,
  UNIQUE(tg_id, resource_id)
);

-- Связь Норма → ТГ (через открытые ресурсы нормы)
CREATE TABLE fsnb_norm_tech_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norm_id uuid REFERENCES fsnb_norms(id) ON DELETE CASCADE,
  tg_id uuid REFERENCES fsnb_tech_groups(id) ON DELETE CASCADE,
  open_resource_code text,  -- код открытого ресурса в норме (с "ххх")
  UNIQUE(norm_id, tg_id)
);
```

### Как ТГ меняет работу Agent 3 (ResourceMatcher)

**Новые tools**:

| Tool | Описание |
|------|----------|
| `get_allowed_resources(normId)` | Загрузить ресурсы из ТГ для данной нормы → fsnb_norm_tech_groups JOIN fsnb_tg_resources JOIN fsnb_resources |
| `search_within_tg(tgId, query)` | Поиск по ресурсам только внутри конкретной ТГ (embedding + FTS) |

**Алгоритм Agent 3 (ResourceMatcher)**:
1. Получить normId из Phase C (PricePicker)
2. `get_allowed_resources(normId)` → список допустимых ресурсов из ТГ
3. Если ТГ содержит < 50 ресурсов → прямой match по ГОСТ/наименованию
4. Если ТГ большая → `search_within_tg(tgId, materialName)` (семантический поиск внутри ТГ)
5. Если в ТГ нет подходящего → fallback на весь КСР + `needs_review=true` + warning "ресурс вне ТГ"
6. `check_unit_compatibility` обязателен в любом случае

---

## Hybrid RAG: устройство

### Архитектура поиска

```
Запрос: "Кладка стен из кирпича керамического"
              │
  ┌───────────┴───────────┐
  ▼                       ▼
Semantic Path           Keyword Path
(pgvector HNSW)         (tsvector BM25)
  │                       │
embedding(query)        to_tsvector('russian', query)
  │                       │
cosine similarity       ts_rank matching
→ top-20                → top-10
  │                       │
  └───────┬───────────────┘
          ▼
  RRF Fusion (Reciprocal Rank Fusion)
  score(d) = Σ 1/(k + rank_i), k=60
          │
          ▼
  Merged top-20 candidates
          │
          ▼
  ТГ-фильтр (если известна норма)
  → оставить только допустимые ресурсы
          │
          ▼
  LLM re-ranking (Agent через tool_use)
  → top-3 с объяснениями
```

### Почему hybrid, а не чистый vector

- **Коды** (ГЭСН 08-02-001-01): embedding-модели плохо различают числовые идентификаторы, BM25 находит точно
- **ГОСТ** (530-2012): keyword search точнее для стандартизированных кодов
- **Наименования** ("Кирпич полнотелый 250×120×65"): semantic search находит синонимы и вариации

### Чанкинг (формирование search_text)

**Для норм ГЭСН** (1 норма = 1 chunk):
```
"ГЭСН 08-02-001-01 | Сборник 08: Конструкции из кирпича |
Раздел 02: Кладка стен | Кладка стен из кирпича керамического
обыкновенного | 100 м2 кладки | Ресурсы: кирпич, раствор, сетка арматурная"
```

**Для ресурсов КСР** (1 ресурс = 1 chunk):
```
"21.1.01.01-0001 | Кирпич керамический обыкновенный полнотелый
250×120×65 мм М-150 | тыс.шт | ГОСТ 530-2012 | ТГ: Кирпич керамический"
```

Включаем: код + "хлебные крошки" + наименование + единицу + ГОСТ + ТГ.

### Embedding-модель

MVP: `text-embedding-3-small` через OpenRouter (1536d, доступен из коробки).
Production: BGE-M3 (лучший для русского текста, ruMTEB score 74.8).

### SQL-функция hybrid search

```sql
CREATE OR REPLACE FUNCTION hybrid_search_resources(
  query_embedding vector(1536),
  query_text text,
  match_limit int DEFAULT 20
) RETURNS TABLE (id uuid, name text, code text, score float) AS $$
  WITH semantic AS (
    SELECT id, name, code,
           ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding) AS rank
    FROM fsnb_resources
    ORDER BY embedding <=> query_embedding LIMIT 20
  ),
  keyword AS (
    SELECT id, name, code,
           ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('russian', search_text),
           plainto_tsquery('russian', query_text)) DESC) AS rank
    FROM fsnb_resources
    WHERE to_tsvector('russian', search_text) @@ plainto_tsquery('russian', query_text)
    LIMIT 10
  ),
  combined AS (
    SELECT COALESCE(s.id, k.id) AS id,
           COALESCE(s.name, k.name) AS name,
           COALESCE(s.code, k.code) AS code,
           COALESCE(1.0/(60 + s.rank), 0) + COALESCE(1.0/(60 + k.rank), 0) AS score
    FROM semantic s FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT id, name, code, score FROM combined ORDER BY score DESC LIMIT match_limit;
$$ LANGUAGE sql;
```

### Почему не Neo4j

| Запрос | PostgreSQL | Neo4j |
|--------|-----------|-------|
| Ресурсы ТГ для нормы | JOIN 3 таблицы, <5ms | MATCH (n)-[:HAS_TG]->(tg)-[:CONTAINS]->(r) |
| Нормы по ресурсу | JOIN fsnb_norm_resources | MATCH (r)<-[:USES]-(n) |
| Иерархия сборника | ltree / recursive CTE | MATCH path |
| Семантический поиск | pgvector cosine | Отдельный сервис |

PostgreSQL покрывает все запросы. Neo4j добавлять когда: >1M узлов, graph-алгоритмы (PageRank), или рекомендации через 3+ уровней.

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

## Phase D: ResourceMatcher (Agent 3) — ТГ + проверка единиц

**Теперь идёт ПОСЛЕ PricePicker** — Agent 3 знает норму, может использовать ТГ.

**Tools агента**:

| Tool | Описание |
|------|----------|
| `get_allowed_resources(normId)` | Ресурсы из ТГ для нормы |
| `search_within_tg(tgId, query)` | Семантический поиск внутри ТГ |
| `search_by_gost(gostCode)` | Точный поиск по ГОСТ |
| `search_resources(query)` | Fallback — поиск по всему КСР |
| `check_unit_compatibility(docUnit, ksrUnit)` | Проверка совместимости единиц |
| `confirm_match(factId, resourceId, confidence, reasoning)` | Зафиксировать сопоставление |

**Приоритет matching**:
1. Exact — по ГОСТ/ТУ/коду внутри ТГ → confidence 0.95
2. Exact — по марке/модели внутри ТГ → confidence 0.9
3. Rule-based синонимы (fsnb_synonyms) внутри ТГ → confidence 0.85
4. Semantic search внутри ТГ (pgvector) → confidence 0.8
5. Fallback: поиск по всему КСР (вне ТГ) → confidence 0.6-0.7 + `needs_review=true`
6. LLM re-ranking если >3 кандидата

**Обязательно**: `check_unit_compatibility` перед `confirm_match`. Несовместимые единицы → `needs_review=true` + предполагаемая формула пересчёта.

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

## Система динамических скиллов (Skill Engine)

### Концепция

Скиллы агентов — это **не фиксированный код, а управляемая библиотека**, которая растёт и улучшается по мере накопления опыта. Каждый скилл — это структурированная единица знания, которую агент может вызвать через tool_use.

**Три типа скиллов**:

| Тип | Как хранится | Как используется | Пример |
|-----|-------------|-----------------|--------|
| **rule** | JSON-правило в БД | Прямое rule-based выполнение | "ГОСТ 530-2012 → ресурс КСР 21.1.01.01-xxxx, confidence 0.95" |
| **prompt** | Промпт-шаблон в БД | LLM-вызов с контекстом | "Определи вид работы для группы металлических элементов ограждения" |
| **example_bank** | Набор few-shot примеров с embeddings | Dynamic few-shot injection в промпт агента | 10 подтверждённых примеров "материал из документа → ресурс КСР" |

### Таблицы БД

```sql
-- Реестр скиллов
CREATE TABLE skill_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL,         -- 'work_classifier' | 'resource_matcher' | 'price_picker' | 'volume_calculator'
  skill_type text NOT NULL,         -- 'rule' | 'prompt' | 'example_bank'
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,

  -- Для rule-скиллов: JSON-правило
  rule_config jsonb,
  -- Для prompt-скиллов: шаблон промпта
  prompt_template text,
  -- Для example_bank: ссылка на группу примеров
  example_group_id uuid,

  -- Метрики производительности
  total_uses integer DEFAULT 0,
  successful_uses integer DEFAULT 0,    -- подтверждено пользователем
  rejected_uses integer DEFAULT 0,      -- отклонено пользователем
  accuracy_rate real,                   -- successful / total
  avg_confidence real,

  -- Управление
  created_by text DEFAULT 'system',     -- 'system' | 'auto_proposed' | 'user'
  approved_by text,                     -- null = ожидает утверждения
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Банк примеров (few-shot)
CREATE TABLE skill_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,               -- для группировки примеров одного скилла
  agent_type text NOT NULL,

  -- Вход
  input_text text NOT NULL,             -- "Кирпич полнотелый КР-р-по 250x120x65"
  input_context jsonb,                  -- {section_code: "АР", gost: "530-2012", unit: "м3"}
  input_embedding vector(1536),         -- для semantic retrieval

  -- Выход (подтверждённый результат)
  output_result jsonb NOT NULL,         -- {resource_code: "21.1.01.01-0001", confidence: 0.95}

  -- Метаданные
  source text,                          -- 'user_correction' | 'confirmed_match' | 'manual'
  doc_id uuid,                          -- из какого документа
  quality_score real DEFAULT 1.0,       -- вес примера
  created_at timestamptz DEFAULT now()
);

-- Обратная связь по скиллам
CREATE TABLE skill_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid REFERENCES skill_registry(id),
  estimate_id uuid,

  action text NOT NULL,                 -- 'confirmed' | 'corrected' | 'rejected'
  original_result jsonb,                -- что предложил скилл
  corrected_result jsonb,               -- что исправил пользователь (null если confirmed)

  user_comment text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_skill_examples_embedding ON skill_examples
  USING ivfflat (input_embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_skill_examples_group ON skill_examples (group_id);
CREATE INDEX idx_skill_feedback_skill ON skill_feedback (skill_id);
```

### Как агенты используют скиллы

AgentRunner загружает скиллы перед запуском агента:

```
1. Загрузить active rule-скиллы для agent_type
   → добавить как tool: "apply_rule(ruleId, input)"

2. Загрузить prompt-скиллы
   → добавить секции в system prompt агента

3. Для каждого material_fact:
   a) Сначала проверить rule-скиллы (быстрый exact match)
   b) Если правило сработало → использовать результат, не вызывать LLM
   c) Если нет → dynamic few-shot: найти 3-5 похожих примеров через pgvector
   d) Добавить примеры в user message как few-shot
   e) Вызвать LLM с контекстом + примерами
```

**Новый tool для всех агентов**:

| Tool | Описание |
|------|----------|
| `apply_matching_rule(input)` | Проверить rule-скиллы: если есть правило для этого ГОСТ/кода/наименования → вернуть результат без LLM |
| `get_similar_examples(query, limit)` | pgvector поиск по skill_examples → top-N похожих подтверждённых примеров |
| `log_skill_usage(skillId, result)` | Зафиксировать использование скилла (для метрик) |

### Механизм генерации скиллов (Experience Capture)

**При подтверждении пользователем** (confirmed match / correction):

```
Пользователь подтвердил: "Кирпич ГОСТ 530-2012" → КСР 21.1.01.01-0001

1. INSERT в skill_examples:
   input_text: "Кирпич полнотелый КР-р-по 250x120x65"
   input_context: {gost: "530-2012", unit: "м3"}
   output_result: {resource_code: "21.1.01.01-0001"}
   source: 'confirmed_match'

2. INSERT в skill_feedback:
   action: 'confirmed'
   original_result: {...}

3. Проверить: есть ли уже 5+ подтверждённых примеров для этого ГОСТ?
   Если да → АВТОМАТИЧЕСКИ ПРЕДЛОЖИТЬ rule-скилл:
   {
     agent_type: 'resource_matcher',
     skill_type: 'rule',
     name: 'ГОСТ 530-2012 → КСР кирпич керамический',
     rule_config: {
       match_field: 'gost',
       match_value: 'ГОСТ 530-2012',
       result: {resource_code: '21.1.01.01-*', tg_code: 'ТГ-008'},
       confidence: 0.95
     },
     created_by: 'auto_proposed',
     approved_by: null  -- ждёт утверждения
   }
```

**При отклонении/коррекции** пользователем:

```
Пользователь исправил: система предложила ресурс A, пользователь выбрал B

1. INSERT skill_feedback: action='corrected', original=A, corrected=B
2. INSERT skill_examples: output_result=B, source='user_correction'
3. UPDATE skill_registry: rejected_uses++, accuracy_rate пересчитать
4. Если accuracy_rate < 0.6 и total_uses > 10 → пометить скилл для review
```

### Механизм улучшения скиллов

**Автоматическое предложение новых rule-скиллов**:
- Триггер: 5+ одинаковых подтверждённых результатов для одного паттерна
- Создаётся скилл с `created_by='auto_proposed'`, `approved_by=null`
- В Admin UI → вкладка "Предложенные скиллы": сметчик видит паттерн и может утвердить/отклонить

**Confidence calibration**:
- Если скилл имеет accuracy_rate 0.7 при заявленном confidence 0.9 → пересчитать confidence
- Формула: `calibrated_confidence = accuracy_rate * original_confidence`

**Prompt improvement**:
- Если prompt-скилл имеет accuracy_rate < 0.7 и > 20 использований
- Собрать 5 worst-performing примеров
- Отправить в LLM с мета-промптом: "Проанализируй ошибки и предложи улучшенный промпт"
- Создать новую версию (version++), deactivate старую

**Dynamic few-shot injection**:
- Перед каждым LLM-вызовом агента → `get_similar_examples(query, 5)`
- pgvector находит 5 ближайших подтверждённых примеров
- Примеры добавляются в user message как few-shot context
- Это **автоматически улучшает точность** по мере роста банка примеров

### Lifecycle скилла

```
Вариант A: Ручное создание
  Admin → "Создать скилл" → rule/prompt → approved_by=admin → active

Вариант B: Автоматическое предложение
  5+ confirm → auto_proposed → Admin review → approved/rejected

Вариант C: Деградация
  accuracy_rate падает → flagged for review → Admin deactivates/updates

Вариант D: Версионирование
  Старый скилл v1 → improved prompt → v2 (active), v1 (deactivated)
```

### Admin UI — вкладка "Скиллы"

| Секция | Содержание |
|--------|-----------|
| **Активные скиллы** | Таблица: agent, type, name, accuracy, uses, version. Действия: edit, deactivate |
| **Предложенные** | Автоматически предложенные скиллы (auto_proposed). Действия: approve, reject, edit |
| **Банк примеров** | Поиск по примерам, фильтр по agent/quality. Действия: edit, delete, change quality |
| **Метрики** | Accuracy по агентам, trending (улучшается/ухудшается), top скиллы |

### Файлы для Skill Engine

| Файл | Назначение |
|------|-----------|
| `src/lib/skillEngine.ts` | Загрузка скиллов, dynamic few-shot, rule application, logging |
| `src/lib/skillProposer.ts` | Автоматическое предложение скиллов из feedback |
| `src/hooks/useSkills.ts` | CRUD скиллов для Admin UI |
| `src/components/admin/SkillsTab.tsx` | Вкладка управления скиллами |

---

## Первые версии скиллов агентов

### Скилл: Инженер по анализу рабочей документации (для Agent 1 — WorkClassifier)

**Тип**: prompt + example_bank
**Роль**: Анализирует извлечённые материалы и контекст раздела, определяет виды строительных работ.

**Промпт-скилл** (system prompt):
```
Ты — инженер-проектировщик с 20-летним опытом в строительстве. Анализируешь
материалы из рабочей документации и определяешь, какие виды строительных работ
им соответствуют.

Правила:
- Раздел АР/КР → ищи: отделочные, каменные, фасадные, кровельные, полы, ограждения
- Раздел КЖ → ищи: бетонные, арматурные, опалубочные, монолитные
- Раздел КМ → ищи: металлоконструкции, сварка, антикоррозийная защита
- Раздел ОВ/ВК → ищи: сантехнические, трубопроводные, теплоизоляция
- Раздел ЭОМ/СС/ОЗДС → ищи: электромонтажные, кабельные, слаботочные

Используй tool search_norms для валидации: каждый вид работы должен соответствовать
реальному сборнику ГЭСН. Если не находишь подходящую норму — пометь needs_review.

Учитывай work_hints из "Общих указаний" — они часто описывают скрытые работы
(грунтовка, гидроизоляция, огнезащита), которые не очевидны из списка материалов.
```

**Rule-скиллы (начальные)**:
```json
[
  {"match": {"section_code": "АР", "materials_contain": "кирпич"}, "result": {"work_category": "masonry", "gesn_collection": "08"}},
  {"match": {"section_code": "АР", "materials_contain": "стяжка|раствор цемент"}, "result": {"work_category": "finishing", "gesn_collection": "11"}},
  {"match": {"section_code": "АР", "materials_contain": "ограждение стальн|полоса стальн"}, "result": {"work_category": "metalwork", "gesn_collection": "09"}},
  {"match": {"section_code": "АР", "materials_contain": "гранит|облицовка"}, "result": {"work_category": "finishing", "gesn_collection": "15"}},
  {"match": {"section_code": "ЭОМ|СС|ОЗДС", "materials_contain": "кабель"}, "result": {"work_category": "electrical", "gesn_collection": "08м"}},
  {"match": {"section_code": "ЭОМ|СС|ОЗДС", "materials_contain": "труба гофр"}, "result": {"work_category": "electrical", "gesn_collection": "08м"}}
]
```

---

### Скилл: Сметчик по подбору расценок (для Agent 2 — PricePicker)

**Тип**: prompt + rule + example_bank
**Роль**: Подбирает нормы ГЭСН для видов работ, проверяя состав ресурсов.

**Промпт-скилл**:
```
Ты — инженер-сметчик с глубоким знанием ФСНБ-2022. Подбираешь нормы ГЭСН
для строительных работ.

Алгоритм:
1. По описанию работы и work_category определи сборник ГЭСН
2. Используй search_norms для поиска подходящих норм
3. Для каждого кандидата вызови get_norm_composition — проверь состав ресурсов
4. Сравни ресурсы нормы с фактическими материалами через compare_resources
5. Выбери норму с максимальным resource_coverage
6. Если coverage < 50% — предложи 2-3 альтернативы и пометь needs_review

Важно:
- Единица измерения нормы (MeasureUnit) должна быть совместима с quantity_type материалов
- Для ограждений смотри сборник 09 (металлоконструкции) или 12 (кровля/ограждения)
- Для отделки — сборники 11 (полы), 15 (штукатурка/облицовка), 62 (покраска)
- Для кладки — сборник 08
```

**Rule-скиллы**:
```json
[
  {"match": {"work_category": "masonry", "has_gost": "530-2012"}, "result": {"search_query": "кладка стен кирпич керамический", "collection_filter": "08"}},
  {"match": {"work_category": "finishing", "materials_contain": "стяжка цемент"}, "result": {"search_query": "устройство стяжек цементных", "collection_filter": "11"}},
  {"match": {"work_category": "finishing", "materials_contain": "облицовка камн|гранит"}, "result": {"search_query": "облицовка натуральным камнем", "collection_filter": "15"}},
  {"match": {"work_category": "metalwork", "materials_contain": "ограждение"}, "result": {"search_query": "монтаж ограждений стальных лестниц", "collection_filter": "09"}}
]
```

---

### Скилл: Специалист по подбору материалов (для Agent 3 — ResourceMatcher)

**Тип**: prompt + rule + example_bank
**Роль**: Сопоставляет материалы из документации с позициями КСР ФСНБ-2022, используя ТГ.

**Промпт-скилл**:
```
Ты — специалист по строительным материалам и нормативам ФСНБ-2022.
Сопоставляешь материалы из проектной документации с кодами КСР.

Алгоритм:
1. Если известна норма ГЭСН — вызови get_allowed_resources(normId) для получения допустимых ресурсов из ТГ
2. Если указан ГОСТ — начни с search_by_gost внутри ТГ
3. Если ГОСТ нет — search_within_tg по наименованию
4. ОБЯЗАТЕЛЬНО вызови check_unit_compatibility перед confirm_match
5. Если в ТГ нет подходящего — search_resources по всему КСР (fallback)

Особенности:
- Коды материалов КСР начинаются с 01-11 (книги ФСБЦ)
- Коды машин начинаются с 91
- Кирпич: книга 01, часть 01.4 (керамический) или 01.5 (силикатный)
- Металлопрокат: книга 03
- Кабели: книга 07
- Трубы: книга 06

Единицы: в КСР часто укрупнённые (тыс.шт, 100 м2, т).
Если единица документа ≠ единице КСР — зафиксируй формулу пересчёта.
```

**Rule-скиллы (ГОСТ → КСР)**:
```json
[
  {"match": {"gost": "530-2012"}, "result": {"ksr_book": "01", "ksr_section": "01.4", "description": "Кирпич керамический"}},
  {"match": {"gost": "28013-98"}, "result": {"ksr_book": "04", "description": "Растворы строительные"}},
  {"match": {"gost": "103-2006"}, "result": {"ksr_book": "03", "description": "Прокат сортовой стальной"}},
  {"match": {"gost": "9941-81"}, "result": {"ksr_book": "03", "description": "Трубы стальные"}},
  {"match": {"gost": "6465-2023"}, "result": {"ksr_book": "10", "description": "Эмали и лаки"}}
]
```

---

### Скилл: Инженер-расчётчик объёмов (для Agent 4 — VolumeCalculator)

**Тип**: prompt + rule
**Роль**: Пересчитывает количества из спецификаций в единицы измерения расценок.

**Промпт-скилл**:
```
Ты — инженер-расчётчик, специалист по определению объёмов строительных работ.

Правила пересчёта:
- Расценка в "1000 м3" → volume = qty_m3 / 1000
- Расценка в "100 м2" → volume = qty_m2 / 100
- Расценка в "1000 шт" → volume = qty_sht / 1000
- Расценка в "т" и факт в "кг" → volume = qty_kg / 1000
- Расценка в "т" и факт в "м.п." → нужна масса п.м. (из справочника или LLM)

fact_type='layer' (пирог) → НЕ рассчитывай объём, пометь:
"Требуется площадь конструкции из раздела КЖ/АР"

fact_type='derived' (assembly_total) → quantity уже итоговый, используй напрямую

Если не можешь пересчитать — flag_needs_geometry с описанием что нужно.
```

**Rule-скиллы (конвертация единиц)**:
```json
[
  {"from": "м2", "to": "100 м2", "formula": "qty / 100"},
  {"from": "м3", "to": "1000 м3", "formula": "qty / 1000"},
  {"from": "шт", "to": "1000 шт", "formula": "qty / 1000"},
  {"from": "шт", "to": "100 шт", "formula": "qty / 100"},
  {"from": "кг", "to": "т", "formula": "qty / 1000"},
  {"from": "м", "to": "100 м", "formula": "qty / 100"},
  {"from": "м", "to": "км", "formula": "qty / 1000"}
]
```

---

### Технические скиллы (общие для всех агентов)

**Скилл: OCR-коррекция** (rule):
```json
[
  {"pattern": "спилобата", "correction": "стилобата"},
  {"pattern": "НF", "correction": "НФ"},
  {"pattern": "2x1,5", "correction": "2×1,5"},
  {"pattern": "ГOCT", "correction": "ГОСТ"},
  {"pattern": "м З", "correction": "м3"}
]
```

**Скилл: Парсинг ГОСТ** (rule):
```json
{"regex": "ГОСТ\\s*(Р\\s*)?([\\d.]+-[\\d]+)", "extract": {"type": "gost", "standard": "$1", "number": "$2"}}
```

**Скилл: Парсинг размеров** (rule):
```json
{"regex": "(\\d+)[×xх](\\d+)[×xх]?(\\d+)?", "extract": {"width": "$1", "height": "$2", "depth": "$3"}}
```

---

## Механизм импорта ФСНБ-2022 из XML

### Источник данных

Папка `C:\Users\Usr\claudeprojects\ФСНБ-22` содержит 18 версий нормативов (от 2022 до 2026). Используем **последнюю версию** (приказ от 17.02.2026 № 91пр).

### Файлы для импорта

| Файл | Таблица БД | Объём |
|------|-----------|-------|
| `ГЭСН.xml` (~85 МБ) | fsnb_norms + fsnb_norm_resources | ~17,000 норм |
| `ГЭСНм.xml` (~49 МБ) | fsnb_norms + fsnb_norm_resources | ~4,000 норм |
| `ГЭСНр.xml` (~7.6 МБ) | fsnb_norms + fsnb_norm_resources | ~2,000 норм |
| `ГЭСНп.xml` (~2.8 МБ) | fsnb_norms + fsnb_norm_resources | ~2,000 норм |
| `ФСБЦ_Мат&Оборуд.xml` (~19 МБ) | fsnb_resources | ~12,000 ресурсов |
| `ФСБЦ_Маш.xml` (~1 МБ) | fsnb_resources | ~2,500 машин |
| `База ТГ.xml` (~3 МБ) | fsnb_tech_groups + fsnb_tg_resources | ~2,500 ТГ |
| `Ключи перехода ТГ.xml` (~7.5 МБ) | fsnb_norm_tech_groups | ~50,000 связей |

**Итого**: ~40,000 норм, ~15,000 ресурсов, ~2,500 ТГ, ~50,000+ связей

### XML-структура (из реальных файлов)

**ГЭСН.xml** — иерархия:
```xml
<base BaseType="ГЭСН">
  <ResourcesDirectory>
    <ResourceCategory Type="СТРОИТЕЛЬНЫЕ РАБОТЫ" CodePrefix="ГЭСН">
      <Section Type="Сборник" Code="01" Name="Земляные работы">
        <Section Type="Раздел" Code="1" Name="...">
          <Section Type="Таблица" Code="01-01-001" Name="...">
            <NameGroup BeginName="Разработка грунта...">
              <Work Code="01-01-001-01" EndName="..." MeasureUnit="1000 м3">
                <Resources>
                  <Resource Code="1-100-38" Quantity="1.54" />
                  <Resource Code="91.01.01-035" EndName="Бульдозеры..." Quantity="1.6" />
                </Resources>
              </Work>
```

**ФСБЦ_Мат&Оборуд.xml** — ресурсы с ценами:
```xml
<ResourceCatalog>
  <ResourcesDirectory>
    <ResourceCategory Type="Материал">
      <Section Code="01" Type="Книга" Name="Материалы для строительных работ">
        <Section Code="01.1" Type="Часть">
          <Section Code="01.1.01" Type="Раздел">
            <Section Code="01.1.01.01" Type="Группа">
              <Resource Code="01.1.01.01-0002" Name="..." MeasureUnit="100 компл">
                <Prices><Price Cost="35537.67" OptCost="34458.33" /></Prices>
              </Resource>
```

**База ТГ.xml** — технологические группы:
```xml
<NewDataSet>
  <base>
    <TechnologyGroup Code="01.01.001">
      <Resource Code="02.3.01.02-1102" />
      <Resource Code="02.3.01.02-1104" />
    </TechnologyGroup>
```

**Ключи перехода ТГ.xml** — связь ТГ → нормы:
```xml
<TechnologyGroup Code="01.01.001">
  <Work Code="06-07-003-01" BaseType="ГЭСН">
    <AbstractResource Code="02.3.01.02" Name="Песок для строительных работ" MeasureUnit="м3" />
  </Work>
```

### Пайплайн импорта (`src/lib/fsnbImporter.ts`)

```
Этап 1: Парсинг XML (DOMParser / fast-xml-parser)
   │  Файлы: ФСБЦ_Мат&Оборуд.xml + ФСБЦ_Маш.xml
   │  → Извлечение Resource: code, name, unit, prices, иерархия (book→part→section→group)
   │  → Формирование search_text: "код | хлебные крошки | наименование | ед.изм."
   ▼
Этап 2: Embedding
   │  Batch по 50-100 текстов → OpenRouter text-embedding-3-small
   │  ~15,000 ресурсов × ~$0.02/1K tokens ≈ $2-5
   ▼
Этап 3: Upsert в fsnb_resources
   │  Batch INSERT по 500 записей через Supabase
   ▼
Этап 4: Парсинг ГЭСН*.xml
   │  → Извлечение Work: code, name (BeginName+EndName), measureUnit, collection
   │  → Извлечение Resources: список {code, quantity}
   │  → Формирование search_text: "код | сборник → раздел | наименование | ед.изм. | ресурсы"
   ▼
Этап 5: Embedding + Upsert fsnb_norms + fsnb_norm_resources
   │  ~40,000 норм
   ▼
Этап 6: Парсинг База ТГ.xml
   │  → TechnologyGroup code → список Resource codes
   │  → Upsert fsnb_tech_groups + fsnb_tg_resources
   ▼
Этап 7: Парсинг Ключи перехода ТГ.xml
   │  → TechnologyGroup → Work (norm) → AbstractResource
   │  → Upsert fsnb_norm_tech_groups
   ▼
Этап 8: Построение индексов
   │  CREATE INDEX ivfflat на embedding
   │  CREATE INDEX gin на search_text
   ▼
Готово. Прогресс: callback на каждом этапе для UI.
```

### Обработка больших XML (85 МБ)

ГЭСН.xml = 85 МБ — слишком большой для DOMParser в браузере. Решения:

**Вариант A (рекомендуемый)**: предварительная обработка через Node.js скрипт:
```
1. Node.js скрипт (scripts/fsnb-xml-to-json.ts) читает XML потоково (sax/xml-stream)
2. Конвертирует в JSON-чанки (по 1000 норм)
3. Сохраняет в temp/fsnb-import/*.json
4. Браузерное приложение загружает JSON-чанки поочерёдно
```

**Вариант B**: загрузка XML напрямую в Supabase Edge Function (серверная обработка).

**Вариант C**: разбить XML вручную по сборникам (01-22) → импортировать по одному.

### Стоимость embedding

| Данные | Кол-во | Tokens (≈) | Стоимость (text-embedding-3-small) |
|--------|--------|-----------|-----------------------------------|
| Ресурсы КСР | 15,000 | ~2M | ~$0.04 |
| Нормы ГЭСН | 40,000 | ~8M | ~$0.16 |
| **Итого** | | | **~$0.20** |

Крайне дёшево — можно перегенерировать при каждом обновлении ФСНБ.

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
| `src/lib/ragSearch.ts` | Hybrid RAG: embedding + pgvector + FTS + RRF fusion |
| `src/lib/reconciliation.ts` | Phase A.5: дедупликация, alias, conflicts, dependency extraction |
| `src/lib/agents/agentRunner.ts` | Общий движок ReAct-агентов с skill injection |
| `src/lib/agents/workClassifier.ts` | Agent 1 — классификация работ |
| `src/lib/agents/pricePicker.ts` | Agent 2 — подбор норм ГЭСН (ДО ResourceMatcher) |
| `src/lib/agents/resourceMatcher.ts` | Agent 3 — сопоставление с КСР через ТГ |
| `src/lib/agents/volumeCalculator.ts` | Agent 4 — Quantity Engine (в ядре) |
| `src/lib/skillEngine.ts` | Загрузка скиллов, dynamic few-shot, rule application |
| `src/lib/skillProposer.ts` | Автоматическое предложение скиллов из feedback |
| `src/lib/estimateValidator.ts` | Phase F: rule-based validation |
| `src/lib/estimatePipeline.ts` | Оркестратор Phase A→F |
| `src/lib/fsnbImporter.ts` | Импорт XML ГрандСмета + ТГ |
| `src/lib/unitConverter.ts` | Rule-based конвертация единиц |

### Хуки
| Файл | Назначение |
|------|-----------|
| `src/hooks/useEstimate.ts` | Запуск пайплайна + progress |
| `src/hooks/useEstimateData.ts` | Загрузка данных сметы |
| `src/hooks/useSkills.ts` | CRUD скиллов для Admin |

### Типы
| Файл | Назначение |
|------|-----------|
| `src/types/fsnb.ts` | Типы справочников ФСНБ-2022 + ТГ |
| `src/types/estimate.ts` | Типы сметных сущностей + Zod-схемы |
| `src/types/skills.ts` | Типы скиллов, feedback, examples |

### Страницы и компоненты
| Файл | Назначение |
|------|-----------|
| `src/pages/EstimatePage.tsx` | Страница сметы (6 вкладок) |
| `src/components/estimate/ResourceMatchCard.tsx` | Карточка сопоставления |
| `src/components/estimate/RateMatchCard.tsx` | Карточка расценки |
| `src/components/estimate/EstimateProgress.tsx` | Прогресс + агент-лог |
| `src/components/estimate/AgentStepLog.tsx` | Лог шагов агента |
| `src/components/estimate/ReviewQueue.tsx` | Очередь review |
| `src/components/admin/SkillsTab.tsx` | Вкладка управления скиллами |
| `src/components/admin/FsnbTab.tsx` | Вкладка справочников ФСНБ |

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

1. **Reconciliation**: загрузить АР6 → проверить: dependency_flags содержат ссылки на КЖ23, АР3, АР8; work_hints содержат "ПФ-115 за два раза по грунту ГФ-021"; пироги имеют fact_type='layer'

2. **ТГ**: подобрать норму ГЭСН для кладки → загрузить ТГ → убедиться, что ResourceMatcher ищет ресурс ТОЛЬКО внутри допустимых ресурсов ТГ

3. **ResourceMatcher + unit check**: "Кирпич полнотелый ГОСТ 530-2012" → ресурс КСР внутри ТГ. Если КСР в тыс.шт, а документ в м³ → `needs_review=true` + warning

4. **VolumeCalculator**: assembly_total (derived, qty=65) → расценка в "100 шт" → volume = 0.65. Layer facts → не формируют estimate_line, помечают "нужна площадь"

5. **Validation**: двойной счёт (один материал в ведомости + assembly_total) → conflict case в review queue

6. **Skill Engine**:
   - Подтвердить 5 matches для ГОСТ 530-2012 → система предлагает rule-скилл
   - Admin утверждает скилл → при следующем запуске Agent 3 использует правило вместо LLM
   - Корректировать match → feedback сохраняется, accuracy_rate пересчитывается
   - Dynamic few-shot: при обработке нового материала → найти 3-5 похожих подтверждённых примеров → добавить в контекст LLM

7. **Review Queue UI**: сметчик видит типизированные проблемы, может подтвердить/скорректировать. Каждое действие → skill_feedback → рост банка примеров
