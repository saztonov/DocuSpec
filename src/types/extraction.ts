import { z } from 'zod/v4';

export const MaterialFactItemSchema = z.object({
  raw_name: z.string().min(1),
  canonical_name: z.string().nullable(),
  canonical_key: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  mark: z.string().nullable(),
  gost: z.string().nullable(),
  description: z.string().nullable(),
  note: z.string().nullable(),
  source_snippet: z.string().nullable(),
  confidence: z.number().min(0).max(1).default(0.8),
});

export const ExtractionResponseSchema = z.object({
  items: z.array(MaterialFactItemSchema),
});

export type MaterialFactItem = z.infer<typeof MaterialFactItemSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

export type TableCategory =
  | 'material_qty'
  | 'spec_elements'
  | 'element_spec'
  | 'floor_spec'
  | 'roof_spec'
  | 'room_schedule'
  | 'change_log'
  | 'unknown';

export interface ExtractionProgress {
  status: 'idle' | 'rule_based' | 'llm_extracting' | 'merging' | 'saving' | 'done' | 'error';
  completedBatches: number;
  totalBatches: number;
  extractedFacts: number;
  errorMessage: string | null;
}
