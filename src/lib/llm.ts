/**
 * OpenRouter LLM client — calls directly from the browser.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  if (!key) throw new Error('Missing VITE_OPENROUTER_API_KEY in environment');
  return key;
}

function getModel(): string {
  return (import.meta.env.VITE_OPENROUTER_MODEL as string) || 'anthropic/claude-sonnet-4';
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
}

const MAX_RATE_LIMIT_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Call OpenRouter with response_format: json_object.
 * Returns the raw JSON string from the model.
 * Handles 429 (rate limit) with exponential backoff.
 * Retries once on other errors.
 */
export async function callLlmJson(options: LlmOptions): Promise<LlmJsonResponse> {
  const { messages, temperature = 0.1, timeoutMs = 60000, model } = options;
  const effectiveModel = model || getModel();

  let rateLimitRetries = 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2 + MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
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

      if (response.status === 429) {
        if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
          throw new Error('Ошибка OpenRouter 429: Превышен лимит запросов');
        }
        const retryAfter = response.headers.get('retry-after');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : INITIAL_BACKOFF_MS * Math.pow(2, rateLimitRetries);
        console.warn(`OpenRouter 429 — повтор через ${delayMs}мс (попытка ${rateLimitRetries + 1}/${MAX_RATE_LIMIT_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        rateLimitRetries++;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      const choice = data.choices?.[0];
      if (!choice?.message?.content) {
        throw new Error('No content in LLM response');
      }

      return {
        content: choice.message.content,
        model: data.model || effectiveModel,
        usage: data.usage,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Для ошибок rate limit пробрасываем сразу — они уже обработаны выше
      if (lastError.message.includes('429')) {
        throw lastError;
      }
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        throw lastError;
      }
    }
  }

  throw lastError!;
}
