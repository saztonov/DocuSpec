-- ============================================================================
-- Миграция 009: очистка ФСНБ до минимального набора (~3 000 расценок)
-- ----------------------------------------------------------------------------
-- Удаляет из БД всё, что не входит в минимальный whitelist (fsnb_norms.is_selected = true):
--   * нормы fsnb_norms с is_selected IS NOT TRUE
--   * связи fsnb_norm_resources, fsnb_norm_tech_groups этих норм
--   * осиротевшие технологические группы и их fsnb_tg_resources
--   * осиротевшие ресурсы fsnb_resources
-- Предварительно очищает рабочие таблицы смет-матчингов (FK на fsnb_*).
--
-- Выполнять в SQL Editor Supabase. Перед применением сделать снапшот БД.
-- После транзакции запустить VACUUM ANALYZE (см. блок в конце файла).
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Счётчики ДО очистки (для отчёта в логе)
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_norms_total       bigint;
    v_norms_selected    bigint;
    v_norm_resources    bigint;
    v_norm_tech_groups  bigint;
    v_tech_groups       bigint;
    v_tg_resources      bigint;
    v_resources         bigint;
    v_rate_matches      bigint;
    v_resource_matches  bigint;
BEGIN
    SELECT COUNT(*) INTO v_norms_total       FROM fsnb_norms;
    SELECT COUNT(*) INTO v_norms_selected    FROM fsnb_norms WHERE is_selected = true;
    SELECT COUNT(*) INTO v_norm_resources    FROM fsnb_norm_resources;
    SELECT COUNT(*) INTO v_norm_tech_groups  FROM fsnb_norm_tech_groups;
    SELECT COUNT(*) INTO v_tech_groups       FROM fsnb_tech_groups;
    SELECT COUNT(*) INTO v_tg_resources      FROM fsnb_tg_resources;
    SELECT COUNT(*) INTO v_resources         FROM fsnb_resources;
    SELECT COUNT(*) INTO v_rate_matches      FROM estimate_rate_matches;
    SELECT COUNT(*) INTO v_resource_matches  FROM estimate_resource_matches;

    RAISE NOTICE '=== ДО очистки ===';
    RAISE NOTICE 'fsnb_norms: всего %, is_selected=true: %', v_norms_total, v_norms_selected;
    RAISE NOTICE 'fsnb_norm_resources: %', v_norm_resources;
    RAISE NOTICE 'fsnb_norm_tech_groups: %', v_norm_tech_groups;
    RAISE NOTICE 'fsnb_tech_groups: %', v_tech_groups;
    RAISE NOTICE 'fsnb_tg_resources: %', v_tg_resources;
    RAISE NOTICE 'fsnb_resources: %', v_resources;
    RAISE NOTICE 'estimate_rate_matches: %', v_rate_matches;
    RAISE NOTICE 'estimate_resource_matches: %', v_resource_matches;
END $$;

-- --------------------------------------------------------------------------
-- 2. Очистка смет-матчингов (FK мешают удалению норм/ресурсов)
--    Сначала estimate_resource_matches (ссылается на estimate_rate_matches).
-- --------------------------------------------------------------------------
DELETE FROM estimate_resource_matches;
DELETE FROM estimate_rate_matches;

-- --------------------------------------------------------------------------
-- 3. Удаление junction-строк для неотмеченных норм
-- --------------------------------------------------------------------------
DELETE FROM fsnb_norm_resources
WHERE norm_id IN (
    SELECT id FROM fsnb_norms WHERE is_selected IS NOT TRUE
);

DELETE FROM fsnb_norm_tech_groups
WHERE norm_id IN (
    SELECT id FROM fsnb_norms WHERE is_selected IS NOT TRUE
);

-- --------------------------------------------------------------------------
-- 4. Удаление неотмеченных норм
-- --------------------------------------------------------------------------
DELETE FROM fsnb_norms WHERE is_selected IS NOT TRUE;

-- --------------------------------------------------------------------------
-- 5. Осиротевшие технологические группы: ТГ, у которых не осталось ни одной
--    связи с выбранными нормами. Сначала — их fsnb_tg_resources.
-- --------------------------------------------------------------------------
DELETE FROM fsnb_tg_resources
WHERE tg_id IN (
    SELECT tg.id
    FROM fsnb_tech_groups tg
    WHERE NOT EXISTS (
        SELECT 1 FROM fsnb_norm_tech_groups ntg
        WHERE ntg.tg_id = tg.id
    )
);

DELETE FROM fsnb_tech_groups tg
WHERE NOT EXISTS (
    SELECT 1 FROM fsnb_norm_tech_groups ntg
    WHERE ntg.tg_id = tg.id
);

-- --------------------------------------------------------------------------
-- 6. Осиротевшие ресурсы: на которые не ссылается ни fsnb_norm_resources,
--    ни fsnb_tg_resources.
-- --------------------------------------------------------------------------
DELETE FROM fsnb_resources r
WHERE NOT EXISTS (
        SELECT 1 FROM fsnb_norm_resources nr
        WHERE nr.resource_id = r.id
    )
  AND NOT EXISTS (
        SELECT 1 FROM fsnb_tg_resources tr
        WHERE tr.resource_id = r.id
    );

-- --------------------------------------------------------------------------
-- 7. Счётчики ПОСЛЕ очистки + контрольные проверки целостности
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_norms_total       bigint;
    v_norms_selected    bigint;
    v_norm_resources    bigint;
    v_norm_tech_groups  bigint;
    v_tech_groups       bigint;
    v_tg_resources      bigint;
    v_resources         bigint;
    v_norms_not_selected bigint;
    v_orphan_nr         bigint;
    v_orphan_ntg        bigint;
    v_orphan_tg         bigint;
    v_orphan_res        bigint;
BEGIN
    SELECT COUNT(*) INTO v_norms_total       FROM fsnb_norms;
    SELECT COUNT(*) INTO v_norms_selected    FROM fsnb_norms WHERE is_selected = true;
    SELECT COUNT(*) INTO v_norms_not_selected FROM fsnb_norms WHERE is_selected IS NOT TRUE;
    SELECT COUNT(*) INTO v_norm_resources    FROM fsnb_norm_resources;
    SELECT COUNT(*) INTO v_norm_tech_groups  FROM fsnb_norm_tech_groups;
    SELECT COUNT(*) INTO v_tech_groups       FROM fsnb_tech_groups;
    SELECT COUNT(*) INTO v_tg_resources      FROM fsnb_tg_resources;
    SELECT COUNT(*) INTO v_resources         FROM fsnb_resources;

    -- Контроль: в junction не должно остаться ссылок на удалённые нормы
    SELECT COUNT(*) INTO v_orphan_nr
    FROM fsnb_norm_resources nr
    LEFT JOIN fsnb_norms n ON n.id = nr.norm_id
    WHERE n.id IS NULL;

    SELECT COUNT(*) INTO v_orphan_ntg
    FROM fsnb_norm_tech_groups ntg
    LEFT JOIN fsnb_norms n ON n.id = ntg.norm_id
    WHERE n.id IS NULL;

    -- Контроль: не должно остаться ТГ без связи с выбранными нормами
    SELECT COUNT(*) INTO v_orphan_tg
    FROM fsnb_tech_groups tg
    WHERE NOT EXISTS (
        SELECT 1 FROM fsnb_norm_tech_groups ntg WHERE ntg.tg_id = tg.id
    );

    -- Контроль: не должно остаться ресурсов без связей
    SELECT COUNT(*) INTO v_orphan_res
    FROM fsnb_resources r
    WHERE NOT EXISTS (SELECT 1 FROM fsnb_norm_resources nr WHERE nr.resource_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM fsnb_tg_resources  tr WHERE tr.resource_id = r.id);

    RAISE NOTICE '=== ПОСЛЕ очистки ===';
    RAISE NOTICE 'fsnb_norms: всего %, is_selected=true: %, не-selected (должно быть 0): %',
        v_norms_total, v_norms_selected, v_norms_not_selected;
    RAISE NOTICE 'fsnb_norm_resources: %', v_norm_resources;
    RAISE NOTICE 'fsnb_norm_tech_groups: %', v_norm_tech_groups;
    RAISE NOTICE 'fsnb_tech_groups: %', v_tech_groups;
    RAISE NOTICE 'fsnb_tg_resources: %', v_tg_resources;
    RAISE NOTICE 'fsnb_resources: %', v_resources;
    RAISE NOTICE '=== Контроль целостности (все значения должны быть 0) ===';
    RAISE NOTICE 'norm_resources без нормы: %', v_orphan_nr;
    RAISE NOTICE 'norm_tech_groups без нормы: %', v_orphan_ntg;
    RAISE NOTICE 'tech_groups без выбранных норм: %', v_orphan_tg;
    RAISE NOTICE 'resources без связей: %', v_orphan_res;

    IF v_norms_not_selected <> 0
        OR v_orphan_nr <> 0
        OR v_orphan_ntg <> 0
        OR v_orphan_tg <> 0
        OR v_orphan_res <> 0 THEN
        RAISE EXCEPTION 'Контроль целостности не пройден: миграция откатывается';
    END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Итоговый отчёт (выполнить после COMMIT)
-- ----------------------------------------------------------------------------
SELECT 'fsnb_norms'             AS table_name, COUNT(*) AS rows FROM fsnb_norms
UNION ALL SELECT 'fsnb_norm_resources',         COUNT(*) FROM fsnb_norm_resources
UNION ALL SELECT 'fsnb_norm_tech_groups',       COUNT(*) FROM fsnb_norm_tech_groups
UNION ALL SELECT 'fsnb_tech_groups',            COUNT(*) FROM fsnb_tech_groups
UNION ALL SELECT 'fsnb_tg_resources',           COUNT(*) FROM fsnb_tg_resources
UNION ALL SELECT 'fsnb_resources',              COUNT(*) FROM fsnb_resources
UNION ALL SELECT 'estimate_rate_matches',       COUNT(*) FROM estimate_rate_matches
UNION ALL SELECT 'estimate_resource_matches',   COUNT(*) FROM estimate_resource_matches;

-- ============================================================================
-- VACUUM ANALYZE — выполнить ОТДЕЛЬНЫМИ командами после миграции.
-- VACUUM нельзя запускать внутри транзакции и внутри DO-блока.
-- ============================================================================
-- VACUUM ANALYZE fsnb_norms;
-- VACUUM ANALYZE fsnb_norm_resources;
-- VACUUM ANALYZE fsnb_norm_tech_groups;
-- VACUUM ANALYZE fsnb_tech_groups;
-- VACUUM ANALYZE fsnb_tg_resources;
-- VACUUM ANALYZE fsnb_resources;
