-- 010_drop_custom_rates.sql
-- Полное удаление функционала "Новые расценки" (Custom Rates).
-- Применять после 009_prune_fsnb_to_minimal.sql.

BEGIN;

-- 1. Таблица custom_rates вместе с индексами, триггером и FK на неё.
DROP TABLE IF EXISTS public.custom_rates CASCADE;

-- 2. Триггер-функция, обслуживавшая updated_at этой таблицы.
DROP FUNCTION IF EXISTS public.custom_rates_set_updated_at();

-- 3. Системные промпты LLM, использовавшиеся агентом RateRecommender.
DELETE FROM public.llm_prompts
WHERE key IN (
    'rate_recommender_system',
    'rate_recommender_system_fsnb',
    'rate_recommender_system_imported'
);

COMMIT;

-- Проверка:
--   SELECT to_regclass('public.custom_rates');                  -- должно вернуть NULL
--   SELECT key FROM public.llm_prompts WHERE key LIKE 'rate_recommender%';  -- 0 строк
