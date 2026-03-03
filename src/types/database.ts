export interface DbProject {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbSection {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export type DocumentStatus = 'uploaded' | 'parsing' | 'extracting' | 'done' | 'error' | 'has_errors';

export interface DbDocument {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string | null;
  raw_md: string;
  doc_code: string | null;
  stamp_text: string | null;
  status: DocumentStatus;
  error_blocks_count: number;
  page_count: number | null;
  block_count: number | null;
  error_message: string | null;
  model_used: string | null;
  project_id: string | null;
  section_id: string | null;
  glossary_status: 'pending' | 'done' | 'skipped' | null;
  created_at: string;
  updated_at: string;
}

export interface DbDocPage {
  id: string;
  doc_id: string;
  page_no: number;
  sheet_label: string | null;
  sheet_name: string | null;
  created_at: string;
}

export interface DbDocBlock {
  id: string;
  doc_id: string;
  page_id: string;
  block_uid: string;
  block_type: 'TEXT' | 'IMAGE';
  content: string;
  has_table: boolean;
  has_error: boolean;
  error_text: string | null;
  section_title: string | null;
  image_url: string | null;
  created_at: string;
}

export interface DbMaterialFact {
  id: string;
  doc_id: string;
  block_id: string;
  raw_name: string;
  canonical_name: string | null;
  canonical_key: string | null;
  quantity: number | null;
  unit: string | null;
  mark: string | null;
  gost: string | null;
  description: string | null;
  note: string | null;
  source_snippet: string | null;
  table_category: string | null;
  source_section: string | null;
  construction: string | null;
  extra_params: string | null;
  block_type_display: string | null;
  confidence: number;
  user_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbStatement {
  id: string;
  doc_id: string;
  name: string;
  model_used: string | null;
  item_count: number | null;
  project_id: string | null;
  section_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbStatementItem {
  id: string;
  statement_id: string;
  canonical_key: string;
  canonical_name: string;
  unit: string | null;
  total_qty: number | null;
  fact_count: number;
  source_block_ids: string[];
  user_verified: boolean;
}

export interface DbBomSummary {
  doc_id: string;
  canonical_key: string;
  canonical_name: string;
  unit: string | null;
  total_qty: number | null;
  fact_count: number;
  source_block_ids: string[];
  all_verified: boolean;
  source_block_display_types: string[] | null;
}

export interface DbLlmPrompt {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system_prompt: string;
  default_system_prompt: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbDocGlossary {
  id: string;
  doc_id: string;
  code: string;
  item_type: 'material' | 'assembly' | 'construction' | 'location' | 'color';
  description: string | null;
  source_block_id: string | null;
  confidence: number;
  created_at: string;
}

export interface DbProductFact {
  id: string;
  doc_id: string;
  block_id: string | null;
  assembly_mark: string;
  assembly_name: string | null;
  canonical_key: string | null;
  quantity: number | null;
  unit: string | null;
  source_section: string;
  description: string | null;
  note: string | null;
  source_snippet: string | null;
  confidence: number;
  user_verified: boolean;
  created_at: string;
  updated_at: string;
}
