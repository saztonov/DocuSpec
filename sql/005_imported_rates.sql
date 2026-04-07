-- Миграция 005: импортированные сметные расценки (плоский прайс из Excel)
-- Каскад: категория затрат → вид затрат → наименование работ (+ единица измерения)

CREATE TABLE IF NOT EXISTS imported_rate_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imported_rate_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES imported_rate_categories(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_imported_rate_types_category
    ON imported_rate_types(category_id);

CREATE TABLE IF NOT EXISTS imported_rates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id uuid NOT NULL REFERENCES imported_rate_types(id) ON DELETE CASCADE,
    work_name text NOT NULL,
    unit text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (type_id, work_name)
);

CREATE INDEX IF NOT EXISTS idx_imported_rates_type
    ON imported_rates(type_id);
