-- 002: Хранение исходного markdown в таблице documents
-- Убирает зависимость от Supabase Storage

-- Добавить колонку для сырого markdown
alter table documents add column raw_md text;

-- storage_path больше не обязательна
alter table documents alter column storage_path drop not null;
