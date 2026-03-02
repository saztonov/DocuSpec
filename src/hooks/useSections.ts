import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import type { DbSection } from '../types/database.ts';

export function useSections() {
  const [sections, setSections] = useState<DbSection[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sections')
      .select('*')
      .order('sort_order');
    setSections((data as DbSection[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const createSection = useCallback(async (values: { code: string; name: string; sort_order?: number }) => {
    const { error } = await supabase.from('sections').insert({
      code: values.code,
      name: values.name,
      sort_order: values.sort_order ?? 0,
    });
    if (error) throw new Error(error.message);
    await refetch();
  }, [refetch]);

  const updateSection = useCallback(async (id: string, values: { code?: string; name?: string; sort_order?: number }) => {
    const { error } = await supabase
      .from('sections')
      .update(values)
      .eq('id', id);
    if (error) throw new Error(error.message);
    await refetch();
  }, [refetch]);

  const deleteSection = useCallback(async (id: string) => {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', id);
    if (count && count > 0) {
      throw new Error('Нельзя удалить — есть привязанные документы');
    }
    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await refetch();
  }, [refetch]);

  return { sections, loading, createSection, updateSection, deleteSection, refetch };
}
