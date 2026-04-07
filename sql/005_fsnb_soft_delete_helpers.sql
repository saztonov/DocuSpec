-- ============================================================================
-- 005_fsnb_soft_delete_helpers.sql
--
-- Soft-delete хелперы для дерева ФСНБ.
-- Используются UI «Расценки» при удалении расценки/подраздела/раздела
-- через контекстное меню правого клика.
--
-- Хранилище is_active уже введено миграцией 004. Эти функции лишь массово
-- проставляют is_active = false по нужному скоупу и возвращают количество
-- затронутых строк.
--
-- Жёсткое удаление не используем — действие обратимо ручным UPDATE.
-- ============================================================================

-- ── Удалить одну норму (расценку) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fsnb_soft_delete_norm(p_norm_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE fsnb_norms
    SET is_active = false
    WHERE id = p_norm_id
      AND is_active = true;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ── Удалить подраздел (таблицу) целиком ──────────────────────────────────────
CREATE OR REPLACE FUNCTION fsnb_soft_delete_table(
    p_collection_id uuid,
    p_division_code text,
    p_table_code text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE fsnb_norms
    SET is_active = false
    WHERE collection_id = p_collection_id
      AND division_code = p_division_code
      AND table_code = p_table_code
      AND is_active = true;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ── Удалить раздел целиком ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fsnb_soft_delete_division(
    p_collection_id uuid,
    p_division_code text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE fsnb_norms
    SET is_active = false
    WHERE collection_id = p_collection_id
      AND division_code = p_division_code
      AND is_active = true;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ============================================================================
-- ВАЖНО: RPC-функции дерева (fsnb_collection_divisions, fsnb_division_tables,
-- fsnb_table_norms) должны фильтровать по is_active = true, иначе удалённые
-- разделы/подразделы/нормы продолжат отображаться в дереве.
--
-- Если в текущих определениях этих функций фильтра нет — нужно добавить
-- WHERE is_active = true в их SELECT. Проверить через:
--   SELECT pg_get_functiondef('fsnb_collection_divisions'::regproc);
-- ============================================================================
