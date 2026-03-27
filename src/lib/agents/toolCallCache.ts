/**
 * Tool Call Cache — дедупликация вызовов инструментов между агентами.
 *
 * Кэш создаётся один раз на pipeline run и передаётся всем агентам.
 * При повторном вызове того же инструмента с теми же аргументами
 * возвращает закэшированный результат и подсказку агенту.
 */

/** Набор инструментов, которые НЕ кэшируются (мутирующие) */
const NON_CACHEABLE = new Set([
  'confirm_rate',
  'confirm_match',
  'check_unit_compatibility',
]);

export interface CacheEntry {
  output: unknown;
  agentName: string;
  stepNumber: number;
}

export class ToolCallCache {
  private cache = new Map<string, CacheEntry>();

  /** Каноничный ключ: toolName + стабилизированный JSON аргументов */
  private makeKey(toolName: string, args: unknown): string {
    const argsStr = typeof args === 'object' && args !== null
      ? JSON.stringify(args, Object.keys(args as Record<string, unknown>).sort())
      : String(args);
    return `${toolName}:${argsStr}`;
  }

  /** Проверить, можно ли кэшировать данный инструмент */
  isCacheable(toolName: string): boolean {
    return !NON_CACHEABLE.has(toolName);
  }

  /** Получить из кэша (undefined если нет) */
  get(toolName: string, args: unknown): CacheEntry | undefined {
    if (!this.isCacheable(toolName)) return undefined;
    return this.cache.get(this.makeKey(toolName, args));
  }

  /** Сохранить в кэш */
  set(toolName: string, args: unknown, entry: CacheEntry): void {
    if (!this.isCacheable(toolName)) return;
    this.cache.set(this.makeKey(toolName, args), entry);
  }

  /** Количество записей в кэше */
  get size(): number {
    return this.cache.size;
  }
}
