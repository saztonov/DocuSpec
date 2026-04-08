-- =============================================================================
-- 005_fsnb_is_selected.sql
-- Добавляет колонку is_selected в fsnb_norms для пометки "короткого" whitelist v2
-- поверх полного (v1) набора норм.
--
-- Использование:
--   - При импорте v1+v2flag: нормы из v2-whitelist получают is_selected = true,
--     остальные — false.
--   - UI имеет переключатель «Только отобранные» → WHERE is_selected = true.
--   - Для окончательного перехода на v2: DELETE FROM fsnb_norms WHERE NOT is_selected;
-- =============================================================================

ALTER TABLE fsnb_norms
    ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_fsnb_norms_selected
    ON fsnb_norms(id) WHERE is_selected;
