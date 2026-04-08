import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { getRateContextSnapshot } from '../lib/rateContextCache';
import type {
  Candidate,
  FuzzySettings,
  RateContextSnapshot,
} from '../types/customRates';

/**
 * Объединённая запись для индекса Fuse: либо ФСНБ-норма, либо корпоративная (1С).
 */
interface IndexedItem {
  source: 'fsnb' | 'imported';
  id: string;
  name: string;
  code: string;
  unit: string;
  // Для построения candidate
  collection_code?: string | null;
  division_code?: string | null;
  table_code?: string | null;
  type_id?: string;
  category_id?: string;
}

/**
 * Хук, который загружает rateContextCache и строит над ним Fuse.js индекс.
 * Возвращает функцию search(query), которая запускается ТОЛЬКО по явному вызову
 * (не на каждый ререндер).
 */
export function useFuseSearch(settings: FuzzySettings) {
  const [snapshot, setSnapshot] = useState<RateContextSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Загружаем кэш один раз
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRateContextSnapshot()
      .then((snap) => {
        if (!cancelled) setSnapshot(snap);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Объединённый массив для индекса. Пересчитывается при изменении snapshot.
  const items = useMemo<IndexedItem[]>(() => {
    if (!snapshot) return [];
    const acc: IndexedItem[] = [];
    for (const n of snapshot.fsnbNorms) {
      acc.push({
        source: 'fsnb',
        id: n.id,
        name: n.name,
        code: n.norm_code,
        unit: n.unit,
        collection_code: n.collection_code,
        division_code: n.division_code,
        table_code: n.table_code,
      });
    }
    for (const r of snapshot.importedRates) {
      acc.push({
        source: 'imported',
        id: r.id,
        name: r.work_name,
        code: '',
        unit: r.unit ?? '',
        type_id: r.type_id,
        category_id: r.category_id,
      });
    }
    return acc;
  }, [snapshot]);

  // Fuse-индекс. Пересоздаётся при изменении settings (важно для weights).
  const fuse = useMemo(() => {
    if (items.length === 0) return null;
    return new Fuse(items, {
      keys: [
        { name: 'name', weight: settings.weightName },
        { name: 'code', weight: settings.weightCode },
        { name: 'unit', weight: settings.weightUnit },
      ],
      threshold: settings.threshold,
      distance: settings.distance,
      minMatchCharLength: settings.minMatchCharLength,
      ignoreLocation: settings.ignoreLocation,
      includeScore: true,
      includeMatches: true,
    });
  }, [
    items,
    settings.weightName,
    settings.weightCode,
    settings.weightUnit,
    settings.threshold,
    settings.distance,
    settings.minMatchCharLength,
    settings.ignoreLocation,
  ]);

  /**
   * Выполнить поиск. Возвращает массив Candidate, готовый к рендеру в карточках.
   */
  function search(query: string, limit: number = 50): Candidate[] {
    if (!fuse || !query.trim()) return [];
    const results = fuse.search(query.trim(), { limit });
    return results.map((r): Candidate => {
      const it = r.item;
      return {
        key: `${it.source}:${it.id}`,
        source: it.source,
        sourceId: it.id,
        code: it.code || null,
        name: it.name,
        unit: it.unit,
        score: r.score,
      };
    });
  }

  return {
    snapshot,
    loading,
    error,
    indexSize: items.length,
    search,
  };
}
