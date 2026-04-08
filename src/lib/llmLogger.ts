/**
 * llmLogger — единая точка сбора логов запросов/ответов к OpenRouter.
 *
 * Хранит последние записи в localStorage (ring buffer) и дублирует их в консоль
 * через console.groupCollapsed. В dev-режиме публикует window.__llmLogs для
 * быстрого доступа из DevTools.
 *
 * Никаких зависимостей — работает как side-effect модуль.
 */

const STORAGE_KEY = 'docuspec_llm_logs';
const MAX_ENTRIES = 50;
const MAX_STORAGE_BYTES = 4 * 1024 * 1024; // ~4 MB

export type LlmCallKind = 'tools' | 'json' | 'embeddings';
export type LlmLogPhase = 'request' | 'response' | 'error';

export interface LlmLogEntry {
  /** Уникальный идентификатор пары request/response/error. */
  id: string;
  /** Порядковый номер пары (для читаемости в консоли). */
  pairNum: number;
  timestamp: number;
  kind: LlmCallKind;
  phase: LlmLogPhase;
  model?: string;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: {
    message: string;
    status?: number;
    rawData?: unknown;
  };
}

let idCounter = 0;
let pairCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `llm-${Date.now()}-${idCounter}`;
}

function nextPairNum(): number {
  pairCounter += 1;
  return pairCounter;
}

// ── Хранилище ───────────────────────────────────────────────────

function readAll(): LlmLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: LlmLogEntry[]): void {
  try {
    let trimmed = entries.slice(-MAX_ENTRIES);
    let serialized = JSON.stringify(trimmed);
    // Если суммарный размер слишком велик — срезаем старые, пока не влезет.
    while (serialized.length > MAX_STORAGE_BYTES && trimmed.length > 1) {
      trimmed = trimmed.slice(Math.ceil(trimmed.length / 4));
      serialized = JSON.stringify(trimmed);
    }
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e) {
    // localStorage может быть заполнен или недоступен — это не критично.
    console.warn('[llmLogger] Не удалось сохранить лог в localStorage', e);
  }
}

function appendEntry(entry: LlmLogEntry): void {
  const all = readAll();
  all.push(entry);
  writeAll(all);
}

// ── Консольный вывод ────────────────────────────────────────────

function logToConsole(entry: LlmLogEntry): void {
  const label = `[LLM ${entry.kind}] ${entry.phase} #${entry.pairNum}${entry.model ? ' · ' + entry.model : ''}${entry.durationMs != null ? ' · ' + entry.durationMs + 'ms' : ''}`;
  if (entry.phase === 'error') {
    // Ошибки раскрываем сразу, чтобы были видны.
    console.group(`%c${label}`, 'color:#d4380d;font-weight:bold');
    console.error(entry.error?.message);
    if (entry.error?.status != null) console.log('status:', entry.error.status);
    if (entry.error?.rawData !== undefined) console.log('rawData:', entry.error.rawData);
    if (entry.request !== undefined) console.log('request:', entry.request);
    console.groupEnd();
  } else if (entry.phase === 'request') {
    console.groupCollapsed(`%c${label}`, 'color:#1677ff');
    console.log('request:', entry.request);
    console.groupEnd();
  } else {
    console.groupCollapsed(`%c${label}`, 'color:#52c41a');
    console.log('response:', entry.response);
    console.groupEnd();
  }
}

// ── Публичный API ───────────────────────────────────────────────

export interface LogRequestArgs {
  kind: LlmCallKind;
  model: string;
  request: unknown;
}

export interface LogResponseArgs {
  id: string;
  pairNum: number;
  kind: LlmCallKind;
  model: string;
  durationMs: number;
  response: unknown;
}

export interface LogErrorArgs {
  id: string;
  pairNum: number;
  kind: LlmCallKind;
  model: string;
  durationMs?: number;
  error: Error | unknown;
  status?: number;
  rawData?: unknown;
  request?: unknown;
}

/** Логирует запрос. Возвращает { id, pairNum } — передать в logLlmResponse/logLlmError. */
export function logLlmRequest(args: LogRequestArgs): { id: string; pairNum: number } {
  const id = nextId();
  const pairNum = nextPairNum();
  const entry: LlmLogEntry = {
    id,
    pairNum,
    timestamp: Date.now(),
    kind: args.kind,
    phase: 'request',
    model: args.model,
    request: args.request,
  };
  appendEntry(entry);
  logToConsole(entry);
  return { id, pairNum };
}

export function logLlmResponse(args: LogResponseArgs): void {
  const entry: LlmLogEntry = {
    id: args.id + '-resp',
    pairNum: args.pairNum,
    timestamp: Date.now(),
    kind: args.kind,
    phase: 'response',
    model: args.model,
    durationMs: args.durationMs,
    response: args.response,
  };
  appendEntry(entry);
  logToConsole(entry);
}

export function logLlmError(args: LogErrorArgs): void {
  const message = args.error instanceof Error ? args.error.message : String(args.error);
  const entry: LlmLogEntry = {
    id: args.id + '-err',
    pairNum: args.pairNum,
    timestamp: Date.now(),
    kind: args.kind,
    phase: 'error',
    model: args.model,
    durationMs: args.durationMs,
    request: args.request,
    error: {
      message,
      status: args.status,
      rawData: args.rawData,
    },
  };
  appendEntry(entry);
  logToConsole(entry);
}

export function getLlmLogs(): LlmLogEntry[] {
  return readAll();
}

export function clearLlmLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function exportLlmLogsAsJson(): string {
  return JSON.stringify(readAll(), null, 2);
}

export function downloadLlmLogs(): void {
  const json = exportLlmLogsAsJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `llm_logs_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── DevTools доступ ─────────────────────────────────────────────

declare global {
  interface Window {
    __llmLogs?: {
      get: () => LlmLogEntry[];
      clear: () => void;
      export: () => string;
      download: () => void;
    };
  }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__llmLogs = {
    get: getLlmLogs,
    clear: clearLlmLogs,
    export: exportLlmLogsAsJson,
    download: downloadLlmLogs,
  };
}
