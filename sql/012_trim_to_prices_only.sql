-- Миграция 012: сокращение БД до справочника расценок.
-- Удаляются: ведомости, пайплайн смет, извлечение материалов, разделы, промпты LLM и логи LLM.
-- Остаются: projects, семейство fsnb_*, семейство imported_rate_*.
--
-- Порядок DROP — снизу вверх по FK: сначала зависимые таблицы, затем родительские.
-- CASCADE используется, чтобы удалить сопутствующие индексы, зависимые view и policies.

BEGIN;

-- ── Представления, зависящие от material_facts ─────────────────────────────
DROP VIEW IF EXISTS bom_summary CASCADE;

-- ── Ведомости ──────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS statement_items CASCADE;
DROP TABLE IF EXISTS statements CASCADE;

-- ── Пайплайн смет ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS estimate_review_queue CASCADE;
DROP TABLE IF EXISTS estimate_lines CASCADE;
DROP TABLE IF EXISTS estimate_resource_matches CASCADE;
DROP TABLE IF EXISTS estimate_rate_matches CASCADE;
DROP TABLE IF EXISTS estimate_work_items CASCADE;
DROP TABLE IF EXISTS estimates CASCADE;

-- ── Phase A.5 и извлечение материалов ──────────────────────────────────────
DROP TABLE IF EXISTS dependency_flags CASCADE;
DROP TABLE IF EXISTS work_hints CASCADE;
DROP TABLE IF EXISTS doc_glossary CASCADE;
DROP TABLE IF EXISTS product_facts CASCADE;
DROP TABLE IF EXISTS material_facts CASCADE;
DROP TABLE IF EXISTS doc_blocks CASCADE;
DROP TABLE IF EXISTS doc_pages CASCADE;
DROP TABLE IF EXISTS documents CASCADE;

-- ── Разделы ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS sections CASCADE;

-- ── Промпты и логи LLM ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS llm_prompts CASCADE;
DROP TABLE IF EXISTS llm_logs CASCADE;

-- ── Skill registry (часть удалённого агентного пайплайна) ──────────────────
DROP TABLE IF EXISTS skill_feedback CASCADE;
DROP TABLE IF EXISTS skill_examples CASCADE;
DROP TABLE IF EXISTS skill_registry CASCADE;

COMMIT;

-- После применения миграции должны остаться только таблицы:
--   projects,
--   fsnb_collections, fsnb_norms, fsnb_norm_resources, fsnb_norm_tech_groups,
--   fsnb_price_indices, fsnb_profile_collections, fsnb_profiles,
--   fsnb_resources, fsnb_synonyms, fsnb_tech_groups, fsnb_tg_resources,
--   imported_rate_categories, imported_rate_types, imported_rates,
--   и служебные _stg_* staging-таблицы импорта ФСНБ.
