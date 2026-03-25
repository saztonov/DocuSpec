/**
 * ReAct agent runner — executes LLM agents with tool_use in a loop.
 *
 * The runner builds an initial message array (system + user), then iterates
 * up to `config.maxSteps` times, calling the LLM with tool definitions.
 * When the LLM returns tool_calls the runner executes them, appends tool
 * results to the conversation, and continues. The loop ends when the LLM
 * returns a final text answer (end_turn) or the step budget is exhausted.
 */

import { callLlmWithTools } from '../llm.ts';
import type { LlmMessage, ToolDefinition, ToolCall } from '../llm.ts';
import type { AgentTool, AgentConfig, AgentStep, AgentResult } from '../../types/skills.ts';

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

// ── Main runner ────────────────────────────────────────────────

/**
 * Run a ReAct agent to completion.
 *
 * @param config  Agent configuration (system prompt, tools, limits).
 * @param userMessage  The user task / query string.
 * @returns `AgentResult` containing the final answer, step log, and usage.
 */
export async function runAgent(
  config: AgentRunnerConfig,
  userMessage: string,
): Promise<AgentResult> {
  const toolDefs = toToolDefinitions(config.tools);
  const toolMap = new Map<string, AgentTool>(
    config.tools.map((t) => [t.name, t]),
  );

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

  for (let stepNum = 1; stepNum <= config.maxSteps; stepNum++) {
    // Call LLM with current conversation + tool definitions
    const response = await callLlmWithTools({
      messages: messages as LlmMessage[],
      tools: toolDefs,
      temperature: config.temperature,
      model: config.model,
    });

    addUsage(usage, response.usage);

    // ── Final text answer ──────────────────────────────────────
    if (response.stop_reason === 'end_turn') {
      const finalText = response.content ?? '';
      return {
        finalAnswer: finalText,
        steps,
        totalSteps: steps.length,
        usage,
      };
    }

    // ── Context-length limit reached ───────────────────────────
    if (response.stop_reason === 'length') {
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

      for (const toolCall of response.tool_calls) {
        const tool = toolMap.get(toolCall.function.name);
        const parsedInput = parseToolArgs(toolCall.function.arguments);

        let output: unknown;
        if (!tool) {
          output = { error: `Неизвестный инструмент: ${toolCall.function.name}` };
        } else {
          try {
            output = await tool.execute(parsedInput);
          } catch (err) {
            output = {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }

        stepCalls.push({
          name: toolCall.function.name,
          input: parsedInput,
          output,
        });
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
        messages.push({
          role: 'tool' as never,
          tool_call_id: tc.id,
          content: JSON.stringify(result),
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
    return {
      finalAnswer: response.content ?? lastThinking ?? '[Ответ не получен]',
      steps,
      totalSteps: steps.length,
      usage,
    };
  }

  // maxSteps exhausted — return whatever we have
  return {
    finalAnswer:
      lastThinking ?? '[Лимит шагов исчерпан, финальный ответ не получен]',
    steps,
    totalSteps: steps.length,
    usage,
  };
}
