import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Button, Popconfirm, Typography, message, Divider, Collapse } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { useCustomRates, DEFAULT_CUSTOM_RATES_FILTERS } from '../../hooks/useCustomRates';
import { loadCategories, loadTypes } from '../../lib/importedRates';
import { batchCreateCustomRates, loadExistingSourceKeys } from '../../lib/customRates';
import type { RateCategory, RateType } from '../../lib/importedRates';
import {
  createRatesReducer,
  initialCreateRatesState,
  countValidRows,
} from './createRatesReducer';
import CustomRatesFilters from './CustomRatesFilters';
import CustomRatesTable from './CustomRatesTable';
import QuickSearchPanel from './QuickSearchPanel';
import LlmChatPanel from './LlmChatPanel';
import DraftBasketPanel from './DraftBasketPanel';
import CollapsiblePanel from './CollapsiblePanel';

export default function CustomRatesTab() {
  const [filters, setFilters] = useState(DEFAULT_CUSTOM_RATES_FILTERS);
  const [categories, setCategories] = useState<RateCategory[]>([]);
  const [types, setTypes] = useState<RateType[]>([]);
  const [msg, msgCtx] = message.useMessage();

  // Состояние корзины-черновика + поисковых режимов
  const [state, dispatch] = useReducer(createRatesReducer, initialCreateRatesState);
  const [saving, setSaving] = useState(false);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [savedSignal, setSavedSignal] = useState(0);

  const { rows, total, loading, error, deleteRate, afterBatchCreate } = useCustomRates(filters);

  const refreshCategories = useCallback(async () => {
    try {
      setCategories(await loadCategories());
    } catch (e: any) {
      msg.error(`Ошибка загрузки категорий: ${e.message ?? e}`);
    }
  }, [msg]);

  const refreshTypes = useCallback(
    async (catId: string | null) => {
      try {
        setTypes(await loadTypes(catId));
      } catch (e: any) {
        msg.error(`Ошибка загрузки видов затрат: ${e.message ?? e}`);
      }
    },
    [msg],
  );

  useEffect(() => {
    void refreshCategories();
    void refreshTypes(null);
  }, [refreshCategories, refreshTypes]);

  // Загружаем set уже существующих (source:source_id) для подсветки already_in_db
  useEffect(() => {
    let cancelled = false;
    loadExistingSourceKeys()
      .then((set) => {
        if (!cancelled) setExistingKeys(set);
      })
      .catch((e: any) => {
        console.error('[CustomRatesTab] loadExistingSourceKeys', e);
      });
    return () => {
      cancelled = true;
    };
  }, [savedSignal]);

  // При смене категории — перезагружаем виды затрат и сбрасываем typeId
  const handleCategoryChange = useCallback(
    async (categoryId: string | null) => {
      setFilters((prev) => ({ ...prev, categoryId, typeId: null, page: 1 }));
      await refreshTypes(categoryId);
    },
    [refreshTypes],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteRate(id);
        setSavedSignal((p) => p + 1);
        msg.success('Расценка удалена');
      } catch (e: any) {
        msg.error(`Ошибка удаления: ${e.message ?? e}`);
      }
    },
    [deleteRate, msg],
  );

  const validCount = useMemo(() => countValidRows(state.draftRows), [state.draftRows]);

  // ── Batch-сохранение всех валидных строк корзины ─────────────────
  const handleSaveAll = useCallback(async () => {
    if (state.draftRows.length === 0) return;

    const validRows = state.draftRows.filter(
      (r) => r.workName.trim() && r.typeId && r.categoryId,
    );

    if (validRows.length < state.draftRows.length) {
      msg.warning(
        `В корзине ${state.draftRows.length - validRows.length} строк с незаполненными полями. Заполните или удалите.`,
      );
      return;
    }

    setSaving(true);
    try {
      const result = await batchCreateCustomRates(validRows);
      dispatch({ type: 'APPLY_BATCH_RESULT', result });
      setSavedSignal((p) => p + 1);
      await afterBatchCreate();
      if (result.saved.length > 0) {
        msg.success(`Сохранено: ${result.saved.length}`);
      }
      if (result.duplicates.length > 0) {
        msg.warning(`Дубликаты (уже в каталоге): ${result.duplicates.length}`);
      }
      if (result.errors.length > 0) {
        msg.error(`Ошибок: ${result.errors.length}. См. строки в корзине.`);
      }
    } catch (e: any) {
      msg.error(`Ошибка batch-сохранения: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }, [state.draftRows, msg, afterBatchCreate]);

  const draftCount = state.draftRows.length;

  return (
    <div style={{ width: '100%' }}>
      {msgCtx}

      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          Новые расценки
        </Typography.Title>
        <Typography.Text type="secondary">
          Пользовательский справочник на базе ФСНБ, корпоративных расценок 1С и созданных вручную
        </Typography.Text>
      </div>

      {/* ── Рабочая зона: две секции поиска слева + корзина справа ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Левая колонка — быстрый поиск + умный поиск */}
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Секция 1: Быстрый поиск */}
          <CollapsiblePanel
            title="Быстрый поиск"
            subtitle="Нестрогий поиск по ФСНБ и 1С с настраиваемой чувствительностью"
            expandedHeight={560}
          >
            <QuickSearchPanel
              inDraftKeys={state.inDraftKeys}
              existingKeys={existingKeys}
              onAddToDraft={(c) => dispatch({ type: 'ADD_TO_DRAFT', candidate: c })}
            />
          </CollapsiblePanel>

          {/* Секция 2: Умный поиск (LLM-чат) */}
          <CollapsiblePanel
            title="Умный поиск (LLM)"
            subtitle="Опишите работы — агент подберёт набор расценок и может задавать уточнения"
            expandedHeight={680}
          >
            <LlmChatPanel
              inDraftKeys={state.inDraftKeys}
              existingKeys={existingKeys}
              onAddToDraft={(c) => dispatch({ type: 'ADD_TO_DRAFT', candidate: c })}
            />
          </CollapsiblePanel>
        </div>

        {/* Правая колонка — корзина-черновик */}
        <div
          style={{
            width: 680,
            flexShrink: 0,
            position: 'sticky',
            top: 16,
          }}
        >
          <CollapsiblePanel
            title={`Черновик (${state.draftRows.length})`}
            expandedHeight="calc(100vh - 180px)"
            extra={
              state.draftRows.length > 0 ? (
                <Popconfirm
                  title="Очистить корзину?"
                  description="Все несохранённые расценки будут потеряны."
                  okText="Очистить"
                  okButtonProps={{ danger: true }}
                  cancelText="Отмена"
                  onConfirm={() => dispatch({ type: 'CLEAR_DRAFT' })}
                >
                  <Button icon={<ClearOutlined />} type="text" size="small" />
                </Popconfirm>
              ) : undefined
            }
          >
            <DraftBasketPanel
              rows={state.draftRows}
              categories={categories}
              types={types}
              saving={saving}
              validCount={validCount}
              onUpdate={(rowId, patch) => dispatch({ type: 'UPDATE_DRAFT_ROW', rowId, patch })}
              onRemove={(rowId) => dispatch({ type: 'REMOVE_DRAFT_ROW', rowId })}
              onSaveAll={handleSaveAll}
            />
          </CollapsiblePanel>
        </div>
      </div>

      <Divider style={{ marginTop: 24, marginBottom: 16 }} />

      {/* ── Архив: таблица уже сохранённых расценок ── */}
      <Collapse
        defaultActiveKey={['saved']}
        items={[
          {
            key: 'saved',
            label: (
              <span>
                <Typography.Text strong>Сохранённые расценки в каталоге</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {total > 0 ? `всего: ${total}` : 'пока пусто'}
                </Typography.Text>
              </span>
            ),
            children: (
              <>
                <CustomRatesFilters
                  value={filters}
                  categories={categories}
                  types={types}
                  onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch, page: 1 }))}
                  onCategoryChange={handleCategoryChange}
                />
                <CustomRatesTable
                  rows={rows}
                  total={total}
                  loading={loading}
                  page={filters.page}
                  pageSize={filters.pageSize}
                  onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
                  onDelete={handleDelete}
                />
                {error && (
                  <Typography.Text type="danger" style={{ display: 'block', marginTop: 8 }}>
                    {error}
                  </Typography.Text>
                )}
              </>
            ),
          },
        ]}
      />

      {draftCount > 0 && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            В черновике {draftCount} расценок. Не забудьте нажать «Сохранить все в каталог» справа.
          </Typography.Text>
        </div>
      )}
    </div>
  );
}
