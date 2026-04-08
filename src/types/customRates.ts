/**
 * Типы для функционала «Новые расценки» — пользовательский справочник расценок
 * (вкладка corp на странице /prices).
 *
 * Источники расценок: ФСНБ (норма is_selected=true), 1С (старая корпоративная
 * imported_rate), Вручную (создана пользователем без источника).
 */

// ── Источник ────────────────────────────────────────────────────

export type RateSourceKind = 'fsnb' | 'imported' | 'custom';

/** Человеко-читаемый ярлык источника для UI-тегов */
export const RATE_SOURCE_LABEL: Record<RateSourceKind, string> = {
  fsnb: 'ФСНБ',
  imported: '1С',
  custom: 'Вручную',
};

/** Цвет antd-тега источника */
export const RATE_SOURCE_COLOR: Record<RateSourceKind, string> = {
  fsnb: 'blue',
  imported: 'purple',
  custom: 'green',
};

// ── Запись в БД ─────────────────────────────────────────────────

export interface CustomRate {
  id: string;
  type_id: string;
  work_name: string;
  unit: string | null;
  source_kind: RateSourceKind;
  source_id: string | null;
  source_code: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

/** Расширенная запись с раскрытыми категорией и видом затрат для UI-таблицы */
export interface CustomRateRow extends CustomRate {
  type_name: string;
  category_id: string;
  category_name: string;
}

// ── Кэш в памяти браузера ───────────────────────────────────────

/**
 * Минимальное представление нормы ФСНБ для локального fuzzy-поиска и
 * стартового контекста LLM. Загружается только для is_selected=true.
 */
export interface CachedFsnbNorm {
  id: string;
  norm_code: string;
  name: string;
  unit: string;
  collection_code: string | null;
  collection_name: string | null;
  division_code: string | null;
  division_name: string | null;
  table_code: string | null;
  table_name: string | null;
}

/** Старая корпоративная расценка (1С) с раскрытой категорией/видом */
export interface CachedImportedRate {
  id: string;
  work_name: string;
  unit: string | null;
  type_id: string;
  type_name: string;
  category_id: string;
  category_name: string;
}

/** Категория общего справочника (используется и для imported, и для custom) */
export interface RateCategoryRef {
  id: string;
  name: string;
}

/** Вид затрат общего справочника */
export interface RateTypeRef {
  id: string;
  name: string;
  category_id: string;
}

/**
 * Единый снимок данных, используемый одновременно:
 *  - Fuse.js (Поле A быстрого поиска)
 *  - Стартовый контекст LLM (Поле B чат)
 *  - Tools агента (list_fsnb_norms_in_table, search_fsnb_fallback)
 */
export interface RateContextSnapshot {
  fsnbNorms: CachedFsnbNorm[];
  importedRates: CachedImportedRate[];
  customRates: CustomRate[];
  categories: RateCategoryRef[];
  types: RateTypeRef[];
  loadedAt: number;
}

// ── Кандидат и корзина-черновик ─────────────────────────────────

/**
 * Кандидат, который может быть добавлен в корзину-черновик.
 * Возвращается из быстрого поиска (Fuse.js) или из LLM (propose_rate_set).
 */
export interface Candidate {
  /** Стабильный ключ для React (`${source}:${sourceId ?? name}`) */
  key: string;
  source: RateSourceKind;
  /** UUID исходной записи (norm.id или imported.id). Для custom — null. */
  sourceId: string | null;
  /** Код норы ФСНБ (например "ГЭСН 15-01-047-04") или null */
  code: string | null;
  /** Наименование работы */
  name: string;
  /** Единица измерения */
  unit: string;
  /** Score от Fuse.js (для поиска) — 0..1, меньше = ближе */
  score?: number;
  /** Confidence от LLM (для propose_rate_set) — 0..1, больше = увереннее */
  confidence?: number;
  /** Обоснование от LLM */
  reasoning?: string;
  /** Предложенная LLM категория (для предзаполнения) */
  suggestedCategoryId?: string | null;
  /** Предложенный LLM вид затрат (для предзаполнения) */
  suggestedTypeId?: string | null;
}

/** Состояние карточки-кандидата в основной зоне модалки */
export type CandidateStatus = 'idle' | 'in_draft' | 'already_in_db';

/** Строка корзины-черновика — редактируемая запись перед сохранением в БД */
export interface DraftRow {
  /** Локальный uuid строки (не имеет отношения к БД) */
  rowId: string;
  source: RateSourceKind;
  sourceId: string | null;
  sourceCode: string | null;
  workName: string;
  unit: string;
  categoryId: string | null;
  typeId: string | null;
  reasoning?: string;
  /** Состояние строки после batch INSERT */
  status: 'editing' | 'saved' | 'duplicate' | 'error';
  /** Сообщение ошибки при сохранении */
  error?: string;
}

// ── Чат с LLM ───────────────────────────────────────────────────

/** Один tool-вызов в истории сообщений ассистента (для отображения чипа) */
export interface ChatToolCall {
  id: string;
  name: string;
  args?: unknown;
  status: 'running' | 'done' | 'error';
}

/**
 * Сообщение в ленте чата RateRecommender. UI-сообщения,
 * не путать с LlmMessage (отправляется в API).
 */
export type ChatMessage =
  | { kind: 'user'; id: string; text: string; timestamp: number }
  | { kind: 'assistant_text'; id: string; text: string; timestamp: number }
  | {
      kind: 'assistant_tool';
      id: string;
      tools: ChatToolCall[];
      timestamp: number;
    }
  | {
      kind: 'assistant_proposal';
      id: string;
      summary: string;
      candidates: Candidate[];
      timestamp: number;
    };

// ── Формат propose_rate_set от LLM ──────────────────────────────

export interface ProposeRateSetItem {
  source: RateSourceKind;
  source_id: string | null;
  code: string | null;
  name: string;
  unit: string;
  suggested_category_id: string;
  suggested_type_id: string;
  reasoning: string;
  confidence: number;
}

export interface ProposeRateSetPayload {
  rates: ProposeRateSetItem[];
  summary: string;
}

// ── Настройки Fuse.js ───────────────────────────────────────────

export interface FuzzySettings {
  threshold: number;
  distance: number;
  minMatchCharLength: number;
  ignoreLocation: boolean;
  weightName: number;
  weightCode: number;
  weightUnit: number;
}

export const DEFAULT_FUZZY_SETTINGS: FuzzySettings = {
  threshold: 0.4,
  distance: 100,
  minMatchCharLength: 3,
  ignoreLocation: true,
  weightName: 1.0,
  weightCode: 0.5,
  weightUnit: 0.2,
};

export const FUZZY_SETTINGS_LS_KEY = 'docuspec.customRates.fuzzySettings';

// ── Результат batchCreate ───────────────────────────────────────

export interface BatchCreateResult {
  saved: Array<{ rowId: string; id: string }>;
  duplicates: Array<{ rowId: string }>;
  errors: Array<{ rowId: string; message: string }>;
}
