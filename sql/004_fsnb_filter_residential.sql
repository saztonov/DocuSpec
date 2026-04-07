-- =============================================================================
-- 004_fsnb_filter_residential.sql
-- Этап 1 оптимизации БД ФСНБ: фильтрация под профиль "генподряд многоэтажных ЖК".
--
-- Применяется ПОСЛЕ 003_fsnb_explorer_helpers.sql.
-- Подход: soft-delete (is_active boolean), физическое удаление — отдельной
-- миграцией 005_fsnb_purge_inactive.sql после прогона на проде.
--
-- Запускать БЛОКАМИ (между --==BLOCK==-- разделителями), чтобы не упереться
-- в statement_timeout Supabase. Каждый блок идемпотентен.
-- =============================================================================

-- ==BLOCK 1: схема профилей и soft-delete колонки=============================

CREATE TABLE IF NOT EXISTS fsnb_profiles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fsnb_profile_collections (
    profile_id      uuid NOT NULL REFERENCES fsnb_profiles(id) ON DELETE CASCADE,
    collection_id   uuid NOT NULL REFERENCES fsnb_collections(id) ON DELETE CASCADE,
    collection_code text NOT NULL,
    mode            text NOT NULL CHECK (mode IN ('full', 'partial', 'exclude')),
    note            text,
    PRIMARY KEY (profile_id, collection_id, collection_code)
);

ALTER TABLE fsnb_norms     ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE fsnb_resources ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fsnb_norms_active     ON fsnb_norms(id)     WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_fsnb_resources_active ON fsnb_resources(id) WHERE is_active;

INSERT INTO fsnb_profiles (code, name, description)
VALUES (
    'residential_highrise',
    'Генподряд многоэтажных ЖК',
    'Новостройка, монолитный каркас, стандартные инженерные системы, благоустройство придомовой территории'
)
ON CONFLICT (code) DO NOTHING;

-- ==BLOCK 2: заполнение профиля residential_highrise==========================

-- Очищаем перед перезаливкой (идемпотентность)
DELETE FROM fsnb_profile_collections
WHERE profile_id = (SELECT id FROM fsnb_profiles WHERE code='residential_highrise');

WITH p AS (SELECT id FROM fsnb_profiles WHERE code='residential_highrise'),
     gesn AS (SELECT id FROM fsnb_collections WHERE code='ГЭСН'),
     gesnm AS (SELECT id FROM fsnb_collections WHERE code='ГЭСНм'),
     gesnp AS (SELECT id FROM fsnb_collections WHERE code='ГЭСНп')
INSERT INTO fsnb_profile_collections (profile_id, collection_id, collection_code, mode, note)
SELECT p.id, gesn.id, code, 'full', note FROM p, gesn, (VALUES
    ('01','Земляные работы'),
    ('05','Свайные работы'),
    ('06','Бетонные и ж/б монолитные'),
    ('07','Бетонные и ж/б сборные'),
    ('08','Конструкции из кирпича и блоков'),
    ('09','Строительные металлические конструкции'),
    ('10','Деревянные конструкции'),
    ('11','Полы'),
    ('12','Кровли'),
    ('13','Защита конструкций от коррозии'),
    ('15','Отделочные работы'),
    ('16','Трубопроводы внутренние'),
    ('17','Водопровод и канализация - внутр.'),
    ('18','Отопление - внутр.'),
    ('19','Газоснабжение - внутр.'),
    ('20','Вентиляция и кондиционирование'),
    ('21','Временные сборно-разборные'),
    ('22','Водопровод - наружные сети'),
    ('23','Канализация - наружные сети'),
    ('24','Теплоснабжение и газопроводы - наружные'),
    ('26','Теплоизоляционные работы'),
    ('27','Автомобильные дороги (благоустройство)'),
    ('34','Сооружения связи (слаботочка)'),
    ('39','Контроль монтажных сварных соединений'),
    ('47','Озеленение')
) AS t(code, note)
UNION ALL
SELECT p.id, gesnm.id, code, 'full', note FROM p, gesnm, (VALUES
    ('01','Электротехнические устройства'),
    ('03','Подъемно-транспортное (лифты)'),
    ('07','Компрессорные установки, насосы и вентиляторы'),
    ('08','Электротехнические установки'),
    ('10','Оборудование связи'),
    ('11','Приборы автоматизации (диспетчеризация)'),
    ('12','Технологические трубопроводы (ИТП)'),
    ('37','Оборудование общего назначения'),
    ('39','Контроль монтажных сварных соединений'),
    ('40','Дополнительное перемещение оборудования')
) AS t(code, note)
UNION ALL
-- ГЭСНп пусконаладка — оставляем целиком на первой итерации
SELECT p.id, gesnp.id, n.collection_code, 'full', 'Пусконаладка - оставлено целиком'
FROM p, gesnp,
     (SELECT DISTINCT collection_code FROM fsnb_norms
      WHERE collection_id=(SELECT id FROM fsnb_collections WHERE code='ГЭСНп')) n;

-- ==BLOCK 3a: создание staging-таблицы со списком ID для деактивации==========
-- Этот блок ТОЛЬКО собирает ID — без UPDATE. Лёгкий, быстрый.
-- Используем ОБЫЧНУЮ (не TEMP) таблицу, чтобы блоки 3b можно было гонять
-- в отдельных сессиях SQL Editor.

DROP TABLE IF EXISTS _stg_norms_to_deactivate;
CREATE TABLE _stg_norms_to_deactivate (
    id uuid PRIMARY KEY,
    processed boolean NOT NULL DEFAULT false
);
CREATE INDEX ON _stg_norms_to_deactivate(processed);

INSERT INTO _stg_norms_to_deactivate (id)
SELECT n.id
FROM fsnb_norms n
LEFT JOIN fsnb_profile_collections pc
    ON pc.collection_id   = n.collection_id
   AND pc.collection_code = n.collection_code
   AND pc.profile_id      = (SELECT id FROM fsnb_profiles WHERE code='residential_highrise')
   AND pc.mode IN ('full','partial')
WHERE pc.profile_id IS NULL;

-- Проверка количества:
-- SELECT count(*) FROM _stg_norms_to_deactivate;

-- ==BLOCK 3b: батчевый UPDATE норм — ВЫПОЛНЯТЬ ПОВТОРНО до 0 строк===========
-- Каждый запуск обрабатывает один батч в 2000 строк. Повторять, пока количество
-- обработанных не сравняется с общим (см. SELECT в комментарии).
-- Размер батча подобран под typical Supabase statement_timeout (60 сек).

WITH batch AS (
    SELECT id FROM _stg_norms_to_deactivate
    WHERE NOT processed
    LIMIT 2000
    FOR UPDATE SKIP LOCKED
),
upd AS (
    UPDATE fsnb_norms n
    SET is_active = false
    FROM batch
    WHERE n.id = batch.id AND n.is_active
    RETURNING n.id
)
UPDATE _stg_norms_to_deactivate s
SET processed = true
FROM batch
WHERE s.id = batch.id;

-- Контроль прогресса:
-- SELECT count(*) FILTER (WHERE processed) AS done,
--        count(*) FILTER (WHERE NOT processed) AS remaining,
--        count(*) AS total
-- FROM _stg_norms_to_deactivate;

-- ==BLOCK 3c: очистка staging после завершения================================
-- Запустить ПОСЛЕ того, как BLOCK 3b показал remaining=0.

-- DROP TABLE _stg_norms_to_deactivate;

-- ==BLOCK 4: сбор "живых" ресурсов и списка на деактивацию====================
-- Только SELECT'ы во вспомогательные обычные таблицы. Без UPDATE.

DROP TABLE IF EXISTS _stg_resources_keep;
CREATE TABLE _stg_resources_keep (resource_id uuid PRIMARY KEY);

-- 4a) ресурсы, на которые ссылаются активные нормы напрямую
INSERT INTO _stg_resources_keep (resource_id)
SELECT DISTINCT nr.resource_id
FROM fsnb_norm_resources nr
JOIN fsnb_norms n ON n.id = nr.norm_id AND n.is_active
WHERE nr.resource_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4b) ресурсы, доступные через активные нормы → техгруппы → ресурсы ТГ
INSERT INTO _stg_resources_keep (resource_id)
SELECT DISTINCT tgr.resource_id
FROM fsnb_norm_tech_groups ntg
JOIN fsnb_norms n      ON n.id = ntg.norm_id AND n.is_active
JOIN fsnb_tg_resources tgr ON tgr.tg_id = ntg.tg_id
WHERE tgr.resource_id IS NOT NULL
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS _stg_resources_to_deactivate;
CREATE TABLE _stg_resources_to_deactivate (
    id uuid PRIMARY KEY,
    processed boolean NOT NULL DEFAULT false
);
CREATE INDEX ON _stg_resources_to_deactivate(processed);

INSERT INTO _stg_resources_to_deactivate (id)
SELECT r.id
FROM fsnb_resources r
LEFT JOIN _stg_resources_keep k ON k.resource_id = r.id
WHERE k.resource_id IS NULL;

-- Проверка:
-- SELECT count(*) FROM _stg_resources_to_deactivate;

-- ==BLOCK 5: UPDATE ресурсов одним DO-блоком с поднятым statement_timeout====
-- SQL Editor Supabase оборачивает всё в транзакцию, поэтому CALL с COMMIT
-- не работает. Решение: поднять statement_timeout локально на эту транзакцию
-- и прогнать цикл в DO-блоке (без COMMIT — одна большая транзакция, но
-- с тайм-аутом в 30 минут).

SET LOCAL statement_timeout = '30min';

DO $$
DECLARE
    rows_in_batch int;
    processed_total int := 0;
BEGIN
    LOOP
        WITH batch AS (
            SELECT id FROM _stg_resources_to_deactivate
            WHERE NOT processed
            LIMIT 500
            FOR UPDATE SKIP LOCKED
        ),
        upd AS (
            UPDATE fsnb_resources r
            SET is_active = false
            FROM batch
            WHERE r.id = batch.id AND r.is_active
            RETURNING r.id
        )
        UPDATE _stg_resources_to_deactivate s
        SET processed = true
        FROM batch
        WHERE s.id = batch.id;

        GET DIAGNOSTICS rows_in_batch = ROW_COUNT;
        EXIT WHEN rows_in_batch = 0;
        processed_total := processed_total + rows_in_batch;
        RAISE NOTICE 'processed % rows', processed_total;
    END LOOP;
END $$;

-- Контроль:
-- SELECT count(*) FILTER (WHERE processed) AS done,
--        count(*) FILTER (WHERE NOT processed) AS remaining,
--        count(*) AS total
-- FROM _stg_resources_to_deactivate;

-- ==BLOCK 5c: очистка staging после завершения================================
-- DROP TABLE _stg_resources_to_deactivate;
-- DROP TABLE _stg_resources_keep;

-- ==BLOCK 6: проверка результата (выполнить вручную)==========================
-- SELECT
--     (SELECT count(*) FROM fsnb_norms WHERE is_active)            AS norms_active,
--     (SELECT count(*) FROM fsnb_norms WHERE NOT is_active)        AS norms_inactive,
--     (SELECT count(*) FROM fsnb_resources WHERE is_active)        AS resources_active,
--     (SELECT count(*) FROM fsnb_resources WHERE NOT is_active)    AS resources_inactive;
