/**
 * Reducer для CreateRatesModal — управляет состоянием модалки создания расценок:
 *  - режим (быстрый поиск / LLM-чат)
 *  - корзина-черновик (DraftRow[])
 *  - локальная подсказка о добавленных в черновик ключах для подсветки карточек
 */

import type { DraftRow, Candidate, BatchCreateResult } from '../../types/customRates';

export type CreateRatesMode = 'search' | 'chat';

export interface CreateRatesState {
  mode: CreateRatesMode;
  draftRows: DraftRow[];
  /** Кеш ключей расценок, которые уже в корзине-черновике (для подсветки кандидатов) */
  inDraftKeys: Set<string>;
}

export const initialCreateRatesState: CreateRatesState = {
  mode: 'search',
  draftRows: [],
  inDraftKeys: new Set(),
};

export type CreateRatesAction =
  | { type: 'SET_MODE'; mode: CreateRatesMode }
  | { type: 'ADD_TO_DRAFT'; candidate: Candidate }
  | { type: 'UPDATE_DRAFT_ROW'; rowId: string; patch: Partial<DraftRow> }
  | { type: 'REMOVE_DRAFT_ROW'; rowId: string }
  | { type: 'CLEAR_DRAFT' }
  | { type: 'APPLY_BATCH_RESULT'; result: BatchCreateResult };

let rowIdCounter = 0;
function newRowId(): string {
  rowIdCounter += 1;
  return `draft-${Date.now()}-${rowIdCounter}`;
}

function candidateKey(candidate: Candidate): string {
  return candidate.key;
}

export function createRatesReducer(
  state: CreateRatesState,
  action: CreateRatesAction,
): CreateRatesState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'ADD_TO_DRAFT': {
      const c = action.candidate;
      const key = candidateKey(c);
      // Не добавляем дубликат в корзину
      if (state.inDraftKeys.has(key)) return state;

      const row: DraftRow = {
        rowId: newRowId(),
        source: c.source,
        sourceId: c.sourceId,
        sourceCode: c.code,
        workName: c.name,
        unit: c.unit,
        categoryId: c.suggestedCategoryId ?? null,
        typeId: c.suggestedTypeId ?? null,
        reasoning: c.reasoning,
        status: 'editing',
      };
      const nextKeys = new Set(state.inDraftKeys);
      nextKeys.add(key);
      return {
        ...state,
        draftRows: [...state.draftRows, row],
        inDraftKeys: nextKeys,
      };
    }

    case 'UPDATE_DRAFT_ROW': {
      return {
        ...state,
        draftRows: state.draftRows.map((r) =>
          r.rowId === action.rowId ? { ...r, ...action.patch } : r,
        ),
      };
    }

    case 'REMOVE_DRAFT_ROW': {
      const target = state.draftRows.find((r) => r.rowId === action.rowId);
      if (!target) return state;
      const nextKeys = new Set(state.inDraftKeys);
      const key = `${target.source}:${target.sourceId ?? `manual-${target.rowId}`}`;
      nextKeys.delete(key);
      return {
        ...state,
        draftRows: state.draftRows.filter((r) => r.rowId !== action.rowId),
        inDraftKeys: nextKeys,
      };
    }

    case 'CLEAR_DRAFT':
      return { ...state, draftRows: [], inDraftKeys: new Set() };

    case 'APPLY_BATCH_RESULT': {
      const savedIds = new Set(action.result.saved.map((s) => s.rowId));
      const dupIds = new Set(action.result.duplicates.map((d) => d.rowId));
      const errMap = new Map(action.result.errors.map((e) => [e.rowId, e.message]));

      const remaining: DraftRow[] = [];
      const remainingKeys = new Set<string>();
      for (const r of state.draftRows) {
        if (savedIds.has(r.rowId)) {
          // Удаляется из корзины
          continue;
        }
        if (dupIds.has(r.rowId)) {
          remaining.push({ ...r, status: 'duplicate', error: 'Уже в каталоге' });
        } else if (errMap.has(r.rowId)) {
          remaining.push({ ...r, status: 'error', error: errMap.get(r.rowId) });
        } else {
          remaining.push(r);
        }
        const key = `${r.source}:${r.sourceId ?? `manual-${r.rowId}`}`;
        remainingKeys.add(key);
      }
      return { ...state, draftRows: remaining, inDraftKeys: remainingKeys };
    }

    default:
      return state;
  }
}

/** Сколько строк ВАЛИДНО для сохранения */
export function countValidRows(rows: DraftRow[]): number {
  return rows.filter(
    (r) => r.workName.trim() && r.typeId && r.categoryId,
  ).length;
}
