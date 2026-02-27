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
}

export interface LlmJsonResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Call OpenRouter with response_format: json_object.
 * Returns the raw JSON string from the model.
 * Retries once on failure.
 */
export async function callLlmJson(options: LlmOptions): Promise<LlmJsonResponse> {
  const { messages, temperature = 0.1, timeoutMs = 60000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
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
          model: getModel(),
          messages,
          temperature,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

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
        model: data.model || getModel(),
        usage: data.usage,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError!;
}
