import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import type { DbBomSummary } from '../types/database.ts';

export function useBom(docId: string) {
  const [bomLines, setBomLines] = useState<DbBomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('bom_summary')
        .select('*')
        .eq('doc_id', docId);

      if (queryError) {
        throw new Error(queryError.message);
      }

      setBomLines((data as DbBomSummary[]) ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load BOM';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (docId) {
      void refetch();
    }
  }, [docId, refetch]);

  return { bomLines, loading, error, refetch };
}
