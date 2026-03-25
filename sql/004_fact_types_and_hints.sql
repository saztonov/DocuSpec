-- 004_fact_types_and_hints.sql
-- Типизация фактов (observed/derived/inferred/layer), типизация количеств,
-- work_hints (из "Общих указаний"), dependency_flags (межтомовые ссылки)
-- Предусловие: schema.sql + 003_item_classification.sql уже применены

-- ── material_facts: типизация фактов ──

-- fact_type: определяет природу факта
-- 'observed'  — прямо из документа (таблицы, текст)
-- 'derived'   — расчётный (assembly_total, умножение)
-- 'inferred'  — предложенный LLM с низкой уверенностью
-- 'layer'     — слой конструкции из пирога (толщина без площади)
ALTER TABLE material_facts
  ADD COLUMN IF NOT EXISTS fact_type text NOT NULL DEFAULT 'observed';

-- quantity_type: что именно измеряется
-- 'assembly_total'          — кол-во сборок/изделий
-- 'component_per_assembly'  — компонент на 1 сборку
-- 'route_length'            — длина трассы/кабеля
-- 'layer_thickness'         — толщина слоя (мм)
-- 'area'                    — площадь (м2)
-- 'volume'                  — объём (м3)
-- 'count'                   — штуки
-- 'equipment_count'         — единицы оборудования
-- 'weight'                  — масса (кг, т)
-- 'linear'                  — погонные метры
ALTER TABLE material_facts
  ADD COLUMN IF NOT EXISTS quantity_type text;

-- Индексы для фильтрации
CREATE INDEX IF NOT EXISTS idx_material_facts_fact_type
  ON material_facts (fact_type);
CREATE INDEX IF NOT EXISTS idx_material_facts_quantity_type
  ON material_facts (quantity_type)
  WHERE quantity_type IS NOT NULL;

-- ── Обновление существующих данных (если есть) ──

-- Пироги → fact_type='layer'
UPDATE material_facts SET fact_type = 'layer'
  WHERE source_section = 'pirog' AND fact_type = 'observed';

-- Производные (assembly_total) → fact_type='derived'
UPDATE material_facts SET fact_type = 'derived'
  WHERE source_section = 'assembly_total' AND fact_type = 'observed';

-- Низкая уверенность LLM → fact_type='inferred'
UPDATE material_facts SET fact_type = 'inferred'
  WHERE confidence < 0.7
    AND derived_from_fact_id IS NULL
    AND source_section NOT IN ('pirog', 'assembly_total')
    AND fact_type = 'observed';

-- ── work_hints: подсказки о работах из "Общих указаний" и примечаний ──

CREATE TABLE IF NOT EXISTS work_hints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id uuid REFERENCES doc_blocks(id) ON DELETE SET NULL,
  hint_text text NOT NULL,
  hint_type text,
  -- Типы: 'coating'          — окраска, покрытие
  --       'waterproofing'    — гидроизоляция
  --       'fire_protection'  — огнезащита, огнестойкость
  --       'mounting'         — требования к монтажу
  --       'preparation'      — подготовка поверхности, грунтовка
  --       'insulation'       — теплоизоляция
  --       'reinforcement'    — армирование
  --       'other'            — прочее
  related_materials text[],   -- упомянутые материалы/ГОСТ (напр. {"ПФ-115", "ГОСТ 6465-2023"})
  confidence real NOT NULL DEFAULT 0.8,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_hints_doc_id
  ON work_hints (doc_id);

-- ── dependency_flags: межтомовые зависимости ──

CREATE TABLE IF NOT EXISTS dependency_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id uuid REFERENCES doc_blocks(id) ON DELETE SET NULL,
  referenced_doc_code text NOT NULL,    -- "133/23-ГК-КЖ23"
  referenced_sheet text,                -- "л.12-13" или null
  dependency_type text,
  -- Типы: 'material'   — материал/решение описаны в другом томе
  --       'geometry'   — геометрическая база (площади, длины) в другом томе
  --       'volume'     — объём определяется по другому тому
  --       'detail'     — детализация узла/конструкции в другом томе
  --       'drawing'    — ссылка на чертёж в другом томе
  description text,
  resolved boolean NOT NULL DEFAULT false,  -- разрешена ли зависимость (загружен смежный том)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dependency_flags_doc_id
  ON dependency_flags (doc_id);
CREATE INDEX IF NOT EXISTS idx_dependency_flags_ref_code
  ON dependency_flags (referenced_doc_code);
