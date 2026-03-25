/**
 * Хук для загрузки данных сметы (work items, rate matches, resource matches, lines, review queue).
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import type {
  DbEstimate,
  DbEstimateWorkItem,
  DbEstimateRateMatch,
  DbEstimateResourceMatch,
  DbEstimateLine,
  DbEstimateReviewItem,
} from '../types/estimate.ts';

interface EstimateData {
  estimate: DbEstimate | null;
  workItems: DbEstimateWorkItem[];
  rateMatches: DbEstimateRateMatch[];
  resourceMatches: DbEstimateResourceMatch[];
  lines: DbEstimateLine[];
  reviewQueue: DbEstimateReviewItem[];
}

export function useEstimateData(estimateId: string | null) {
  const [data, setData] = useState<EstimateData>({
    estimate: null,
    workItems: [],
    rateMatches: [],
    resourceMatches: [],
    lines: [],
    reviewQueue: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!estimateId) return;
    setLoading(true);
    setError(null);

    try {
      const [
        estRes,
        wiRes,
        rmRes,
        resmRes,
        lnRes,
        rqRes,
      ] = await Promise.all([
        supabase.from('estimates').select('*').eq('id', estimateId).single(),
        supabase.from('estimate_work_items').select('*').eq('estimate_id', estimateId).order('created_at'),
        supabase.from('estimate_rate_matches').select('*').eq('estimate_id', estimateId).order('created_at'),
        supabase.from('estimate_resource_matches').select('*').eq('estimate_id', estimateId).order('created_at'),
        supabase.from('estimate_lines').select('*').eq('estimate_id', estimateId).order('sort_order'),
        supabase.from('estimate_review_queue').select('*').eq('estimate_id', estimateId).order('severity').order('created_at'),
      ]);

      if (estRes.error) throw estRes.error;

      setData({
        estimate: estRes.data,
        workItems: wiRes.data || [],
        rateMatches: rmRes.data || [],
        resourceMatches: resmRes.data || [],
        lines: lnRes.data || [],
        reviewQueue: rqRes.data || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки сметы');
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, error, refetch: load };
}

/**
 * Загрузка списка смет для документа.
 */
export function useEstimatesList(docId: string) {
  const [estimates, setEstimates] = useState<DbEstimate[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('estimates')
      .select('*')
      .eq('doc_id', docId)
      .order('created_at', { ascending: false });
    setEstimates(data || []);
    setLoading(false);
  }, [docId]);

  useEffect(() => {
    load();
  }, [load]);

  return { estimates, loading, refetch: load };
}
