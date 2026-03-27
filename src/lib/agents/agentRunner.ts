/**
 * ReAct agent runner — executes LLM agents with tool_use in a loop.
 *
 * The runner builds an initial message array (system + user), then iterates
 * up to `config.maxSteps` times, calling the LLM with tool definitions.
 * When the LLM returns tool_calls the runner executes them, appends tool
 * results to the conversation, and continues. The loop ends when the LLM
 * returns a final text answer (end_turn) or the step budget is exhausted.
 *
 * Features:
 * - Tool call cache (shared across agents in a pipeline run)
 * - Anti-looping detection (warns after 3 consecutive cache hits)
 * - Step budget warning on penultimate step
 * - Graceful handling of malformed tool arguments
 */

import { callLlmWithTools } from '../llm.ts';
import type { LlmMessage, ToolDefinition, ToolCall } from '../llm.ts';
import type { AgentTool, AgentConfig, AgentStep, AgentResult } from '../../types/skills.ts';
import { ToolCallCache } from './toolCallCache.ts';

// ── Helpers ────────────────────────────────────────────────────

/** Convert AgentTool[] to ToolDefinition[] for the OpenRouter API. */
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

/** Safely parse JSON arguments from a tool call, returning raw string on failure. */
function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Сокращение длинных строк для логов */
function truncate(val: unknown, maxLen = 300): string {
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return s && s.length > maxLen ? s.slice(0, maxLen) + '…' : (s ?? '');
}

/** Accumulate usage counters across multiple LLM calls. */
function addUsage(
  acc: AgentResult['usage'],
  incoming?: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
): void {
  if (!incoming) return;
  acc.prompt_tokens += incoming.prompt_tokens;
  acc.completion_tokens += incoming.completion_tokens;
  acc.total_tokens += incoming.total_tokens;
}

// ── Extended config (adds optional onStep callback) ────────────

export interface AgentRunnerConfig extends AgentConfig {
  /** Called after every completed step (tool round-trip). */
  onStep?: (step: AgentStep) => void;
}

/** Options passed to runAgent */
export interface RunAgentOptions {
  /** Shared tool call cache (across agents in a pipeline run) */
  toolCache?: ToolCallCache;
}

// ── Main runner ────────────────────────────────────────────────

/**
 * Run a ReAct agent to completion.
 *
 * @param config  Agent configuration (system prompt, tools, limits).
 * @param userMessage  The user task / query string.
 * @param options  Optional settings (shared tool cache, etc.)
 * @returns `AgentResult` containing the final answer, step log, and usage.
 */
export async function runAgent(
  config: AgentRunnerConfig,
  userMessage: string,
  options?: RunAgentOptions,
): Promise<AgentResult> {
  const toolDefs = toToolDefinitions(config.tools);
  const toolMap = new Map<string, AgentTool>(
    config.tools.map((t) => [t.name, t]),
  );
  const toolCache = options?.toolCache;

  // Build initial message history
  const messages: (LlmMessage | { role: 'tool'; tool_call_id: string; content: string })[] = [
    { role: 'system', content: config.systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const steps: AgentStep[] = [];
  const usage: AgentResult['usage'] = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  let lastThinking: string | null = null;
  let consecutiveCacheHits = 0;

  console.group(`🤖 [Agent: ${config.name}] старт`);
  console.log('Задание:', truncate(userMessage));
  console.log('Tools:', config.tools.map(t => t.name).join(', '));
  console.log('Max steps:', config.maxSteps);

  for (let stepNum = 1; stepNum <= config.maxSteps; stepNum++) {
    const stepStart = Date.now();
    console.log(`\n── Шаг ${stepNum}/${config.maxSteps} ──`);

    // ── Step budget warning on penultimate step ──────────────────
    if (stepNum === config.maxSteps - 1) {
      messages.push({
        role: 'system',
        content: `⚠️ ВНИМАНИЕ: Это предпоследний шаг (${stepNum}/${config.maxSteps}). Если вы нашли подходящую норму/ресурс — ОБЯЗАТЕЛЬНО вызовите confirm_rate или confirm_match прямо сейчас. Если не нашли — верните финальный JSON-ответ с reasoning, объясняющим почему норма/ресурс не найден. НЕ делайте ещё один search.`,
      } as unknown as LlmMessage);
    }

    // ── Anti-looping warning ────────────────────────────────────
    if (consecutiveCacheHits >= 3) {
      messages.push({
        role: 'system',
        content: '⚠️ Вы повторяете одни и те же поисковые запросы. Все варианты уже перебраны. Примите решение на основе имеющихся данных: вызовите confirm_rate/confirm_match с лучшим найденным вариантом, или верните финальный JSON-ответ с объяснением.',
      } as unknown as LlmMessage);
      consecutiveCacheHits = 0; // reset to avoid spamming
    }

    // Call LLM with current conversation + tool definitions
    const response = await callLlmWithTools({
      messages: messages as LlmMessage[],
      tools: toolDefs,
      temperature: config.temperature,
      model: config.model,
    });

    addUsage(usage, response.usage);
    console.log(`LLM ответ: stop_reason=${response.stop_reason}, tool_calls=${response.tool_calls?.length ?? 0}, ${Date.now() - stepStart}ms`);
    if (response.content) console.log('Thinking:', truncate(response.content, 200));

    // ── Final text answer ──────────────────────────────────────
    if (response.stop_reason === 'end_turn') {
      const finalText = response.content ?? '';
      console.log('✅ Финальный ответ:', truncate(finalText, 500));
      console.log(`Итого: ${steps.length} шагов, ${usage.total_tokens} токенов`);
      console.groupEnd();
      return {
        finalAnswer: finalText,
        steps,
        totalSteps: steps.length,
        usage,
      };
    }

    // ── Context-length limit reached ───────────────────────────
    if (response.stop_reason === 'length') {
      console.warn('⚠️ Лимит контекста достигнут');
      console.groupEnd();
      return {
        finalAnswer:
          response.content ??
          lastThinking ??
          '[Ответ не получен: превышен лимит контекста]',
        steps,
        totalSteps: steps.length,
        usage,
      };
    }

    // ── Tool use ───────────────────────────────────────────────
    if (response.stop_reason === 'tool_use' && response.tool_calls) {
      // Remember any intermediate thinking the model produced alongside tool calls
      if (response.content) {
        lastThinking = response.content;
      }

      // Execute each tool call
      const stepCalls: AgentStep['toolCalls'] = [];
      let stepCacheHits = 0;

      for (const toolCall of response.tool_calls) {
        const tool = toolMap.get(toolCall.function.name);
        const parsedInput = parseToolArgs(toolCall.function.arguments);

        let output: unknown;
        const toolStart = Date.now();

        if (!tool) {
          output = { error: `Неизвестный инструмент: ${toolCall.function.name}` };
          console.error(`  ❌ Tool "${toolCall.function.name}" не найден`);
        } else if (typeof parsedInput === 'string' && tool.parameters && Object.keys(tool.parameters).length > 0) {
          // ── Malformed JSON arguments ──────────────────────────
          output = { error: `Невалидные аргументы (не удалось распарсить JSON). Получено: "${truncate(parsedInput, 100)}". Повторите вызов с корректным JSON.` };
          console.error(`  ❌ ${toolCall.function.name}: битый JSON аргументов`);
        } else {
          // ── Check cache ──────────────────────────────────────
          const cached = toolCache?.get(toolCall.function.name, parsedInput);
          if (cached) {
            output = cached.output;
            stepCacheHits++;
            console.log(`  📋 ${toolCall.function.name}(${truncate(parsedInput, 150)}) [КЭШИРОВАНО, агент: ${cached.agentName}, шаг: ${cached.stepNumber}]`);
          } else {
            console.log(`  🔧 ${toolCall.function.name}(${truncate(parsedInput, 150)})`);
            try {
              output = await tool.execute(parsedInput);
              console.log(`     → ${truncate(output, 200)} (${Date.now() - toolStart}ms)`);
              // Save to cache
              toolCache?.set(toolCall.function.name, parsedInput, {
                output,
                agentName: config.name,
                stepNumber: stepNum,
              });
            } catch (err) {
              output = {
                error: err instanceof Error ? err.message : String(err),
              };
              console.error(`     ❌ Ошибка: ${(output as { error: string }).error}`);
            }
          }
        }

        stepCalls.push({
          name: toolCall.function.name,
          input: parsedInput,
          output,
        });
      }

      // Track consecutive cache hits for anti-looping
      if (stepCacheHits > 0 && stepCacheHits === response.tool_calls.length) {
        consecutiveCacheHits++;
      } else {
        consecutiveCacheHits = 0;
      }

      // Append assistant message (with tool_calls) to conversation.
      // OpenRouter / OpenAI format expects tool_calls on the assistant message.
      const assistantMsg: Record<string, unknown> = {
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.tool_calls.map((tc: ToolCall) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      };
      messages.push(assistantMsg as unknown as LlmMessage);

      // Append tool results (one message per call, role='tool')
      for (let i = 0; i < response.tool_calls.length; i++) {
        const tc = response.tool_calls[i];
        const result = stepCalls[i].output;
        let content = JSON.stringify(result);

        // Add cache hint to tool response so LLM knows it's a duplicate
        if (toolCache?.get(tc.function.name, stepCalls[i].input)) {
          content += '\n\n[КЭШИРОВАНО — этот запрос уже выполнялся ранее с идентичным результатом. Попробуйте другой запрос или примите решение на имеющихся данных.]';
        }

        messages.push({
          role: 'tool' as never,
          tool_call_id: tc.id,
          content,
        } as never);
      }

      // Record step
      const step: AgentStep = {
        stepNumber: stepNum,
        toolCalls: stepCalls,
        thinking: response.content ?? null,
      };
      steps.push(step);

      // Notify caller
      config.onStep?.(step);

      // Continue loop for next LLM call
      continue;
    }

    // ── Unexpected stop reason (e.g. 'stop' without tool_calls) ─
    console.warn(`⚠️ Неожиданный stop_reason: ${response.stop_reason}`);
    console.groupEnd();
    return {
      finalAnswer: response.content ?? lastThinking ?? '[Ответ не получен]',
      steps,
      totalSteps: steps.length,
      usage,
    };
  }

  // maxSteps exhausted — return whatever we have
  console.warn(`⚠️ Лимит шагов (${config.maxSteps}) исчерпан`);
  console.groupEnd();
  return {
    finalAnswer:
      lastThinking ?? '[Лимит шагов исчерпан, финальный ответ не получен]',
    steps,
    totalSteps: steps.length,
    usage,
  };
}
