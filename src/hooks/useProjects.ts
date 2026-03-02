import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import type { DbProject } from '../types/database.ts';

export function useProjects() {
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('name');
    setProjects((data as DbProject[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const createProject = useCallback(async (values: { name: string; code?: string; description?: string }) => {
    const { error } = await supabase.from('projects').insert({
      name: values.name,
      code: values.code || null,
      description: values.description || null,
    });
    if (error) throw new Error(error.message);
    await refetch();
  }, [refetch]);

  const updateProject = useCallback(async (id: string, values: { name?: string; code?: string; description?: string }) => {
    const { error } = await supabase
      .from('projects')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await refetch();
  }, [refetch]);

  const deleteProject = useCallback(async (id: string) => {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id);
    if (count && count > 0) {
      throw new Error('Нельзя удалить — есть привязанные документы');
    }
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await refetch();
  }, [refetch]);

  return { projects, loading, createProject, updateProject, deleteProject, refetch };
}
