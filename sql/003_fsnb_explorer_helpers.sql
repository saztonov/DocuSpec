-- ─────────────────────────────────────────────────────────────────
-- Миграция 003: вспомогательные индексы и RPC-функции для UI «Расценки»
-- (обозреватель ФСНБ — дерево сборников/разделов/таблиц/норм).
--
-- Применять в SQL Editor облачного Supabase. Все объекты создаются
-- идемпотентно (CREATE IF NOT EXISTS / OR REPLACE), повторный запуск безопасен.
-- ─────────────────────────────────────────────────────────────────

-- 1. Композитные индексы под фильтрацию в обозревателе.
--    Без них ORDER BY/DISTINCT по большим сборникам уходят в statement timeout.
CREATE INDEX IF NOT EXISTS idx_fsnb_norms_col_div
  ON public.fsnb_norms (collection_id, division_code);

CREATE INDEX IF NOT EXISTS idx_fsnb_norms_col_div_tbl
  ON public.fsnb_norms (collection_id, division_code, table_code);

-- 2. RPC: список разделов внутри сборника (DISTINCT на сервере).
CREATE OR REPLACE FUNCTION public.fsnb_collection_divisions(p_collection_id uuid)
RETURNS TABLE (division_code text, division_name text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (division_code)
         division_code,
         division_name
  FROM   public.fsnb_norms
  WHERE  collection_id = p_collection_id
    AND  division_code IS NOT NULL
  ORDER  BY division_code;
$$;

-- 3. RPC: список таблиц внутри раздела сборника.
CREATE OR REPLACE FUNCTION public.fsnb_division_tables(
  p_collection_id uuid,
  p_division_code text
)
RETURNS TABLE (table_code text, table_name text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (table_code)
         table_code,
         table_name
  FROM   public.fsnb_norms
  WHERE  collection_id = p_collection_id
    AND  division_code = p_division_code
    AND  table_code IS NOT NULL
  ORDER  BY table_code;
$$;

-- 4. RPC: список норм внутри таблицы.
CREATE OR REPLACE FUNCTION public.fsnb_table_norms(
  p_collection_id uuid,
  p_division_code text,
  p_table_code text
)
RETURNS TABLE (id uuid, norm_code text, name text)
LANGUAGE sql
STABLE
AS $$
  SELECT id, norm_code, name
  FROM   public.fsnb_norms
  WHERE  collection_id = p_collection_id
    AND  division_code = p_division_code
    AND  table_code    = p_table_code
  ORDER  BY norm_code;
$$;

-- Права для anon-доступа (RLS не используется в проекте).
GRANT EXECUTE ON FUNCTION public.fsnb_collection_divisions(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fsnb_division_tables(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fsnb_table_norms(uuid, text, text) TO anon, authenticated;
