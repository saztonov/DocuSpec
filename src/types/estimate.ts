import { z } from 'zod/v4';

// ── Type aliases ──

export type EstimateStatus =
  | 'draft'
  | 'preparing'
  | 'classifying'
  | 'pricing'
  | 'matching'
  | 'calculating'
  | 'validating'
  | 'done'
  | 'error';

export type EstimateMethod = 'resource_index' | 'resource' | 'base_index';

export type ReviewSeverity = 'error' | 'warning' | 'info';

export type ReviewIssueType =
  | 'uncovered_material'
  | 'unit_mismatch'
  | 'double_count'
  | 'cross_volume_dep'
  | 'no_geometry'
  | 'low_coverage'
  | 'tg_mismatch'
  | 'low_confidence';

export type RateMatchMethod = 'semantic' | 'rule' | 'llm' | 'manual';

export type ResourceMatchMethod =
  | 'gost'
  | 'code'
  | 'tg_semantic'
  | 'semantic'
  | 'llm'
  | 'manual';

// ── Database interfaces ──

export interface DbEstimate {
  id: string;
  doc_id: string;
  project_id: string | null;
  name: string;
  status: EstimateStatus;
  method: EstimateMethod;
  region_code: string | null;
  price_period: string | null;
  total_direct_cost: number | null;
  total_overhead: number | null;
  total_profit: number | null;
  total_cost: number | null;
  iteration_count: number;
  model_used: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbEstimateWorkItem {
  id: string;
  estimate_id: string;
  work_description: string;
  work_category: string | null;
  construction: string | null;
  source_section: string | null;
  source_material_fact_ids: string[];
  confidence: number;
  needs_review: boolean;
  agent_reasoning: string | null;
  agent_steps: unknown;
  created_at: string;
}

export interface DbEstimateRateMatch {
  id: string;
  estimate_id: string;
  work_item_id: string;
  fsnb_norm_id: string | null;
  norm_code: string | null;
  norm_name: string | null;
  norm_unit: string | null;
  match_confidence: number;
  match_method: RateMatchMethod | null;
  resource_coverage: number | null;
  needs_review: boolean;
  user_verified: boolean;
  agent_reasoning: string | null;
  alternatives: unknown;
  created_at: string;
}

export interface DbEstimateResourceMatch {
  id: string;
  estimate_id: string;
  material_fact_id: string;
  rate_match_id: string | null;
  fsnb_resource_id: string | null;
  fsnb_resource_code: string | null;
  fsnb_resource_name: string | null;
  fsnb_resource_unit: string | null;
  tg_id: string | null;
  match_confidence: number;
  match_method: ResourceMatchMethod | null;
  unit_compatible: boolean | null;
  conversion_formula: string | null;
  needs_review: boolean;
  user_verified: boolean;
  agent_reasoning: string | null;
  alternatives: unknown;
  created_at: string;
}

export interface DbEstimateLine {
  id: string;
  estimate_id: string;
  sort_order: number;
  rate_match_id: string | null;
  work_item_id: string | null;
  line_number: string | null;
  justification: string | null;
  description: string;
  measure_unit: string | null;
  volume: number | null;
  volume_calc_note: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  labor_cost: number | null;
  material_cost: number | null;
  machine_cost: number | null;
  source_material_fact_ids: string[];
  source_block_ids: string[];
  created_at: string;
}

export interface DbEstimateReviewItem {
  id: string;
  estimate_id: string;
  severity: ReviewSeverity;
  issue_type: ReviewIssueType;
  description: string;
  related_work_item_id: string | null;
  related_material_fact_id: string | null;
  related_resource_match_id: string | null;
  related_rate_match_id: string | null;
  suggested_action: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ── Progress tracking (UI) ──

export interface EstimateProgress {
  status: EstimateStatus;
  phase: string | null;
  currentAgent: string | null;
  currentStep: number;
  maxSteps: number;
  agentThinking: string | null;
}

// ── Zod schemas for LLM agent responses ──

// Agent 1 -- WorkClassifier
const WorkClassifierItemSchema = z.object({
  work_description: z.string().min(1),
  work_category: z.string().nullable(),
  construction: z.string().nullable(),
  source_section: z.string().nullable(),
  source_material_fact_ids: z.array(z.string()),
  confidence: z.number().min(0).max(1).default(0.8),
  needs_review: z.boolean().optional(),
  reasoning: z.string().nullable().optional(),
});

export const WorkClassifierResponseSchema = z.object({
  work_items: z.array(WorkClassifierItemSchema),
});

export type WorkClassifierResponse = z.infer<typeof WorkClassifierResponseSchema>;

// Agent 2 -- PricePicker
const RateAlternativeSchema = z.object({
  norm_code: z.string(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1).optional(),
});

const PricePickerItemSchema = z.object({
  work_item_id: z.string(),
  norm_code: z.string(),
  norm_name: z.string(),
  norm_unit: z.string().nullable(),
  match_confidence: z.number().min(0).max(1).default(0.7),
  match_method: z.enum(['semantic', 'rule', 'llm', 'manual']),
  resource_coverage: z.number().min(0).max(1).nullable().optional(),
  needs_review: z.boolean().optional(),
  reasoning: z.string().nullable().optional(),
  alternatives: z.array(RateAlternativeSchema).optional(),
});

export const PricePickerResponseSchema = z.object({
  rate_matches: z.array(PricePickerItemSchema),
});

export type PricePickerResponse = z.infer<typeof PricePickerResponseSchema>;

// Agent 3 -- ResourceMatcher
const ResourceAlternativeSchema = z.object({
  resource_code: z.string(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
});

const ResourceMatcherItemSchema = z.object({
  material_fact_id: z.string(),
  rate_match_id: z.string().nullable().optional(),
  fsnb_resource_code: z.string(),
  fsnb_resource_name: z.string(),
  fsnb_resource_unit: z.string().nullable(),
  match_confidence: z.number().min(0).max(1).default(0.7),
  match_method: z.enum(['gost', 'code', 'tg_semantic', 'semantic', 'llm', 'manual']),
  unit_compatible: z.boolean().nullable().optional(),
  conversion_formula: z.string().nullable().optional(),
  needs_review: z.boolean().optional(),
  reasoning: z.string().nullable().optional(),
  alternatives: z.array(ResourceAlternativeSchema).optional(),
});

export const ResourceMatcherResponseSchema = z.object({
  resource_matches: z.array(ResourceMatcherItemSchema),
});

export type ResourceMatcherResponse = z.infer<typeof ResourceMatcherResponseSchema>;
