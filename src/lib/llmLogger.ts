// Заглушка после удаления таблицы llm_logs. LLM используется только для embeddings
// в fsnbImporter/ragSearch; логирование отключено — функции ничего не делают.

let counter = 0;

export function logLlmRequest(_payload: unknown): { id: string; pairNum: number } {
  counter += 1;
  return { id: `noop-${counter}`, pairNum: counter };
}

export function logLlmResponse(_payload: unknown): void {}

export function logLlmError(_payload: unknown): void {}
