// ── Type aliases ──

export type AgentType = 'work_classifier' | 'price_picker' | 'resource_matcher' | 'volume_calculator';
export type SkillType = 'rule' | 'prompt' | 'example_bank';
export type SkillCreator = 'system' | 'auto_proposed' | 'user';
export type FeedbackAction = 'confirmed' | 'corrected' | 'rejected';
export type ExampleSource = 'user_correction' | 'confirmed_match' | 'manual';

// ── Rule config structures ──

export interface MatchingRule {
  match: { [field: string]: string };
  result: { [field: string]: unknown };
}

export interface UnitConversionRule {
  from: string;
  to: string;
  formula: string;
}

export interface OcrCorrectionRule {
  pattern: string;
  correction: string;
}

export interface GostMappingRule {
  match: { gost: string };
  result: {
    ksr_book: string;
    ksr_section?: string;
    description: string;
  };
}

// ── Database row interfaces ──

export interface DbSkillRegistry {
  id: string;
  agent_type: AgentType;
  skill_type: SkillType;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  rule_config: MatchingRule | UnitConversionRule | OcrCorrectionRule | GostMappingRule | null;
  prompt_template: string | null;
  example_group_id: string | null;
  total_uses: number;
  successful_uses: number;
  rejected_uses: number;
  accuracy_rate: number | null;
  avg_confidence: number | null;
  created_by: SkillCreator;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbSkillExample {
  id: string;
  group_id: string;
  agent_type: AgentType;
  input_text: string;
  input_context: Record<string, unknown>;
  output_result: Record<string, unknown>;
  source: ExampleSource | null;
  doc_id: string | null;
  quality_score: number;
  created_at: string;
}

export interface DbSkillFeedback {
  id: string;
  skill_id: string | null;
  estimate_id: string | null;
  agent_type: AgentType;
  action: FeedbackAction;
  original_result: Record<string, unknown> | null;
  corrected_result: Record<string, unknown> | null;
  user_comment: string | null;
  created_at: string;
}

// ── Agent framework interfaces ──

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: AgentTool[];
  maxSteps: number;
  temperature: number;
  model?: string;
}

export interface AgentStep {
  stepNumber: number;
  toolCalls: { name: string; input: unknown; output: unknown }[];
  thinking: string | null;
}

export interface AgentResult {
  finalAnswer: string;
  steps: AgentStep[];
  totalSteps: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
