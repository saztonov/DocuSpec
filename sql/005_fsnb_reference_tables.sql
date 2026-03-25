-- 005_fsnb_reference_tables.sql
-- Справочники ФСНБ-2022: КСР (ресурсы), ГЭСН (нормы), ТГ (технологические группы)
-- Требует расширение pgvector в Supabase
-- Предусловие: 004_fact_types_and_hints.sql уже применена

-- ── pgvector ──
CREATE EXTENSION IF NOT EXISTS vector;

-- ══════════════════════════════════════════════════════════════
-- СБОРНИКИ (коллекции)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,            -- 'ГЭСН', 'ГЭСНм', 'ГЭСНр', 'ГЭСНп', 'ФСБЦ_Мат', 'ФСБЦ_Маш'
  name text NOT NULL,                   -- 'Государственные элементные сметные нормы'
  base_type text NOT NULL,              -- 'gesn' | 'gesnm' | 'gesnr' | 'gesnp' | 'fsbc_mat' | 'fsbc_mach'
  version text,                         -- 'приказ от 17.02.2026 № 91пр'
  xml_source_name text,                 -- 'ГЭСН.xml'
  record_count integer DEFAULT 0,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- РЕСУРСЫ КСР (материалы, оборудование, машины)
-- Источник: ФСБЦ_Мат&Оборуд.xml + ФСБЦ_Маш.xml
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES fsnb_collections(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,            -- '01.1.01.01-0002' или '91.01.01-035'
  name text NOT NULL,                   -- 'Кирпич керамический обыкновенный полнотелый 250×120×65'
  measure_unit text,                    -- 'тыс.шт', 'м3', 'маш.-ч'
  resource_type text NOT NULL,          -- 'material' | 'equipment' | 'machine' | 'labor'

  -- Иерархия (хлебные крошки из XML Section)
  book_code text,                       -- '01' (Книга)
  book_name text,                       -- 'Материалы для строительных работ'
  part_code text,                       -- '01.1' (Часть)
  part_name text,
  section_code text,                    -- '01.1.01' (Раздел)
  section_name text,
  group_code text,                      -- '01.1.01.01' (Группа)
  group_name text,

  -- Цены (из ФСБЦ)
  base_price numeric,                   -- Cost
  opt_price numeric,                    -- OptCost

  -- Для машин (из ФСБЦ_Маш)
  salary_mach numeric,                  -- SalaryMach
  labour_mach numeric,                  -- LabourMach
  price_without_salary numeric,         -- PriceCostWithoutSalary
  machinist_category numeric,           -- MachinistCategory

  -- ГОСТ ссылки (массив для поиска)
  gost_refs text[],                     -- {'ГОСТ 530-2012', 'ТУ 1234-567'}

  -- RAG: embedding + поисковый текст
  embedding vector(1536),
  search_text text,                     -- нормализованный текст для FTS

  -- Метаданные (всё, что не вошло в поля)
  metadata jsonb DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Индексы для ресурсов
CREATE INDEX IF NOT EXISTS idx_fsnb_resources_collection
  ON fsnb_resources (collection_id);
CREATE INDEX IF NOT EXISTS idx_fsnb_resources_type
  ON fsnb_resources (resource_type);
CREATE INDEX IF NOT EXISTS idx_fsnb_resources_book
  ON fsnb_resources (book_code);
CREATE INDEX IF NOT EXISTS idx_fsnb_resources_gost
  ON fsnb_resources USING gin (gost_refs);
CREATE INDEX IF NOT EXISTS idx_fsnb_resources_fts
  ON fsnb_resources USING gin (to_tsvector('russian', search_text));
-- pgvector index создаётся ПОСЛЕ наполнения данными (нужны записи для ivfflat lists)
-- CREATE INDEX idx_fsnb_resources_embedding ON fsnb_resources
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ══════════════════════════════════════════════════════════════
-- НОРМЫ ГЭСН
-- Источник: ГЭСН.xml, ГЭСНм.xml, ГЭСНр.xml, ГЭСНп.xml
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_norms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES fsnb_collections(id) ON DELETE CASCADE,
  norm_code text UNIQUE NOT NULL,       -- '01-01-001-01' (из Work Code)
  base_type text NOT NULL,              -- 'ГЭСН' | 'ГЭСНм' | 'ГЭСНр' | 'ГЭСНп'

  -- Наименование: NameGroup.BeginName + Work.EndName
  name text NOT NULL,                   -- полное наименование
  begin_name text,                      -- начальная часть из NameGroup
  end_name text,                        -- окончание из Work

  measure_unit text NOT NULL,           -- '1000 м3', '100 м2', 'шт', 'т'

  -- Иерархия (из вложенных Section)
  collection_code text,                 -- '01' (сборник)
  collection_name text,                 -- 'Земляные работы'
  division_code text,                   -- '1' (раздел)
  division_name text,
  table_code text,                      -- '01-01-001' (таблица)
  table_name text,
  work_category text,                   -- категория для фильтрации: 'earthwork', 'masonry', 'finishing', ...

  -- RAG
  embedding vector(1536),
  search_text text,

  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fsnb_norms_collection
  ON fsnb_norms (collection_id);
CREATE INDEX IF NOT EXISTS idx_fsnb_norms_base_type
  ON fsnb_norms (base_type);
CREATE INDEX IF NOT EXISTS idx_fsnb_norms_category
  ON fsnb_norms (work_category);
CREATE INDEX IF NOT EXISTS idx_fsnb_norms_table_code
  ON fsnb_norms (table_code);
CREATE INDEX IF NOT EXISTS idx_fsnb_norms_fts
  ON fsnb_norms USING gin (to_tsvector('russian', search_text));

-- ══════════════════════════════════════════════════════════════
-- СОСТАВ РЕСУРСОВ НОРМЫ (нормы расхода)
-- Связь: норма → ресурс + количество на единицу нормы
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_norm_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norm_id uuid NOT NULL REFERENCES fsnb_norms(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES fsnb_resources(id) ON DELETE SET NULL,  -- nullable: может не найтись в ФСБЦ
  resource_code text NOT NULL,          -- код ресурса из XML (напр. '91.01.01-035', '1-100-38')
  resource_name text,                   -- EndName из XML (если есть)
  resource_type text,                   -- 'material' | 'machine' | 'labor' (по префиксу кода)
  consumption numeric,                  -- Quantity: норма расхода на единицу нормы
  measure_unit text,                    -- единица ресурса (если указана отдельно)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fsnb_norm_resources_norm
  ON fsnb_norm_resources (norm_id);
CREATE INDEX IF NOT EXISTS idx_fsnb_norm_resources_resource
  ON fsnb_norm_resources (resource_id)
  WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fsnb_norm_resources_code
  ON fsnb_norm_resources (resource_code);

-- ══════════════════════════════════════════════════════════════
-- ТЕХНОЛОГИЧЕСКИЕ ГРУППЫ (ТГ)
-- Источник: База ТГ.xml
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_tech_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_code text UNIQUE NOT NULL,         -- '01.01.001' (из TechnologyGroup Code)
  tg_name text,                         -- наименование (из Ключей перехода, AbstractResource.Name)
  resource_count integer DEFAULT 0,     -- кол-во ресурсов в группе
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- СВЯЗЬ ТГ → ДОПУСТИМЫЕ РЕСУРСЫ
-- Источник: База ТГ.xml (TechnologyGroup → Resource)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_tg_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id uuid NOT NULL REFERENCES fsnb_tech_groups(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES fsnb_resources(id) ON DELETE CASCADE,  -- nullable: ресурс может не быть в ФСБЦ
  resource_code text NOT NULL,          -- код ресурса из XML
  UNIQUE(tg_id, resource_code)
);

CREATE INDEX IF NOT EXISTS idx_fsnb_tg_resources_tg
  ON fsnb_tg_resources (tg_id);
CREATE INDEX IF NOT EXISTS idx_fsnb_tg_resources_resource
  ON fsnb_tg_resources (resource_id)
  WHERE resource_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- СВЯЗЬ НОРМА → ТГ (через открытые ресурсы)
-- Источник: Ключи перехода ТГ.xml (TechnologyGroup → Work)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_norm_tech_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norm_id uuid REFERENCES fsnb_norms(id) ON DELETE CASCADE,           -- nullable: норма может не быть загружена
  norm_code text NOT NULL,              -- Work Code из XML
  norm_base_type text NOT NULL,         -- BaseType: 'ГЭСН', 'ГЭСНм', ...
  tg_id uuid NOT NULL REFERENCES fsnb_tech_groups(id) ON DELETE CASCADE,
  abstract_resource_code text,          -- AbstractResource Code (обобщённый код)
  abstract_resource_name text,          -- AbstractResource Name
  abstract_resource_unit text,          -- AbstractResource MeasureUnit
  UNIQUE(norm_code, tg_id)
);

CREATE INDEX IF NOT EXISTS idx_fsnb_ntg_norm
  ON fsnb_norm_tech_groups (norm_id)
  WHERE norm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fsnb_ntg_tg
  ON fsnb_norm_tech_groups (tg_id);
CREATE INDEX IF NOT EXISTS idx_fsnb_ntg_norm_code
  ON fsnb_norm_tech_groups (norm_code);

-- ══════════════════════════════════════════════════════════════
-- ИНДЕКСЫ ПЕРЕСЧЁТА ЦЕН (ГОСР)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_price_indices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code text NOT NULL,            -- код региона
  region_name text,
  period text NOT NULL,                 -- '2026-Q1'
  work_category text,                   -- категория работ (или null для общего)
  labor_index numeric,                  -- индекс на оплату труда
  material_index numeric,               -- индекс на материалы
  machine_index numeric,                -- индекс на машины/механизмы
  equipment_index numeric,              -- индекс на оборудование
  source text,                          -- откуда получен индекс
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(region_code, period, work_category)
);

-- ══════════════════════════════════════════════════════════════
-- СИНОНИМЫ (для rule-based matching)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fsnb_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,                   -- 'кирпич полнотелый'
  canonical_term text NOT NULL,         -- нормализованная форма
  resource_code_prefix text,            -- '01.4' → книга/часть для фильтрации
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fsnb_synonyms_term
  ON fsnb_synonyms (term);

-- ══════════════════════════════════════════════════════════════
-- HYBRID SEARCH ФУНКЦИЯ (RRF fusion)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION hybrid_search_resources(
  query_embedding vector(1536),
  query_text text,
  resource_type_filter text DEFAULT NULL,
  match_limit int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  code text,
  name text,
  measure_unit text,
  resource_type text,
  score float
) AS $$
  WITH semantic AS (
    SELECT r.id, r.code, r.name, r.measure_unit, r.resource_type,
           ROW_NUMBER() OVER (ORDER BY r.embedding <=> query_embedding) AS rank
    FROM fsnb_resources r
    WHERE r.embedding IS NOT NULL
      AND (resource_type_filter IS NULL OR r.resource_type = resource_type_filter)
    ORDER BY r.embedding <=> query_embedding
    LIMIT 30
  ),
  keyword AS (
    SELECT r.id, r.code, r.name, r.measure_unit, r.resource_type,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank(
               to_tsvector('russian', r.search_text),
               plainto_tsquery('russian', query_text)
             ) DESC
           ) AS rank
    FROM fsnb_resources r
    WHERE r.search_text IS NOT NULL
      AND to_tsvector('russian', r.search_text) @@ plainto_tsquery('russian', query_text)
      AND (resource_type_filter IS NULL OR r.resource_type = resource_type_filter)
    LIMIT 15
  ),
  combined AS (
    SELECT
      COALESCE(s.id, k.id) AS id,
      COALESCE(s.code, k.code) AS code,
      COALESCE(s.name, k.name) AS name,
      COALESCE(s.measure_unit, k.measure_unit) AS measure_unit,
      COALESCE(s.resource_type, k.resource_type) AS resource_type,
      COALESCE(1.0/(60 + s.rank), 0) + COALESCE(1.0/(60 + k.rank), 0) AS score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT c.id, c.code, c.name, c.measure_unit, c.resource_type, c.score
  FROM combined c
  ORDER BY c.score DESC
  LIMIT match_limit;
$$ LANGUAGE sql STABLE;

-- Аналогичная функция для норм ГЭСН
CREATE OR REPLACE FUNCTION hybrid_search_norms(
  query_embedding vector(1536),
  query_text text,
  base_type_filter text DEFAULT NULL,
  category_filter text DEFAULT NULL,
  match_limit int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  norm_code text,
  name text,
  measure_unit text,
  base_type text,
  work_category text,
  score float
) AS $$
  WITH semantic AS (
    SELECT n.id, n.norm_code, n.name, n.measure_unit, n.base_type, n.work_category,
           ROW_NUMBER() OVER (ORDER BY n.embedding <=> query_embedding) AS rank
    FROM fsnb_norms n
    WHERE n.embedding IS NOT NULL
      AND (base_type_filter IS NULL OR n.base_type = base_type_filter)
      AND (category_filter IS NULL OR n.work_category = category_filter)
    ORDER BY n.embedding <=> query_embedding
    LIMIT 30
  ),
  keyword AS (
    SELECT n.id, n.norm_code, n.name, n.measure_unit, n.base_type, n.work_category,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank(
               to_tsvector('russian', n.search_text),
               plainto_tsquery('russian', query_text)
             ) DESC
           ) AS rank
    FROM fsnb_norms n
    WHERE n.search_text IS NOT NULL
      AND to_tsvector('russian', n.search_text) @@ plainto_tsquery('russian', query_text)
      AND (base_type_filter IS NULL OR n.base_type = base_type_filter)
      AND (category_filter IS NULL OR n.work_category = category_filter)
    LIMIT 15
  ),
  combined AS (
    SELECT
      COALESCE(s.id, k.id) AS id,
      COALESCE(s.norm_code, k.norm_code) AS norm_code,
      COALESCE(s.name, k.name) AS name,
      COALESCE(s.measure_unit, k.measure_unit) AS measure_unit,
      COALESCE(s.base_type, k.base_type) AS base_type,
      COALESCE(s.work_category, k.work_category) AS work_category,
      COALESCE(1.0/(60 + s.rank), 0) + COALESCE(1.0/(60 + k.rank), 0) AS score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT c.id, c.norm_code, c.name, c.measure_unit, c.base_type, c.work_category, c.score
  FROM combined c
  ORDER BY c.score DESC
  LIMIT match_limit;
$$ LANGUAGE sql STABLE;
