-- 006_estimate_and_skills.sql
-- Таблицы сметного пайплайна + система динамических скиллов
-- Предусловие: 005_fsnb_reference_tables.sql уже применена

-- ══════════════════════════════════════════════════════════════
-- СМЕТЫ (головная запись)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  -- Статусы: 'draft' → 'preparing' → 'classifying' → 'pricing' →
  --          'matching' → 'calculating' → 'validating' → 'done' | 'error'
  method text DEFAULT 'resource_index',   -- 'resource_index' | 'resource' | 'base_index'
  region_code text,
  price_period text,                      -- '2026-Q1'

  -- Итоги (заполняются на Phase G)
  total_direct_cost numeric,
  total_overhead numeric,
  total_profit numeric,
  total_cost numeric,

  -- Метрики пайплайна
  iteration_count integer NOT NULL DEFAULT 0,
  model_used text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,

  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimates_doc ON estimates (doc_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates (status);

-- ══════════════════════════════════════════════════════════════
-- ВИДЫ РАБОТ (результат Agent 1 — WorkClassifier)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  work_description text NOT NULL,         -- "Монтаж ограждений стальных лестниц"
  work_category text,                     -- 'masonry', 'finishing', 'metalwork', 'electrical', ...
  construction text,                      -- из material_facts.construction (напр. "ОГ-13")
  source_section text,                    -- из material_facts.source_section
  source_material_fact_ids uuid[],        -- привязка к material_facts
  confidence real NOT NULL DEFAULT 0.8,
  needs_review boolean NOT NULL DEFAULT false,
  agent_reasoning text,                   -- объяснение агента
  agent_steps jsonb,                      -- лог шагов ReAct агента
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ewi_estimate ON estimate_work_items (estimate_id);

-- ══════════════════════════════════════════════════════════════
-- ПОДОБРАННЫЕ РАСЦЕНКИ (результат Agent 2 — PricePicker)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_rate_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL REFERENCES estimate_work_items(id) ON DELETE CASCADE,
  fsnb_norm_id uuid REFERENCES fsnb_norms(id) ON DELETE SET NULL,
  norm_code text,
  norm_name text,
  norm_unit text,                         -- единица нормы ("100 м2", "1000 м3")
  match_confidence real NOT NULL DEFAULT 0.7,
  match_method text,                      -- 'semantic' | 'rule' | 'llm' | 'manual'
  resource_coverage real,                 -- % покрытия ресурсов нормы фактическими материалами
  needs_review boolean NOT NULL DEFAULT false,
  user_verified boolean NOT NULL DEFAULT false,
  agent_reasoning text,
  alternatives jsonb DEFAULT '[]',        -- [{norm_code, name, confidence, coverage}]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erm_estimate ON estimate_rate_matches (estimate_id);
CREATE INDEX IF NOT EXISTS idx_erm_work_item ON estimate_rate_matches (work_item_id);

-- ══════════════════════════════════════════════════════════════
-- СОПОСТАВЛЕНИЯ РЕСУРСОВ (результат Agent 3 — ResourceMatcher)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_resource_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  material_fact_id uuid NOT NULL REFERENCES material_facts(id) ON DELETE CASCADE,
  rate_match_id uuid REFERENCES estimate_rate_matches(id) ON DELETE SET NULL,  -- через какую расценку подбирался
  fsnb_resource_id uuid REFERENCES fsnb_resources(id) ON DELETE SET NULL,
  fsnb_resource_code text,
  fsnb_resource_name text,
  fsnb_resource_unit text,
  tg_id uuid REFERENCES fsnb_tech_groups(id) ON DELETE SET NULL,  -- из какой ТГ ресурс
  match_confidence real NOT NULL DEFAULT 0.7,
  match_method text,                      -- 'gost' | 'code' | 'tg_semantic' | 'semantic' | 'llm' | 'manual'
  unit_compatible boolean,                -- единицы совместимы?
  conversion_formula text,                -- формула пересчёта единиц
  needs_review boolean NOT NULL DEFAULT false,
  user_verified boolean NOT NULL DEFAULT false,
  agent_reasoning text,
  alternatives jsonb DEFAULT '[]',        -- [{resource_code, name, confidence}]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eresm_estimate ON estimate_resource_matches (estimate_id);
CREATE INDEX IF NOT EXISTS idx_eresm_fact ON estimate_resource_matches (material_fact_id);

-- ══════════════════════════════════════════════════════════════
-- ПОЗИЦИИ СМЕТЫ (результат Phase E + Phase G)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  rate_match_id uuid REFERENCES estimate_rate_matches(id) ON DELETE SET NULL,
  work_item_id uuid REFERENCES estimate_work_items(id) ON DELETE SET NULL,
  line_number text,                       -- "1", "1.1", "2"
  justification text,                     -- код расценки: "ГЭСН 08-02-001-01"
  description text NOT NULL,              -- "Кладка стен из кирпича керамического"
  measure_unit text,                      -- "100 м2"
  volume numeric,                         -- объём работ
  volume_calc_note text,                  -- пояснение: "7.13 м3 / 1000 = 0.00713"
  -- Стоимости (заполняются при Phase G)
  unit_cost numeric,
  total_cost numeric,
  labor_cost numeric,
  material_cost numeric,
  machine_cost numeric,
  -- Трассируемость
  source_material_fact_ids uuid[],
  source_block_ids uuid[],               -- блоки документа
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_el_estimate ON estimate_lines (estimate_id);

-- ══════════════════════════════════════════════════════════════
-- ОЧЕРЕДЬ REVIEW (типизированные проблемы)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  severity text NOT NULL,                 -- 'error' | 'warning' | 'info'
  issue_type text NOT NULL,
  -- Типы: 'uncovered_material'    — материал без работы
  --       'unit_mismatch'         — несовместимые единицы
  --       'double_count'          — подозрение на двойной счёт
  --       'cross_volume_dep'      — межтомовая зависимость
  --       'no_geometry'           — нет геометрической базы (layer fact)
  --       'low_coverage'          — resource_coverage расценки < 50%
  --       'tg_mismatch'          — ресурс вне ТГ нормы
  --       'low_confidence'        — общая низкая уверенность
  description text NOT NULL,
  related_work_item_id uuid REFERENCES estimate_work_items(id) ON DELETE SET NULL,
  related_material_fact_id uuid REFERENCES material_facts(id) ON DELETE SET NULL,
  related_resource_match_id uuid REFERENCES estimate_resource_matches(id) ON DELETE SET NULL,
  related_rate_match_id uuid REFERENCES estimate_rate_matches(id) ON DELETE SET NULL,
  suggested_action text,                  -- рекомендация
  resolved boolean NOT NULL DEFAULT false,
  resolved_by text,                       -- 'user' | 'system'
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erq_estimate ON estimate_review_queue (estimate_id);
CREATE INDEX IF NOT EXISTS idx_erq_unresolved ON estimate_review_queue (estimate_id, resolved)
  WHERE NOT resolved;

-- ══════════════════════════════════════════════════════════════
-- СИСТЕМА СКИЛЛОВ
-- ══════════════════════════════════════════════════════════════

-- Реестр скиллов
CREATE TABLE IF NOT EXISTS skill_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL,               -- 'work_classifier' | 'price_picker' | 'resource_matcher' | 'volume_calculator'
  skill_type text NOT NULL,               -- 'rule' | 'prompt' | 'example_bank'
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,

  -- Содержимое (зависит от skill_type)
  rule_config jsonb,                      -- для rule-скиллов: JSON-правило
  prompt_template text,                   -- для prompt-скиллов: шаблон промпта
  example_group_id uuid,                  -- для example_bank: ссылка на группу примеров

  -- Метрики
  total_uses integer NOT NULL DEFAULT 0,
  successful_uses integer NOT NULL DEFAULT 0,
  rejected_uses integer NOT NULL DEFAULT 0,
  accuracy_rate real,
  avg_confidence real,

  -- Управление
  created_by text NOT NULL DEFAULT 'system',  -- 'system' | 'auto_proposed' | 'user'
  approved_by text,                       -- null = ожидает утверждения
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skills_agent_active
  ON skill_registry (agent_type, is_active)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_skills_proposed
  ON skill_registry (created_by)
  WHERE created_by = 'auto_proposed' AND approved_by IS NULL;

-- Банк примеров (few-shot)
CREATE TABLE IF NOT EXISTS skill_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,                 -- группа примеров (для скилла типа example_bank)
  agent_type text NOT NULL,

  -- Вход
  input_text text NOT NULL,               -- "Кирпич полнотелый КР-р-по 250x120x65"
  input_context jsonb DEFAULT '{}',       -- {section_code: "АР", gost: "530-2012", unit: "м3"}
  input_embedding vector(1536),           -- для semantic retrieval

  -- Выход (подтверждённый результат)
  output_result jsonb NOT NULL,           -- {resource_code: "21.1.01.01-0001", confidence: 0.95}

  -- Метаданные
  source text,                            -- 'user_correction' | 'confirmed_match' | 'manual'
  doc_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  quality_score real NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_examples_group
  ON skill_examples (group_id);
CREATE INDEX IF NOT EXISTS idx_skill_examples_agent
  ON skill_examples (agent_type);
-- pgvector index для dynamic few-shot retrieval
-- Создаётся ПОСЛЕ наполнения данными:
-- CREATE INDEX idx_skill_examples_embedding ON skill_examples
--   USING ivfflat (input_embedding vector_cosine_ops) WITH (lists = 50);

-- Обратная связь по скиллам
CREATE TABLE IF NOT EXISTS skill_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid REFERENCES skill_registry(id) ON DELETE SET NULL,
  estimate_id uuid REFERENCES estimates(id) ON DELETE SET NULL,
  agent_type text NOT NULL,

  action text NOT NULL,                   -- 'confirmed' | 'corrected' | 'rejected'
  original_result jsonb,                  -- что предложил скилл/агент
  corrected_result jsonb,                 -- что исправил пользователь (null если confirmed)

  user_comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_feedback_skill
  ON skill_feedback (skill_id)
  WHERE skill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_skill_feedback_agent
  ON skill_feedback (agent_type);
