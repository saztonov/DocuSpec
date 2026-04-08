/**
 * OpenRouter LLM client — calls directly from the browser.
 * Supports: JSON responses, tool_use (ReAct agents), embeddings.
 *
 * All API calls go through enqueueLlm() for centralized rate limiting,
 * concurrency control, and retry with exponential backoff.
 */

import { enqueueLlm, HttpError } from './requestQueue.ts';
import { logLlmRequest, logLlmResponse, logLlmError } from './llmLogger.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

function getApiKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  if (!key) throw new Error('Missing VITE_OPENROUTER_API_KEY in environment');
  return key;
}

function getModel(): string {
  return (import.meta.env.VITE_OPENROUTER_MODEL as string) || 'anthropic/claude-sonnet-4';
}

function getEmbeddingModel(): string {
  return (import.meta.env.VITE_EMBEDDING_MODEL as string) || 'openai/text-embedding-3-small';
}

/**
 * Если errorText похож на JSON OpenRouter — пытается извлечь подробности
 * через describeOpenRouterError; иначе возвращает исходную строку.
 */
function enrichErrorText(errorText: string): string {
  const trimmed = errorText.trim();
  if (!trimmed.startsWith('{')) return errorText;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return describeOpenRouterError(parsed);
    }
  } catch {
    /* not JSON, fallthrough */
  }
  return errorText;
}

/**
 * Достаёт максимально подробный текст ошибки из ответа OpenRouter.
 * Часть провайдеров кладёт реальную причину в data.error.metadata.raw,
 * имя провайдера — в metadata.provider_name.
 */
function describeOpenRouterError(data: unknown): string {
  if (!data || typeof data !== 'object') return '(empty body)';
  const root = data as Record<string, unknown>;
  const err = root.error;
  if (!err || typeof err !== 'object') {
    const keys = Object.keys(root).join(', ') || '(empty)';
    return `top-level keys: ${keys}`;
  }
  const errObj = err as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof errObj.message === 'string') parts.push(errObj.message);
  if (typeof errObj.code === 'number' || typeof errObj.code === 'string') {
    parts.push(`code=${errObj.code}`);
  }
  const meta = errObj.metadata;
  if (meta && typeof meta === 'object') {
    const metaObj = meta as Record<string, unknown>;
    if (typeof metaObj.provider_name === 'string') {
      parts.push(`provider=${metaObj.provider_name}`);
    }
    if (typeof metaObj.raw === 'string' && metaObj.raw.trim()) {
      parts.push(`raw=${metaObj.raw.slice(0, 500)}`);
    } else if (metaObj.raw !== undefined) {
      try {
        parts.push(`raw=${JSON.stringify(metaObj.raw).slice(0, 500)}`);
      } catch {
        /* ignore */
      }
    }
    if (Array.isArray(metaObj.reasons) && metaObj.reasons.length > 0) {
      parts.push(`reasons=${metaObj.reasons.join('; ')}`);
    }
  }
  return parts.length > 0 ? parts.join(' | ') : JSON.stringify(errObj).slice(0, 500);
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

/**
 * Формирует user-сообщение с изображением (по URL) и текстом.
 */
export function buildImageMessage(imageUrl: string, textPrompt: string): LlmMessage {
  return {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text: textPrompt },
    ],
  };
}

export interface LlmOptions {
  messages: LlmMessage[];
  temperature?: number;
  timeoutMs?: number;
  model?: string;
}

export interface LlmJsonResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  durationMs: number;
  hasImage: boolean;
}

/**
 * Call OpenRouter with response_format: json_object.
 * Returns the raw JSON string from the model.
 * Rate limiting and retries handled by enqueueLlm().
 */
export async function callLlmJson(options: LlmOptions): Promise<LlmJsonResponse> {
  const { messages, temperature = 0.1, timeoutMs = 60000, model } = options;
  const effectiveModel = model || getModel();

  const hasImage = messages.some(
    m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'),
  );
  const callStart = Date.now();

  const requestBody = {
    model: effectiveModel,
    messages,
    temperature,
    response_format: { type: 'json_object' as const },
    // Маршрутизировать только к провайдерам, поддерживающим все наши параметры
    // (response_format/json_object). Иначе routed-провайдер может вернуть 400.
    provider: { require_parameters: true },
  };
  const { id: logId, pairNum } = logLlmRequest({
    kind: 'json',
    model: effectiveModel,
    request: requestBody,
  });

  return enqueueLlm(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'DocuSpec',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      logLlmError({
        id: logId,
        pairNum,
        kind: 'json',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: err,
        request: requestBody,
      });
      throw err;
    }

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      const httpErr = new HttpError(
        `OpenRouter API error ${response.status}: ${enrichErrorText(errorText)}`,
        response.status,
      );
      logLlmError({
        id: logId,
        pairNum,
        kind: 'json',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: httpErr,
        status: response.status,
        rawData: errorText,
        request: requestBody,
      });
      throw httpErr;
    }

    const data = await response.json();

    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      const fingerprint =
        data && typeof data === 'object' && 'error' in data
          ? `provider error: ${describeOpenRouterError(data)}`
          : `top-level keys: ${Object.keys(data || {}).join(', ')}`;
      const err = new Error(`No content in LLM response (${fingerprint})`);
      logLlmError({
        id: logId,
        pairNum,
        kind: 'json',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: err,
        rawData: data,
        request: requestBody,
      });
      throw err;
    }

    const durationMs = Date.now() - callStart;
    logLlmResponse({
      id: logId,
      pairNum,
      kind: 'json',
      model: data.model || effectiveModel,
      durationMs,
      response: data,
    });
    return {
      content: choice.message.content,
      model: data.model || effectiveModel,
      usage: data.usage,
      durationMs,
      hasImage,
    };
  });
}

// ── Embedding API ──────────────────────────────────────────────

export interface EmbeddingOptions {
  texts: string[];
  model?: string;
  timeoutMs?: number;
}

/**
 * Generate embeddings via OpenRouter embeddings API.
 * Supports batch: up to 100 texts per call.
 * Rate limiting and retries handled by enqueueLlm().
 */
export async function callEmbeddingApi(options: EmbeddingOptions): Promise<number[][]> {
  const { texts, model, timeoutMs = 30000 } = options;
  const effectiveModel = model || getEmbeddingModel();
  const callStart = Date.now();

  // Для embeddings в запрос логируем лишь метаданные (тексты могут быть огромные)
  const requestBody = { model: effectiveModel, input: texts };
  const requestLogPayload = {
    model: effectiveModel,
    inputCount: texts.length,
    firstInputPreview: texts[0]?.slice(0, 120),
  };
  const { id: logId, pairNum } = logLlmRequest({
    kind: 'embeddings',
    model: effectiveModel,
    request: requestLogPayload,
  });

  return enqueueLlm(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'DocuSpec',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      logLlmError({
        id: logId,
        pairNum,
        kind: 'embeddings',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: err,
        request: requestLogPayload,
      });
      throw err;
    }

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      const httpErr = new HttpError(
        `OpenRouter Embedding API error ${response.status}: ${errorText}`,
        response.status,
      );
      logLlmError({
        id: logId,
        pairNum,
        kind: 'embeddings',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: httpErr,
        status: response.status,
        rawData: errorText,
        request: requestLogPayload,
      });
      throw httpErr;
    }

    const data = await response.json();
    const embeddings: number[][] = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((item: { embedding: number[] }) => item.embedding);

    logLlmResponse({
      id: logId,
      pairNum,
      kind: 'embeddings',
      model: effectiveModel,
      durationMs: Date.now() - callStart,
      response: {
        embeddingsCount: embeddings.length,
        dimensions: embeddings[0]?.length ?? 0,
      },
    });

    return embeddings;
  });
}

// ── Tool Use API (для ReAct агентов) ──────────────────────────

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmToolsOptions {
  messages: LlmMessage[];
  tools: ToolDefinition[];
  temperature?: number;
  timeoutMs?: number;
  model?: string;
}

export interface LlmToolsResponse {
  content: string | null;
  tool_calls: ToolCall[] | null;
  stop_reason: 'end_turn' | 'tool_use' | 'stop' | 'length';
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  durationMs: number;
}

/**
 * Call OpenRouter with tool definitions (for ReAct agents).
 * The LLM may return tool_calls or a final text response.
 * Rate limiting and retries handled by enqueueLlm().
 */
export async function callLlmWithTools(options: LlmToolsOptions): Promise<LlmToolsResponse> {
  const { messages, tools, temperature = 0.1, timeoutMs = 90000, model } = options;
  const effectiveModel = model || getModel();
  const callStart = Date.now();

  const requestBody = {
    model: effectiveModel,
    messages,
    tools,
    temperature,
    // Маршрутизировать только к провайдерам, поддерживающим все наши параметры
    // (tools, tool_choice, reasoning). Без этого OpenRouter мог отдать запрос
    // провайдеру qwen3 без поддержки tools и вернуть 400.
    provider: { require_parameters: true },
    // Подавить вывод reasoning-токенов в content для reasoning-моделей
    // (qwen3, deepseek-r1 и т.п.). Решает совместимость reasoning + tool_use,
    // для не-reasoning моделей параметр игнорируется.
    reasoning: { exclude: true },
  };
  const { id: logId, pairNum } = logLlmRequest({
    kind: 'tools',
    model: effectiveModel,
    request: requestBody,
  });

  return enqueueLlm(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'DocuSpec',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      logLlmError({
        id: logId,
        pairNum,
        kind: 'tools',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: err,
        request: requestBody,
      });
      throw err;
    }

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      const httpErr = new HttpError(
        `OpenRouter API error ${response.status}: ${enrichErrorText(errorText)}`,
        response.status,
      );
      logLlmError({
        id: logId,
        pairNum,
        kind: 'tools',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: httpErr,
        status: response.status,
        rawData: errorText,
        request: requestBody,
      });
      throw httpErr;
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      // Критично для отладки: сохраняем полный ответ OpenRouter.
      // Часто тут скрыта ошибка провайдера (rate limit, invalid key, model error)
      // в поле data.error, либо пустой массив choices.
      const fingerprint =
        data && typeof data === 'object' && 'error' in data
          ? `provider error: ${describeOpenRouterError(data)}`
          : `top-level keys: ${Object.keys(data || {}).join(', ') || '(empty)'}, choices.length=${data?.choices?.length ?? 'undefined'}`;
      const err = new Error(`No choice in LLM tools response (${fingerprint})`);
      logLlmError({
        id: logId,
        pairNum,
        kind: 'tools',
        model: effectiveModel,
        durationMs: Date.now() - callStart,
        error: err,
        rawData: data,
        request: requestBody,
      });
      throw err;
    }

    const durationMs = Date.now() - callStart;
    const finishReason = choice.finish_reason;

    // Map finish_reason to our stop_reason
    let stop_reason: LlmToolsResponse['stop_reason'];
    if (choice.message?.tool_calls?.length > 0) {
      stop_reason = 'tool_use';
    } else if (finishReason === 'stop' || finishReason === 'end_turn') {
      stop_reason = 'end_turn';
    } else if (finishReason === 'length') {
      stop_reason = 'length';
    } else {
      stop_reason = 'stop';
    }

    logLlmResponse({
      id: logId,
      pairNum,
      kind: 'tools',
      model: data.model || effectiveModel,
      durationMs,
      response: data,
    });

    return {
      content: choice.message?.content || null,
      tool_calls: choice.message?.tool_calls || null,
      stop_reason,
      model: data.model || effectiveModel,
      usage: data.usage,
      durationMs,
    };
  });
}
