import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.ts';
import type { DbProductFact } from '../types/database.ts';

export function useProducts(docId: string) {
  const [products, setProducts] = useState<DbProductFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;

    setLoading(true);
    setError(null);

    supabase
      .from('product_facts')
      .select('*')
      .eq('doc_id', docId)
      .order('assembly_mark', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else {
          setProducts((data ?? []) as DbProductFact[]);
        }
        setLoading(false);
      });
  }, [docId]);

  const refetch = () => {
    if (!docId) return;
    setLoading(true);
    supabase
      .from('product_facts')
      .select('*')
      .eq('doc_id', docId)
      .order('assembly_mark', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setProducts((data ?? []) as DbProductFact[]);
        setLoading(false);
      });
  };

  return { products, loading, error, refetch };
}
