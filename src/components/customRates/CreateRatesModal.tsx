import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Modal, message } from 'antd';
import {
  createRatesReducer,
  initialCreateRatesState,
  countValidRows,
} from './createRatesReducer';
import CreateRatesHeader from './CreateRatesHeader';
import CreateRatesModeSwitch from './CreateRatesModeSwitch';
import QuickSearchPanel from './QuickSearchPanel';
import LlmChatPanel from './LlmChatPanel';
import DraftBasketPanel from './DraftBasketPanel';
import { batchCreateCustomRates } from '../../lib/customRates';
import { loadExistingSourceKeys } from '../../lib/customRates';
import type { RateCategory, RateType } from '../../lib/importedRates';

interface Props {
  open: boolean;
  /** Колбэк закрытия модалки. savedCount — сколько расценок реально сохранено в БД за сессию. */
  onClose: (savedCount: number) => void;
  categories: RateCategory[];
  types: RateType[];
}

export default function CreateRatesModal({ open, onClose, categories, types }: Props) {
  const [state, dispatch] = useReducer(createRatesReducer, initialCreateRatesState);
  const [savedCountTotal, setSavedCountTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [msg, msgCtx] = message.useMessage();

  // Загружаем set уже существующих (source:source_id) для подсветки already_in_db
  useEffect(() => {
    let cancelled = false;
    loadExistingSourceKeys()
      .then((set) => {
        if (!cancelled) setExistingKeys(set);
      })
      .catch((e: any) => {
        console.error('[CreateRatesModal] loadExistingSourceKeys', e);
      });
    return () => {
      cancelled = true;
    };
  }, [savedCountTotal]); // обновляем после каждого batch save

  const validCount = useMemo(() => countValidRows(state.draftRows), [state.draftRows]);
  const draftCount = state.draftRows.length;

  // ── Сохранение всех валидных строк batch-ом ─────────────────
  const handleSaveAll = useCallback(async () => {
    if (state.draftRows.length === 0) return;

    // Фильтруем валидные
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
      setSavedCountTotal((prev) => prev + result.saved.length);
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
  }, [state.draftRows, msg]);

  // ── Закрытие модалки с непустой корзиной ───────────────────
  const handleClose = useCallback(() => {
    if (state.draftRows.length === 0) {
      onClose(savedCountTotal);
      return;
    }
    Modal.confirm({
      title: `В черновике ${state.draftRows.length} несохранённых расценок`,
      content: 'Что сделать перед закрытием?',
      okText: 'Сохранить и закрыть',
      cancelText: 'Отмена',
      okButtonProps: { type: 'primary' },
      onOk: async () => {
        await handleSaveAll();
        onClose(savedCountTotal);
      },
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <span style={{ marginLeft: 8 }}>
            <button
              type="button"
              onClick={() => {
                Modal.destroyAll();
                onClose(savedCountTotal);
              }}
              style={{
                padding: '4px 15px',
                background: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Закрыть без сохранения
            </button>
          </span>
          <span style={{ marginLeft: 8 }}>
            <OkBtn />
          </span>
        </>
      ),
    });
  }, [state.draftRows.length, savedCountTotal, handleSaveAll, onClose]);

  return (
    <Modal
      open={open}
      width={1500}
      centered
      destroyOnHidden
      maskClosable={false}
      onCancel={handleClose}
      footer={null}
      styles={{
        body: {
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        },
      }}
      title={null}
      closable={false}
    >
      {msgCtx}

      <CreateRatesHeader
        draftCount={draftCount}
        savedCount={savedCountTotal}
        onClose={handleClose}
        onClearDraft={() => dispatch({ type: 'CLEAR_DRAFT' })}
      />

      <CreateRatesModeSwitch
        mode={state.mode}
        onChange={(mode) => dispatch({ type: 'SET_MODE', mode })}
        draftCount={draftCount}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Левая колонка — поиск или чат */}
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            borderRight: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {state.mode === 'search' ? (
            <QuickSearchPanel
              inDraftKeys={state.inDraftKeys}
              existingKeys={existingKeys}
              onAddToDraft={(c) => dispatch({ type: 'ADD_TO_DRAFT', candidate: c })}
            />
          ) : (
            <LlmChatPanel
              inDraftKeys={state.inDraftKeys}
              existingKeys={existingKeys}
              onAddToDraft={(c) => dispatch({ type: 'ADD_TO_DRAFT', candidate: c })}
            />
          )}
        </div>

        {/* Правая колонка — корзина-черновик */}
        <div
          style={{
            width: 480,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: '#fafafa',
          }}
        >
          <DraftBasketPanel
            rows={state.draftRows}
            categories={categories}
            types={types}
            saving={saving}
            validCount={validCount}
            onUpdate={(rowId, patch) => dispatch({ type: 'UPDATE_DRAFT_ROW', rowId, patch })}
            onRemove={(rowId) => dispatch({ type: 'REMOVE_DRAFT_ROW', rowId })}
            onClear={() => dispatch({ type: 'CLEAR_DRAFT' })}
            onSaveAll={handleSaveAll}
          />
        </div>
      </div>
    </Modal>
  );
}
