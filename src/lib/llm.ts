/**
 * OpenRouter LLM client — calls directly from the browser.
 * Supports: JSON responses, tool_use (ReAct agents), embeddings.
 *
 * All API calls go through enqueueLlm() for centralized rate limiting,
 * concurrency control, and retry with exponential backoff.
 */

import { enqueueLlm, HttpError } from './requestQueue.ts';

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

  return enqueueLlm(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'DocuSpec',
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        temperature,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new HttpError(`OpenRouter API error ${response.status}: ${errorText}`, response.status);
    }

    const data = await response.json();

    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error('No content in LLM response');
    }

    const durationMs = Date.now() - callStart;
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

  return enqueueLlm(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'DocuSpec',
      },
      body: JSON.stringify({
        model: effectiveModel,
        input: texts,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new HttpError(`OpenRouter Embedding API error ${response.status}: ${errorText}`, response.status);
    }

    const data = await response.json();
    const embeddings: number[][] = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((item: { embedding: number[] }) => item.embedding);

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

  return enqueueLlm(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'DocuSpec',
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        tools,
        temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new HttpError(`OpenRouter API error ${response.status}: ${errorText}`, response.status);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No choice in LLM tools response');
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
