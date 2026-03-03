import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import type { DbLlmPrompt } from '../types/database.ts';

export function usePrompts() {
  const [prompts, setPrompts] = useState<DbLlmPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('llm_prompts')
      .select('*')
      .order('key');
    setPrompts((data as DbLlmPrompt[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const updatePrompt = useCallback(async (
    id: string,
    updates: { name?: string; description?: string; system_prompt?: string },
  ) => {
    const { error } = await supabase
      .from('llm_prompts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) await refetch();
    return { error };
  }, [refetch]);

  const resetPrompt = useCallback(async (id: string) => {
    const prompt = prompts.find(p => p.id === id);
    if (!prompt?.default_system_prompt) return { error: new Error('No default prompt') };

    const { error } = await supabase
      .from('llm_prompts')
      .update({ system_prompt: prompt.default_system_prompt, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) await refetch();
    return { error };
  }, [prompts, refetch]);

  /**
   * Load active prompts as a map: key → system_prompt string.
   * Used by useExtraction to get current prompts from DB.
   */
  const loadPromptsMap = useCallback(async (): Promise<Map<string, string>> => {
    const { data } = await supabase
      .from('llm_prompts')
      .select('key, system_prompt')
      .eq('is_active', true);

    const map = new Map<string, string>();
    for (const row of (data ?? []) as { key: string; system_prompt: string }[]) {
      map.set(row.key, row.system_prompt);
    }
    return map;
  }, []);

  return { prompts, loading, refetch, updatePrompt, resetPrompt, loadPromptsMap };
}
