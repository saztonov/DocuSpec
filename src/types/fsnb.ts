// ── Type aliases ──

export type FsnbBaseType = 'ГЭСН' | 'ГЭСНм' | 'ГЭСНр' | 'ГЭСНп';

export type FsnbCollectionBaseType =
  | 'gesn'
  | 'gesnm'
  | 'gesnr'
  | 'gesnp'
  | 'fsbc_mat'
  | 'fsbc_mach';

export type FsnbResourceType = 'material' | 'equipment' | 'machine' | 'labor';

// ── Database table interfaces ──

export interface DbFsnbCollection {
  id: string;
  code: string;
  name: string;
  base_type: FsnbCollectionBaseType;
  version: string | null;
  xml_source_name: string | null;
  record_count: number;
  imported_at: string | null;
  created_at: string;
}

export interface DbFsnbResource {
  id: string;
  collection_id: string | null;
  code: string;
  name: string;
  measure_unit: string | null;
  resource_type: FsnbResourceType;

  // Иерархия (хлебные крошки)
  book_code: string | null;
  book_name: string | null;
  part_code: string | null;
  part_name: string | null;
  section_code: string | null;
  section_name: string | null;
  group_code: string | null;
  group_name: string | null;

  // Цены
  base_price: number | null;
  opt_price: number | null;

  // Для машин
  salary_mach: number | null;
  labour_mach: number | null;
  price_without_salary: number | null;
  machinist_category: number | null;

  // ГОСТ ссылки
  gost_refs: string[] | null;

  // embedding пропущен (pgvector, не нужен на клиенте)
  search_text: string | null;
  metadata: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface DbFsnbNorm {
  id: string;
  collection_id: string | null;
  norm_code: string;
  base_type: FsnbBaseType;

  name: string;
  begin_name: string | null;
  end_name: string | null;
  measure_unit: string;

  // Иерархия
  collection_code: string | null;
  collection_name: string | null;
  division_code: string | null;
  division_name: string | null;
  table_code: string | null;
  table_name: string | null;
  work_category: string | null;

  // embedding пропущен
  search_text: string | null;
  metadata: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface DbFsnbNormResource {
  id: string;
  norm_id: string;
  resource_id: string | null;
  resource_code: string;
  resource_name: string | null;
  resource_type: string | null;
  consumption: number | null;
  measure_unit: string | null;
  created_at: string;
}

export interface DbFsnbTechGroup {
  id: string;
  tg_code: string;
  tg_name: string | null;
  resource_count: number;
  created_at: string;
}

export interface DbFsnbTgResource {
  id: string;
  tg_id: string;
  resource_id: string | null;
  resource_code: string;
}

export interface DbFsnbNormTechGroup {
  id: string;
  norm_id: string | null;
  norm_code: string;
  norm_base_type: string;
  tg_id: string;
  abstract_resource_code: string | null;
  abstract_resource_name: string | null;
  abstract_resource_unit: string | null;
}

export interface DbFsnbPriceIndex {
  id: string;
  region_code: string;
  region_name: string | null;
  period: string;
  work_category: string | null;
  labor_index: number | null;
  material_index: number | null;
  machine_index: number | null;
  equipment_index: number | null;
  source: string | null;
  created_at: string;
}

export interface DbFsnbSynonym {
  id: string;
  term: string;
  canonical_term: string;
  resource_code_prefix: string | null;
  created_at: string;
}

// ── XML parsing intermediate structures ──

export interface FsnbXmlResource {
  code: string;
  name: string;
  measure_unit: string | null;
  resource_type: FsnbResourceType;
  book_code: string | null;
  book_name: string | null;
  part_code: string | null;
  part_name: string | null;
  section_code: string | null;
  section_name: string | null;
  group_code: string | null;
  group_name: string | null;
  base_price: number | null;
  opt_price: number | null;
  salary_mach: number | null;
  labour_mach: number | null;
  price_without_salary: number | null;
  machinist_category: number | null;
  gost_refs: string[];
  metadata: Record<string, unknown>;
}

export interface FsnbXmlWork {
  norm_code: string;
  base_type: FsnbBaseType;
  name: string;
  begin_name: string | null;
  end_name: string | null;
  measure_unit: string;
  collection_code: string | null;
  collection_name: string | null;
  division_code: string | null;
  division_name: string | null;
  table_code: string | null;
  table_name: string | null;
  resources: FsnbXmlWorkResource[];
  metadata: Record<string, unknown>;
}

export interface FsnbXmlWorkResource {
  resource_code: string;
  resource_name: string | null;
  resource_type: string | null;
  consumption: number | null;
  measure_unit: string | null;
}

export interface FsnbXmlTechGroup {
  tg_code: string;
  tg_name: string | null;
  resource_codes: string[];
  norm_links: FsnbXmlTechGroupNormLink[];
}

export interface FsnbXmlTechGroupNormLink {
  norm_code: string;
  base_type: string;
  abstract_resource_code: string | null;
  abstract_resource_name: string | null;
  abstract_resource_unit: string | null;
}

// ── RAG search results ──

export interface FsnbSearchResult {
  id: string;
  code: string;
  name: string;
  measure_unit: string | null;
  resource_type: FsnbResourceType;
  score: number;
}

export interface FsnbNormSearchResult {
  id: string;
  norm_code: string;
  name: string;
  measure_unit: string;
  base_type: FsnbBaseType;
  work_category: string | null;
  score: number;
}
