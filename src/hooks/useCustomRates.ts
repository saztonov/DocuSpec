import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadCustomRates,
  deleteCustomRate as deleteRateApi,
  loadExistingSourceKeys,
} from '../lib/customRates';
import {
  invalidateRateContextCache,
  refreshCustomRatesInCache,
} from '../lib/rateContextCache';
import type { CustomRateRow, RateSourceKind } from '../types/customRates';

export interface CustomRatesFilters {
  categoryId: string | null;
  typeId: string | null;
  sourceKind: RateSourceKind | null;
  search: string;
  page: number;
  pageSize: number;
}

export const DEFAULT_CUSTOM_RATES_FILTERS: CustomRatesFilters = {
  categoryId: null,
  typeId: null,
  sourceKind: null,
  search: '',
  page: 1,
  pageSize: 20,
};

export function useCustomRates(filters: CustomRatesFilters) {
  const [rows, setRows] = useState<CustomRateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Чтобы не делать запрос на каждый ререндер из-за нового объекта filters
  const filtersKey = useMemo(
    () =>
      `${filters.categoryId ?? ''}|${filters.typeId ?? ''}|${filters.sourceKind ?? ''}|${filters.search}|${filters.page}|${filters.pageSize}`,
    [filters],
  );
  const lastFiltersRef = useRef(filtersKey);
  lastFiltersRef.current = filtersKey;

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadCustomRates({
        categoryId: filters.categoryId,
        typeId: filters.typeId,
        sourceKind: filters.sourceKind,
        search: filters.search,
        limit: filters.pageSize,
        offset: (filters.page - 1) * filters.pageSize,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [
    filters.categoryId,
    filters.typeId,
    filters.sourceKind,
    filters.search,
    filters.page,
    filters.pageSize,
  ]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const deleteRate = useCallback(
    async (id: string) => {
      await deleteRateApi(id);
      // После удаления — сбрасываем кэш и обновляем таблицу
      invalidateRateContextCache();
      await refetch();
    },
    [refetch],
  );

  /**
   * Вызывается после успешного batch INSERT из корзины-черновика.
   * Обновляет данные в кэше (без сетевого запроса) и перечитывает таблицу.
   */
  const afterBatchCreate = useCallback(async () => {
    await refreshCustomRatesInCache();
    await refetch();
  }, [refetch]);

  return {
    rows,
    total,
    loading,
    error,
    refetch,
    deleteRate,
    afterBatchCreate,
  };
}

/** Хук для получения множества (source_kind:source_id) уже сохранённых записей. */
export function useExistingSourceKeys(refreshKey: number = 0) {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadExistingSourceKeys()
      .then((set) => {
        if (!cancelled) setKeys(set);
      })
      .catch((e) => {
        console.error('[useExistingSourceKeys]', e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { keys, loading };
}
