/**
 * Чат-режим для ReAct-агентов: continueAgentChat.
 *
 * Отличается от runAgent (agentRunner.ts) тем, что:
 *   1) Принимает уже существующий массив сообщений и продолжает диалог.
 *   2) Останавливается на end_turn, возвращая обновлённую историю и описание шагов.
 *   3) Не имеет понятия "вся беседа" — это один "ход" агента в долгой беседе.
 *   4) Поддерживает терминальный tool: при его вызове цикл прерывается, результат
 *      tool'а возвращается отдельно и НЕ добавляется в history. Это нужно для
 *      propose_rate_set, который должен полностью передать управление UI и
 *      позволить пользователю интерактивно работать с предложением, прежде чем
 *      продолжать диалог.
 *
 * Не меняет существующий agentRunner.ts — это отдельный модуль для нового сценария
 * RateRecommender. Старый PricePicker и т.д. продолжают работать как раньше.
 */

import { callLlmWithTools } from '../llm.ts';
import type { LlmMessage, ToolDefinition, ToolCall } from '../llm.ts';
import type { AgentTool, AgentStep } from '../../types/skills.ts';

// ── Типы ────────────────────────────────────────────────────────

export interface ChatAgentConfig {
  name: string;
  systemPrompt: string;
  tools: AgentTool[];
  /** Имя терминального tool, при вызове которого цикл прерывается. */
  terminalToolName?: string;
  /** Максимум tool-итераций между двумя сообщениями пользователя. */
  maxStepsPerTurn: number;
  temperature: number;
  model?: string;
}

/** Внутреннее представление сообщения в истории чата (формат OpenRouter API). */
export type ChatHistoryMessage =
  | LlmMessage
  | {
      role: 'assistant';
      content: string;
      tool_calls: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: 'tool';
      tool_call_id: string;
      content: string;
    };

export interface ContinueChatResult {
  /** Обновлённая история сообщений (включая ассистентский ответ). */
  messages: ChatHistoryMessage[];
  /** Финальный текст ассистента (если был end_turn) или null. */
  finalText: string | null;
  /** Если был вызван terminal tool — здесь распарсенный аргумент. */
  terminalToolPayload?: { name: string; args: unknown } | null;
  /** Шаги для UI: tool-вызовы по ходу хода. */
  steps: AgentStep[];
  /** Использование токенов за этот ход. */
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ── Хелперы ─────────────────────────────────────────────────────

function toToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function truncate(val: unknown, maxLen = 300): string {
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return s && s.length > maxLen ? s.slice(0, maxLen) + '…' : (s ?? '');
}

// ── Главная функция ─────────────────────────────────────────────

/**
 * Продолжить чат с агентом.
 *
 * Принимает уже сформированную history (system + предыдущие user/assistant + tool),
 * добавляет к ней tools и делает один или несколько round-trip к LLM, выполняя
 * tool-вызовы по ходу. Останавливается на:
 *   - end_turn (LLM ответил пользователю текстом или вообще без вызовов)
 *   - вызове терминального tool (например, propose_rate_set)
 *   - исчерпании maxStepsPerTurn
 *
 * НЕ добавляет system сообщение автоматически — caller сам формирует начальную
 * history с system на первом месте.
 */
export async function continueAgentChat(
  config: ChatAgentConfig,
  initialHistory: ChatHistoryMessage[],
): Promise<ContinueChatResult> {
  const toolDefs = toToolDefinitions(config.tools);
  const toolMap = new Map<string, AgentTool>(config.tools.map((t) => [t.name, t]));

  // Копия истории для модификации
  const history: ChatHistoryMessage[] = [...initialHistory];

  const steps: AgentStep[] = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  console.group(`💬 [Chat: ${config.name}] продолжение диалога`);

  for (let stepNum = 1; stepNum <= config.maxStepsPerTurn; stepNum++) {
    console.log(`── Шаг ${stepNum}/${config.maxStepsPerTurn} ──`);

    const response = await callLlmWithTools({
      messages: history as LlmMessage[],
      tools: toolDefs,
      temperature: config.temperature,
      model: config.model,
    });

    if (response.usage) {
      usage.prompt_tokens += response.usage.prompt_tokens;
      usage.completion_tokens += response.usage.completion_tokens;
      usage.total_tokens += response.usage.total_tokens;
    }

    console.log(
      `LLM: stop_reason=${response.stop_reason}, tool_calls=${response.tool_calls?.length ?? 0}`,
    );

    // ── Финальный текст ──
    if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop') {
      const finalText = response.content ?? '';
      console.log('✅ Финальный текст:', truncate(finalText, 300));
      console.groupEnd();

      // Добавляем ассистентское сообщение в history
      history.push({
        role: 'assistant',
        content: finalText,
      });

      return {
        messages: history,
        finalText,
        terminalToolPayload: null,
        steps,
        usage,
      };
    }

    // ── Превышен лимит контекста ──
    if (response.stop_reason === 'length') {
      console.warn('⚠️ Лимит контекста');
      console.groupEnd();
      const fallbackText = response.content ?? '[Превышен лимит контекста]';
      history.push({ role: 'assistant', content: fallbackText });
      return {
        messages: history,
        finalText: fallbackText,
        terminalToolPayload: null,
        steps,
        usage,
      };
    }

    // ── Tool use ──
    if (response.stop_reason === 'tool_use' && response.tool_calls && response.tool_calls.length > 0) {
      const stepCalls: AgentStep['toolCalls'] = [];

      // Сохраним assistant-сообщение с tool_calls
      const assistantMsg: ChatHistoryMessage = {
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.tool_calls.map((tc: ToolCall) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
      history.push(assistantMsg);

      let terminalDetected: { name: string; args: unknown } | null = null;

      for (const toolCall of response.tool_calls) {
        const tool = toolMap.get(toolCall.function.name);
        const parsedInput = parseToolArgs(toolCall.function.arguments);

        let output: unknown;
        const toolStart = Date.now();

        // Терминальный tool — не выполняем, перехватываем
        if (config.terminalToolName && toolCall.function.name === config.terminalToolName) {
          terminalDetected = { name: toolCall.function.name, args: parsedInput };
          output = { ok: true, intercepted_by_ui: true };
          console.log(`  🎯 ${toolCall.function.name} (terminal, передан в UI)`);
        } else if (!tool) {
          output = { error: `Неизвестный инструмент: ${toolCall.function.name}` };
          console.error(`  ❌ Tool "${toolCall.function.name}" не найден`);
        } else if (
          typeof parsedInput === 'string' &&
          tool.parameters &&
          Object.keys(tool.parameters).length > 0
        ) {
          output = {
            error:
              `Невалидные аргументы (не удалось распарсить JSON). ` +
              `Получено: "${truncate(parsedInput, 100)}". Повторите вызов с корректным JSON.`,
          };
          console.error(`  ❌ ${toolCall.function.name}: битый JSON`);
        } else {
          console.log(`  🔧 ${toolCall.function.name}(${truncate(parsedInput, 150)})`);
          try {
            output = await tool.execute(parsedInput);
            console.log(`     → ${truncate(output, 200)} (${Date.now() - toolStart}ms)`);
          } catch (err) {
            output = { error: err instanceof Error ? err.message : String(err) };
            console.error(`     ❌ Ошибка: ${(output as { error: string }).error}`);
          }
        }

        stepCalls.push({
          name: toolCall.function.name,
          input: parsedInput,
          output,
        });

        // Добавляем tool-результат в history
        history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        });
      }

      steps.push({
        stepNumber: stepNum,
        toolCalls: stepCalls,
        thinking: response.content ?? null,
      });

      // Если был терминальный tool — прерываем цикл
      if (terminalDetected) {
        console.log('✅ Terminal tool вызван — прерываем цикл и возвращаем UI');
        console.groupEnd();
        return {
          messages: history,
          finalText: null,
          terminalToolPayload: terminalDetected,
          steps,
          usage,
        };
      }

      // Иначе — продолжаем цикл
      continue;
    }

    // Неожиданный stop_reason
    console.warn(`⚠️ Неожиданный stop_reason: ${response.stop_reason}`);
    console.groupEnd();
    const fallback = response.content ?? '[Ответ не получен]';
    history.push({ role: 'assistant', content: fallback });
    return {
      messages: history,
      finalText: fallback,
      terminalToolPayload: null,
      steps,
      usage,
    };
  }

  // Лимит шагов исчерпан
  console.warn(`⚠️ Лимит шагов (${config.maxStepsPerTurn}) исчерпан`);
  console.groupEnd();
  const fallback = '[Лимит шагов исчерпан, продолжите диалог уточняющим сообщением]';
  history.push({ role: 'assistant', content: fallback });
  return {
    messages: history,
    finalText: fallback,
    terminalToolPayload: null,
    steps,
    usage,
  };
}
