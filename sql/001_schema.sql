-- DocuSpec MVP Schema
-- Run this in Supabase Dashboard SQL Editor

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'anonymous',
  filename text not null,
  storage_path text not null,
  doc_code text,
  stamp_text text,
  status text not null default 'uploaded'
    check (status in ('uploaded','parsing','extracting','done','error','has_errors')),
  error_blocks_count int not null default 0,
  page_count int,
  block_count int,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table doc_pages (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references documents(id) on delete cascade,
  page_no int not null,
  sheet_label text,       -- **Лист:** value, e.g. '3.1', '1 (из 2)'
  sheet_name text,        -- **Наименование листа:** value
  created_at timestamptz not null default now(),
  unique(doc_id, page_no)
);

create table doc_blocks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references documents(id) on delete cascade,
  page_id uuid not null references doc_pages(id) on delete cascade,
  block_uid text not null,
  block_type text not null check (block_type in ('TEXT','IMAGE')),
  content text not null,
  has_table boolean not null default false,
  has_error boolean not null default false,
  error_text text,
  section_title text,
  created_at timestamptz not null default now(),
  unique(doc_id, block_uid)
);

create table material_facts (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references documents(id) on delete cascade,
  block_id uuid not null references doc_blocks(id) on delete cascade,
  raw_name text not null,
  canonical_name text,
  canonical_key text,
  quantity numeric,
  unit text,
  mark text,
  gost text,
  description text,
  note text,
  source_snippet text,
  table_category text,
  confidence real not null default 1.0,
  user_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_doc_pages_doc_id on doc_pages(doc_id);
create index idx_doc_blocks_doc_id on doc_blocks(doc_id);
create index idx_doc_blocks_page_id on doc_blocks(page_id);
create index idx_material_facts_doc_id on material_facts(doc_id);
create index idx_material_facts_block_id on material_facts(block_id);
create index idx_material_facts_canonical_key on material_facts(canonical_key);

-- ============================================================
-- VIEW: Aggregated BOM summary
-- ============================================================

create or replace view bom_summary as
select
  mf.doc_id,
  mf.canonical_key,
  max(mf.canonical_name) as canonical_name,
  mf.unit,
  sum(mf.quantity) as total_qty,
  count(*) as fact_count,
  array_agg(distinct mf.block_id) as source_block_ids,
  bool_and(mf.user_verified) as all_verified
from material_facts mf
where mf.canonical_key is not null
group by mf.doc_id, mf.canonical_key, mf.unit;

-- ============================================================
-- STORAGE: Create bucket for document files
-- ============================================================
-- Run this separately in Supabase Dashboard -> Storage -> Create bucket
-- Bucket name: documents
-- Public: false

-- ============================================================
-- NOTE: RLS is NOT enabled in MVP (no auth)
-- When adding auth later, enable RLS and add policies:
--   ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "users_own_documents" ON documents
--     FOR ALL USING (auth.uid()::text = user_id);
--   ... etc for other tables
-- ============================================================
