export type DocumentStatus = 'uploaded' | 'parsing' | 'extracting' | 'done' | 'error' | 'has_errors';

export interface DbDocument {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  doc_code: string | null;
  stamp_text: string | null;
  status: DocumentStatus;
  error_blocks_count: number;
  page_count: number | null;
  block_count: number | null;
  error_message: string | null;
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
  confidence: number;
  user_verified: boolean;
  created_at: string;
  updated_at: string;
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
}
