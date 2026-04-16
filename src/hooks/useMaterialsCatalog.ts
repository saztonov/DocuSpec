import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Fuse from 'fuse.js';
import {
  buildMaterialFuse,
  loadMaterials,
  type MaterialRow,
} from '../lib/materials';

export interface MaterialsCatalog {
  materials: MaterialRow[];
  loading: boolean;
  error: string | null;
  fuse: Fuse<MaterialRow>;
  refresh: () => Promise<void>;
  addLocal: (m: MaterialRow) => void;
  searchByName: (query: string, limit?: number) => MaterialRow[];
}

export function useMaterialsCatalog(): MaterialsCatalog {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fuseRef = useRef<Fuse<MaterialRow>>(buildMaterialFuse([]));

  const rebuild = useCallback((items: MaterialRow[]) => {
    fuseRef.current = buildMaterialFuse(items);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadMaterials();
      setMaterials(data);
      rebuild(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rebuild]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addLocal = useCallback(
    (m: MaterialRow) => {
      setMaterials((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        const next = [...prev, m].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        rebuild(next);
        return next;
      });
    },
    [rebuild],
  );

  const searchByName = useCallback((query: string, limit = 12): MaterialRow[] => {
    const q = query.trim();
    if (!q) return [];
    const results = fuseRef.current.search(q, { limit });
    return results.map((r) => r.item);
  }, []);

  const api = useMemo<MaterialsCatalog>(
    () => ({
      materials,
      loading,
      error,
      fuse: fuseRef.current,
      refresh,
      addLocal,
      searchByName,
    }),
    [materials, loading, error, refresh, addLocal, searchByName],
  );

  return api;
}
