/**
 * Хук состояния чата с агентом RateRecommender.
 *
 * Хранит:
 *  - историю сообщений UI (ChatMessage[])
 *  - history для API (ChatHistoryMessage[]) — параллельно UI
 *  - флаг загрузки текущего ответа
 *
 * Методы:
 *  - sendMessage(text) — отправить новое user-сообщение, дождаться ответа агента
 *  - reset() — очистить чат
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRateRecommenderConfig,
  buildInitialHistory,
} from '../lib/agents/rateRecommender';
import {
  continueAgentChat,
  type ChatHistoryMessage,
  type ChatAgentConfig,
} from '../lib/agents/agentChatRunner';
import type {
  ChatMessage,
  Candidate,
  ProposeRateSetPayload,
} from '../types/customRates';

let messageIdCounter = 0;
function nextId(prefix: string): string {
  messageIdCounter += 1;
  return `${prefix}-${Date.now()}-${messageIdCounter}`;
}

interface UseRateRecommenderChatResult {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** Загружается ли начальная конфигурация (snapshot + промпт) */
  initializing: boolean;
  sendMessage: (text: string) => Promise<void>;
  reset: () => void;
}

export function useRateRecommenderChat(): UseRateRecommenderChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Внутреннее API-состояние, не отображается в UI
  const configRef = useRef<ChatAgentConfig | null>(null);
  const historyRef = useRef<ChatHistoryMessage[]>([]);

  // Инициализация: подгружаем snapshot и промпт
  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    setError(null);

    createRateRecommenderConfig()
      .then(({ config, systemPromptWithContext }) => {
        if (cancelled) return;
        configRef.current = config;
        historyRef.current = buildInitialHistory(systemPromptWithContext);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Не удалось инициализировать агента: ${msg}`);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!configRef.current) {
        setError('Агент ещё не инициализирован');
        return;
      }
      if (loading) return;

      // 1. Добавить user-сообщение в UI и в API-историю
      const userMsg: ChatMessage = {
        kind: 'user',
        id: nextId('u'),
        text: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      historyRef.current.push({ role: 'user', content: trimmed });

      setLoading(true);
      setError(null);

      try {
        const result = await continueAgentChat(configRef.current, historyRef.current);
        historyRef.current = result.messages;

        // Преобразуем шаги агента в UI-сообщения с tool_calls
        if (result.steps.length > 0) {
          for (const step of result.steps) {
            const toolMsg: ChatMessage = {
              kind: 'assistant_tool',
              id: nextId('t'),
              tools: step.toolCalls.map((tc, i) => ({
                id: `${step.stepNumber}-${i}`,
                name: tc.name,
                args: tc.input,
                status: 'done',
              })),
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, toolMsg]);
          }
        }

        // Если был вызван terminal tool propose_rate_set
        if (result.terminalToolPayload && result.terminalToolPayload.name === 'propose_rate_set') {
          const payload = result.terminalToolPayload.args as ProposeRateSetPayload;
          const candidates: Candidate[] = (payload.rates ?? []).map((r, i) => ({
            key: `llm:${r.source}:${r.source_id ?? `nosrc-${i}`}`,
            source: r.source,
            sourceId: r.source_id,
            code: r.code,
            name: r.name,
            unit: r.unit,
            confidence: r.confidence,
            reasoning: r.reasoning,
            suggestedCategoryId: r.suggested_category_id,
            suggestedTypeId: r.suggested_type_id,
          }));

          const proposalMsg: ChatMessage = {
            kind: 'assistant_proposal',
            id: nextId('p'),
            summary: payload.summary ?? '',
            candidates,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, proposalMsg]);

          // ВАЖНО: добавляем "ответ" tool-вызова в API-историю, чтобы LLM могла продолжать диалог
          // (без ответа tool_call она не примет следующий user-message).
          // continueAgentChat УЖЕ добавил placeholder-результат, поэтому можно просто продолжать.
        } else if (result.finalText && result.finalText.trim()) {
          const textMsg: ChatMessage = {
            kind: 'assistant_text',
            id: nextId('a'),
            text: result.finalText,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, textMsg]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    if (configRef.current) {
      // Перестраиваем историю с тем же system промптом
      historyRef.current = [{ role: 'system', content: configRef.current.systemPrompt }];
    }
  }, []);

  return {
    messages,
    loading,
    error,
    initializing,
    sendMessage,
    reset,
  };
}
