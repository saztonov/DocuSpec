-- =============================================================================
-- 006_fsnb_tree_only_selected.sql
--
-- Расширяет три RPC дерева ФСНБ необязательным параметром p_only_selected.
-- Когда p_only_selected = true, дерево показывает только нормы (и пустые
-- ветки автоматически отсеиваются), у которых is_selected = true.
--
-- Поведение при p_only_selected = false (значение по умолчанию) идентично
-- предыдущим определениям функций — фронт без правок продолжает работать.
--
-- Каскадная скрытость пустых веток обеспечивается тем, что DISTINCT ON
-- агрегирует только те строки, которые проходят WHERE: если в подразделе
-- не осталось ни одной нормы с is_selected = true, его table_code не
-- появится в результате fsnb_division_tables; то же для разделов.
--
-- Изменение сигнатуры (добавление параметра) требует DROP + CREATE,
-- потому что CREATE OR REPLACE не может изменить число параметров.
-- =============================================================================

-- ── fsnb_table_norms ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fsnb_table_norms(uuid, text, text);

CREATE OR REPLACE FUNCTION public.fsnb_table_norms(
    p_collection_id  uuid,
    p_division_code  text,
    p_table_code     text,
    p_only_selected  boolean DEFAULT false
)
RETURNS TABLE(id uuid, norm_code text, name text)
LANGUAGE sql
STABLE
AS $function$
    SELECT id, norm_code, name
    FROM   public.fsnb_norms
    WHERE  collection_id = p_collection_id
      AND  division_code = p_division_code
      AND  table_code    = p_table_code
      AND  (NOT p_only_selected OR is_selected = true)
    ORDER  BY norm_code;
$function$;

-- ── fsnb_division_tables ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fsnb_division_tables(uuid, text);

CREATE OR REPLACE FUNCTION public.fsnb_division_tables(
    p_collection_id  uuid,
    p_division_code  text,
    p_only_selected  boolean DEFAULT false
)
RETURNS TABLE(table_code text, table_name text)
LANGUAGE sql
STABLE
AS $function$
    SELECT DISTINCT ON (table_code)
           table_code,
           table_name
    FROM   public.fsnb_norms
    WHERE  collection_id = p_collection_id
      AND  division_code = p_division_code
      AND  table_code IS NOT NULL
      AND  (NOT p_only_selected OR is_selected = true)
    ORDER  BY table_code;
$function$;

-- ── fsnb_collection_divisions ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fsnb_collection_divisions(uuid);

CREATE OR REPLACE FUNCTION public.fsnb_collection_divisions(
    p_collection_id  uuid,
    p_only_selected  boolean DEFAULT false
)
RETURNS TABLE(division_code text, division_name text)
LANGUAGE sql
STABLE
AS $function$
    SELECT DISTINCT ON (division_code)
           division_code,
           division_name
    FROM   public.fsnb_norms
    WHERE  collection_id = p_collection_id
      AND  division_code IS NOT NULL
      AND  (NOT p_only_selected OR is_selected = true)
    ORDER  BY division_code;
$function$;
