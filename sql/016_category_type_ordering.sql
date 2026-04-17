-- Миграция 016: ручной порядок категорий и видов затрат + каскадное удаление.
-- Учитывает состояние БД после миграции 015.
--
-- Делает:
--   • добавляет sort_order в imported_rate_categories и imported_rate_types;
--   • проставляет sort_order существующим записям по алфавитному порядку;
--   • создаёт индексы под сортировку;
--   • перевыпускает FK imported_rate_types.category_id и imported_rates.type_id
--     с ON DELETE CASCADE, чтобы при удалении категории/вида дочерние записи
--     удалялись каскадно (UI запрашивает подтверждение перед этим).
--   • то же для устаревшей таблицы custom_rates, чтобы не блокировать DELETE.

BEGIN;

-- ── Поле sort_order ────────────────────────────────────────────────────────
ALTER TABLE public.imported_rate_categories
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.imported_rate_types
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- ── Бэкфилл: нумерация по алфавиту ─────────────────────────────────────────
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
    FROM public.imported_rate_categories
)
UPDATE public.imported_rate_categories c
   SET sort_order = ranked.rn
  FROM ranked
 WHERE c.id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY name) AS rn
    FROM public.imported_rate_types
)
UPDATE public.imported_rate_types t
   SET sort_order = ranked.rn
  FROM ranked
 WHERE t.id = ranked.id;

-- ── Индексы ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_imported_rate_categories_sort
  ON public.imported_rate_categories (sort_order);

CREATE INDEX IF NOT EXISTS idx_imported_rate_types_category_sort
  ON public.imported_rate_types (category_id, sort_order);

-- ── Перевыпуск FK с ON DELETE CASCADE ──────────────────────────────────────
ALTER TABLE public.imported_rate_types
  DROP CONSTRAINT IF EXISTS imported_rate_types_category_id_fkey;
ALTER TABLE public.imported_rate_types
  ADD CONSTRAINT imported_rate_types_category_id_fkey
  FOREIGN KEY (category_id)
  REFERENCES public.imported_rate_categories(id)
  ON DELETE CASCADE;

ALTER TABLE public.imported_rates
  DROP CONSTRAINT IF EXISTS imported_rates_type_id_fkey;
ALTER TABLE public.imported_rates
  ADD CONSTRAINT imported_rates_type_id_fkey
  FOREIGN KEY (type_id)
  REFERENCES public.imported_rate_types(id)
  ON DELETE CASCADE;

-- Устаревшая таблица custom_rates тоже ссылается на imported_rate_types —
-- переводим на CASCADE, чтобы не блокировать удаление (в UI она не используется).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'custom_rates') THEN
    EXECUTE 'ALTER TABLE public.custom_rates
             DROP CONSTRAINT IF EXISTS custom_rates_type_id_fkey';
    EXECUTE 'ALTER TABLE public.custom_rates
             ADD CONSTRAINT custom_rates_type_id_fkey
             FOREIGN KEY (type_id)
             REFERENCES public.imported_rate_types(id)
             ON DELETE CASCADE';
  END IF;
END $$;

COMMIT;

-- После применения:
--   • в imported_rate_categories и imported_rate_types появляется sort_order;
--   • существующие записи пронумерованы по алфавитному порядку;
--   • DELETE категории / вида удаляет вложенные записи каскадно.
-- Далее выгрузить актуальный sql/schema/schema.sql из Supabase.
