/**
 * Request Queue — централизованная очередь запросов с concurrency control,
 * minimum delay между запросами и retry с exponential backoff.
 *
 * Две очереди-синглтона:
 * - llmQueue — для OpenRouter API (concurrency: 1, minDelay: 500мс)
 * - dbQueue  — для Supabase (concurrency: 3)
 */

// ── HttpError ────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

// ── Queue Item ───────────────────────────────────────────────────

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  retriesLeft: number;
  retryCount: number;
}

// ── Request Queue ────────────────────────────────────────────────

interface QueueConfig {
  concurrency: number;
  minDelayMs: number;
  maxRetries: number;
  initialBackoffMs: number;
  retryOn: (error: unknown) => boolean;
  name: string;
}

class RequestQueue {
  private queue: QueueItem<unknown>[] = [];
  private running = 0;
  private lastRequestTime = 0;
  private config: QueueConfig;

  constructor(config: QueueConfig) {
    this.config = config;
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
        retriesLeft: this.config.maxRetries,
        retryCount: 0,
      });
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && this.running < this.config.concurrency) {
      const item = this.queue.shift();
      if (!item) break;
      this.running++;
      this.executeItem(item).finally(() => {
        this.running--;
        this.drain();
      });
    }
  }

  private async executeItem(item: QueueItem<unknown>): Promise<void> {
    // Enforce minimum delay between requests
    if (this.config.minDelayMs > 0) {
      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < this.config.minDelayMs) {
        await new Promise(r => setTimeout(r, this.config.minDelayMs - elapsed));
      }
    }

    this.lastRequestTime = Date.now();

    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      if (item.retriesLeft > 0 && this.config.retryOn(error)) {
        const backoffMs = this.config.initialBackoffMs * Math.pow(2, item.retryCount);
        console.warn(
          `[${this.config.name}] Retry ${item.retryCount + 1}/${this.config.maxRetries} через ${backoffMs}мс`,
          error instanceof Error ? error.message : error,
        );
        await new Promise(r => setTimeout(r, backoffMs));
        item.retriesLeft--;
        item.retryCount++;
        // Re-enqueue at the front
        this.queue.unshift(item);
      } else {
        item.reject(error);
      }
    }
  }
}

// ── Singletons ───────────────────────────────────────────────────

const llmQueue = new RequestQueue({
  concurrency: 1,
  minDelayMs: 500,
  maxRetries: 5,
  initialBackoffMs: 2000,
  // Ретраим на 429 (rate limit) и 5xx (временные сбои провайдера: 500/502/503/504).
  // Особенно важно для маршрутизации OpenRouter: один из бэкенд-провайдеров может
  // отдать 502, а после backoff запрос уйдёт на следующего по списку.
  retryOn: (err) => {
    if (!(err instanceof HttpError)) return false;
    if (err.status === 429) return true;
    if (err.status >= 500 && err.status <= 599) return true;
    return false;
  },
  name: 'LLM',
});

const dbQueue = new RequestQueue({
  concurrency: 3,
  minDelayMs: 0,
  maxRetries: 2,
  initialBackoffMs: 1000,
  retryOn: (err) => {
    if (err instanceof HttpError && err.status === 500) return true;
    if (err instanceof Error && err.message.includes('statement timeout')) return true;
    return false;
  },
  name: 'DB',
});

// ── Public API ───────────────────────────────────────────────────

export function enqueueLlm<T>(fn: () => Promise<T>): Promise<T> {
  return llmQueue.enqueue(fn);
}

export function enqueueDb<T>(fn: () => Promise<T>): Promise<T> {
  return dbQueue.enqueue(fn);
}
