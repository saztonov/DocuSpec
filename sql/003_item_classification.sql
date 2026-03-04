-- 003_item_classification.sql
-- Добавление классификации material/equipment, qty_scope, needs_review, движок умножения
-- Предусловие: schema.sql + все предыдущие миграции уже применены

-- ── material_facts: новые поля ──

-- kind: 'material' (по умолчанию) или 'equipment'
ALTER TABLE material_facts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'material';

-- qty_scope: 'per_unit' | 'total' | 'unknown' — область действия количества
ALTER TABLE material_facts ADD COLUMN IF NOT EXISTS qty_scope text;

-- needs_review: автоматический флаг "система не уверена"
ALTER TABLE material_facts ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

-- derived facts: ссылка на исходный факт (для результатов умножения)
ALTER TABLE material_facts ADD COLUMN IF NOT EXISTS derived_from_fact_id uuid REFERENCES material_facts(id) ON DELETE SET NULL;

-- multiplier: коэффициент умножения (кол-во изделий)
ALTER TABLE material_facts ADD COLUMN IF NOT EXISTS multiplier numeric;

-- calc_note: пояснение к расчёту (напр. "ОГ-13 x 5 шт = 25 шт")
ALTER TABLE material_facts ADD COLUMN IF NOT EXISTS calc_note text;

-- ── product_facts: новые поля ──

-- kind: 'product' (по умолчанию), 'equipment' или 'assembly'
ALTER TABLE product_facts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product';

-- qty_scope: аналогично material_facts
ALTER TABLE product_facts ADD COLUMN IF NOT EXISTS qty_scope text;

-- needs_review: автоматический флаг
ALTER TABLE product_facts ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

-- extra_params: доп. параметры (длина, цвет, модель)
ALTER TABLE product_facts ADD COLUMN IF NOT EXISTS extra_params text;

-- ── Индексы ──
CREATE INDEX IF NOT EXISTS idx_material_facts_kind ON material_facts(kind);
CREATE INDEX IF NOT EXISTS idx_material_facts_needs_review ON material_facts(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_material_facts_derived ON material_facts(derived_from_fact_id) WHERE derived_from_fact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_facts_kind ON product_facts(kind);
CREATE INDEX IF NOT EXISTS idx_product_facts_needs_review ON product_facts(needs_review) WHERE needs_review = true;
