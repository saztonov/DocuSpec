/**
 * Skill Engine — loads and applies skills from the `skill_registry` DB table.
 *
 * Provides helpers for:
 *  - Loading rule / prompt skills for a given agent type
 *  - Evaluating matching rules against an input record
 *  - Retrieving similar examples for dynamic few-shot injection
 *  - Logging skill usage & user feedback
 *  - Auto-proposing new rules when enough confirmations accumulate
 */

import { supabase } from './supabase.ts';
import { callEmbeddingApi } from './llm.ts';
import type {
  DbSkillRegistry,
  AgentType,
  MatchingRule,
} from '../types/skills.ts';

// ── Loading skills ─────────────────────────────────────────────

/** Load all active rule-type skills for a given agent. */
export async function loadRuleSkills(agentType: AgentType): Promise<DbSkillRegistry[]> {
  const { data, error } = await supabase
    .from('skill_registry')
    .select('*')
    .eq('agent_type', agentType)
    .eq('skill_type', 'rule')
    .eq('is_active', true)
    .order('version', { ascending: false });

  if (error) {
    console.error('[skillEngine] loadRuleSkills error:', error.message);
    return [];
  }
  return (data ?? []) as DbSkillRegistry[];
}

/** Load all active prompt-type skills for a given agent. */
export async function loadPromptSkills(agentType: AgentType): Promise<DbSkillRegistry[]> {
  const { data, error } = await supabase
    .from('skill_registry')
    .select('*')
    .eq('agent_type', agentType)
    .eq('skill_type', 'prompt')
    .eq('is_active', true)
    .order('version', { ascending: false });

  if (error) {
    console.error('[skillEngine] loadPromptSkills error:', error.message);
    return [];
  }
  return (data ?? []) as DbSkillRegistry[];
}

// ── Rule matching ──────────────────────────────────────────────

/**
 * Check whether a single MatchingRule matches the given input record.
 *
 * Each field in `rule.match` is treated as a regex pattern. Multiple
 * alternative patterns can be separated by `|`. A field matches if the
 * corresponding input value satisfies the regex (case-insensitive).
 *
 * @returns `true` if ALL fields in the rule match.
 */
function ruleMatches(
  rule: MatchingRule,
  input: Record<string, string | null>,
): boolean {
  for (const [field, pattern] of Object.entries(rule.match)) {
    const value = input[field];
    if (value == null) return false;

    try {
      const re = new RegExp(pattern, 'i');
      if (!re.test(value)) return false;
    } catch {
      // If the pattern is malformed, fall back to plain includes check
      if (!value.toLowerCase().includes(pattern.toLowerCase())) return false;
    }
  }
  return true;
}

/**
 * Apply rule-skills to an input record. Returns the first matching skill's
 * result, or `null` if nothing matches.
 *
 * Skills are evaluated in the order returned from the DB (highest version
 * first), so newer versions shadow older ones.
 */
export async function applyRules(
  skills: DbSkillRegistry[],
  input: Record<string, string | null>,
): Promise<{ skillId: string; result: Record<string, unknown>; confidence: number } | null> {
  for (const skill of skills) {
    const rule = skill.rule_config as MatchingRule | null;
    if (!rule?.match || !rule?.result) continue;

    if (ruleMatches(rule, input)) {
      // Confidence = skill accuracy if available, otherwise default 0.8
      const confidence = skill.accuracy_rate ?? 0.8;
      return {
        skillId: skill.id,
        result: rule.result as Record<string, unknown>,
        confidence,
      };
    }
  }
  return null;
}

// ── Similar examples (few-shot) ────────────────────────────────

interface SimilarExample {
  input_text: string;
  input_context: unknown;
  output_result: unknown;
  quality_score: number;
}

/**
 * Get similar examples for dynamic few-shot injection.
 *
 * Tries embedding-based cosine similarity first. If embeddings are not
 * available or the table lacks the `embedding` column, falls back to a
 * text `ilike` search.
 */
export async function getSimilarExamples(
  agentType: AgentType,
  query: string,
  limit: number = 5,
): Promise<SimilarExample[]> {
  // --- Attempt 1: embedding-based search via RPC ----------------
  try {
    const [queryEmbedding] = await callEmbeddingApi({ texts: [query] });

    const { data, error } = await supabase.rpc('match_skill_examples', {
      p_agent_type: agentType,
      p_embedding: queryEmbedding,
      p_limit: limit,
    });

    if (!error && data && data.length > 0) {
      return data.map((row: Record<string, unknown>) => ({
        input_text: row.input_text as string,
        input_context: row.input_context,
        output_result: row.output_result,
        quality_score: (row.quality_score ?? row.similarity ?? 0) as number,
      }));
    }
  } catch (embeddingErr) {
    console.warn(
      '[skillEngine] Embedding search unavailable, falling back to text search:',
      embeddingErr instanceof Error ? embeddingErr.message : embeddingErr,
    );
  }

  // --- Attempt 2: text ilike fallback ----------------------------
  const searchPattern = `%${query.slice(0, 100)}%`;
  const { data, error } = await supabase
    .from('skill_examples')
    .select('input_text, input_context, output_result, quality_score')
    .eq('agent_type', agentType)
    .ilike('input_text', searchPattern)
    .order('quality_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[skillEngine] getSimilarExamples text fallback error:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    input_text: row.input_text as string,
    input_context: row.input_context as unknown,
    output_result: row.output_result as unknown,
    quality_score: (row.quality_score ?? 0) as number,
  }));
}

// ── Usage & feedback logging ───────────────────────────────────

/** Increment usage counters for a skill. */
export async function logSkillUsage(skillId: string, success: boolean): Promise<void> {
  // Atomically increment total_uses and conditionally successful_uses / rejected_uses
  if (success) {
    const { error } = await supabase.rpc('increment_skill_usage', {
      p_skill_id: skillId,
      p_success: true,
    });
    if (error) {
      // Fallback: manual update
      const { data: current } = await supabase
        .from('skill_registry')
        .select('total_uses, successful_uses')
        .eq('id', skillId)
        .single();

      if (current) {
        await supabase
          .from('skill_registry')
          .update({
            total_uses: current.total_uses + 1,
            successful_uses: current.successful_uses + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', skillId);
      }
    }
  } else {
    const { error } = await supabase.rpc('increment_skill_usage', {
      p_skill_id: skillId,
      p_success: false,
    });
    if (error) {
      const { data: current } = await supabase
        .from('skill_registry')
        .select('total_uses, rejected_uses')
        .eq('id', skillId)
        .single();

      if (current) {
        await supabase
          .from('skill_registry')
          .update({
            total_uses: current.total_uses + 1,
            rejected_uses: current.rejected_uses + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', skillId);
      }
    }
  }
}

/** Log user feedback (confirmation, correction, or rejection). */
export async function logFeedback(params: {
  skillId?: string;
  estimateId?: string;
  agentType: AgentType;
  action: 'confirmed' | 'corrected' | 'rejected';
  originalResult: unknown;
  correctedResult?: unknown;
  userComment?: string;
}): Promise<void> {
  const { error } = await supabase.from('skill_feedback').insert({
    skill_id: params.skillId ?? null,
    estimate_id: params.estimateId ?? null,
    agent_type: params.agentType,
    action: params.action,
    original_result: params.originalResult,
    corrected_result: params.correctedResult ?? null,
    user_comment: params.userComment ?? null,
  });

  if (error) {
    console.error('[skillEngine] logFeedback error:', error.message);
  }

  // Update skill usage counters
  if (params.skillId) {
    await logSkillUsage(params.skillId, params.action !== 'rejected');
  }

  // Check if we should auto-propose a rule
  await checkAutoProposal(params.agentType);
}

// ── Auto-proposal ──────────────────────────────────────────────

/**
 * Check if repeated confirmations warrant automatically proposing a new rule.
 *
 * Logic: query `skill_feedback` for this agent type, group by
 * `original_result` (as text). If any single result pattern has 5+ confirmed
 * entries and no existing rule already covers it, insert an `auto_proposed`
 * skill into `skill_registry` with `is_active = false` (awaiting approval).
 */
export async function checkAutoProposal(agentType: AgentType): Promise<void> {
  try {
    // Fetch recent confirmed feedback for this agent
    const { data: feedback, error: fbError } = await supabase
      .from('skill_feedback')
      .select('original_result')
      .eq('agent_type', agentType)
      .eq('action', 'confirmed');

    if (fbError || !feedback || feedback.length === 0) return;

    // Group by serialised original_result to find repeating patterns
    const counts = new Map<string, { count: number; sample: unknown }>();

    for (const row of feedback) {
      const key = JSON.stringify(row.original_result);
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { count: 1, sample: row.original_result });
      }
    }

    // Check each pattern with >= 5 confirmations
    for (const [key, { count, sample }] of counts) {
      if (count < 5) continue;

      // See if a rule for this exact result already exists
      const { data: existingSkills } = await supabase
        .from('skill_registry')
        .select('id')
        .eq('agent_type', agentType)
        .eq('skill_type', 'rule')
        .limit(1);

      // Simple heuristic: check if any existing rule produces the same result
      let alreadyCovered = false;
      if (existingSkills && existingSkills.length > 0) {
        const { data: fullSkills } = await supabase
          .from('skill_registry')
          .select('rule_config')
          .eq('agent_type', agentType)
          .eq('skill_type', 'rule')
          .eq('is_active', true);

        if (fullSkills) {
          for (const s of fullSkills) {
            const rc = s.rule_config as MatchingRule | null;
            if (rc && JSON.stringify(rc.result) === key) {
              alreadyCovered = true;
              break;
            }
          }
        }
      }

      if (alreadyCovered) continue;

      // Insert auto-proposed skill
      const { error: insertErr } = await supabase.from('skill_registry').insert({
        agent_type: agentType,
        skill_type: 'rule',
        name: `auto_${agentType}_${Date.now()}`,
        description: `Автоматически предложено на основе ${count} подтверждений`,
        version: 1,
        is_active: false,
        rule_config: {
          match: {},
          result: sample as Record<string, unknown>,
        },
        created_by: 'auto_proposed',
        total_uses: 0,
        successful_uses: 0,
        rejected_uses: 0,
      });

      if (insertErr) {
        console.error('[skillEngine] auto-proposal insert error:', insertErr.message);
      } else {
        console.info(
          `[skillEngine] Auto-proposed rule for ${agentType} (${count} confirmations)`,
        );
      }
    }
  } catch (err) {
    console.error(
      '[skillEngine] checkAutoProposal error:',
      err instanceof Error ? err.message : err,
    );
  }
}
