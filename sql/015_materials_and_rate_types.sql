-- Миграция 015: справочник материалов, привязка к расценкам, тип «Баз/Опц».
-- Учитывает состояние БД после миграции 014 (профили пользователей).
--
-- Создаёт:
--   • materials — плоский справочник материалов (название, ед. изм., стоимость);
--   • imported_rate_materials — связка расценок и материалов с расходом и типом;
--   • imported_rates.rate_type — дискретный признак базовый/опциональный.

BEGIN;

-- ── Справочник материалов ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.materials (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  unit       text,
  price      numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materials_name_lower
  ON public.materials (lower(name));

CREATE OR REPLACE FUNCTION public.materials_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_materials_updated_at ON public.materials;
CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.materials_set_updated_at();

-- ── Тип у расценок ─────────────────────────────────────────────────────────
ALTER TABLE public.imported_rates
  ADD COLUMN IF NOT EXISTS rate_type text NOT NULL DEFAULT 'base'
    CHECK (rate_type IN ('base', 'optional'));

-- ── Привязка материалов к расценкам ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.imported_rate_materials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id     uuid NOT NULL REFERENCES public.imported_rates(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity    numeric(12, 4) NOT NULL DEFAULT 1,
  rate_type   text NOT NULL DEFAULT 'base'
    CHECK (rate_type IN ('base', 'optional')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rate_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_imported_rate_materials_rate
  ON public.imported_rate_materials (rate_id);

CREATE INDEX IF NOT EXISTS idx_imported_rate_materials_material
  ON public.imported_rate_materials (material_id);

COMMIT;

-- После применения:
--   • в imported_rates появляется колонка rate_type со значением 'base' у всех существующих строк;
--   • создаётся справочник materials и связка imported_rate_materials.
-- Далее выгрузить актуальный sql/schema/schema.sql из Supabase.
