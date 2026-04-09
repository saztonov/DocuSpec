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
  RateSearchScope,
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
  /** Сколько уникальных расценок уже было предложено за всю сессию (накопительно) */
  proposedCount: number;
  /**
   * Запросить у LLM ещё подходящих расценок, исключая уже предложенные.
   * Формирует followup user-сообщение со списком id и подсказкой по синонимам.
   */
  findMore: () => Promise<void>;
}

/**
 * @param model — id модели OpenRouter, перекрывающий env-дефолт. Если undefined,
 *                будет использован VITE_OPENROUTER_MODEL.
 */
export function useRateRecommenderChat(
  model?: string,
  scope: RateSearchScope = 'both',
): UseRateRecommenderChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  // Накопленные id уже предложенных расценок (за всю сессию). Ключ:
  // `${source}:${sourceId ?? '-'}` — чтобы различать одинаковые суррогатные id
  // в разных источниках.
  const [proposedRateIds, setProposedRateIds] = useState<Set<string>>(() => new Set());

  // Внутреннее API-состояние, не отображается в UI
  const configRef = useRef<ChatAgentConfig | null>(null);
  const historyRef = useRef<ChatHistoryMessage[]>([]);
  // Накопленные кандидаты со всех propose_rate_set в этой сессии — нужны
  // findMore(), чтобы передать LLM полный список «не предлагать снова».
  const proposedRef = useRef<Candidate[]>([]);

  // Инициализация: подгружаем snapshot и промпт.
  // Пересоздаётся при смене scope — другой system-промпт и другие tools.
  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    setError(null);
    // Сбрасываем историю UI при смене scope — продолжать старый диалог с новым
    // системным промптом бессмысленно. Заодно сбрасываем накопленные id —
    // в новом scope могут быть совсем другие источники.
    setMessages([]);
    setProposedRateIds(new Set());
    proposedRef.current = [];

    createRateRecommenderConfig({ scope })
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
  }, [scope]);

  /**
   * Общая внутренняя процедура: добавляет user-message в историю,
   * запускает агента, обрабатывает шаги и финальный propose_rate_set.
   */
  const runTurn = useCallback(
    async (userText: string) => {
      if (!configRef.current) {
        setError('Агент ещё не инициализирован');
        return;
      }
      if (loading) return;

      const userMsg: ChatMessage = {
        kind: 'user',
        id: nextId('u'),
        text: userText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      historyRef.current.push({ role: 'user', content: userText });

      setLoading(true);
      setError(null);

      try {
        // Применяем актуально выбранную модель к config перед каждым ходом —
        // это позволяет переключать модель в UI без пересоздания агента.
        configRef.current.model = model;
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

          // Накопить id для последующего findMore (исключение повторов).
          // Дедуп по `source:source_id`. code (для ФСНБ) тоже храним отдельно
          // — он понятнее в подсказке для LLM.
          const newIds = new Set(proposedRateIds);
          for (const c of candidates) {
            const key = `${c.source}:${c.sourceId ?? c.code ?? c.name}`;
            newIds.add(key);
          }
          setProposedRateIds(newIds);
          proposedRef.current = [...proposedRef.current, ...candidates];
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
    [loading, model, proposedRateIds],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await runTurn(trimmed);
    },
    [runTurn],
  );

  /**
   * Кнопка «Найти ещё подходящие». Формирует followup user-сообщение со
   * списком уже предложенных id (полное накопление) и просит LLM искать
   * ДРУГИЕ расценки с другими формулировками. Если ничего ещё не предложено
   * — no-op.
   */
  const findMore = useCallback(async () => {
    if (loading) return;
    if (proposedRef.current.length === 0) {
      setError('Сначала получите хотя бы один набор предложений.');
      return;
    }

    // Группируем по source для краткости промпта.
    const byFsnb: string[] = [];
    const byImported: string[] = [];
    const byCustom: string[] = [];
    for (const c of proposedRef.current) {
      const label = c.code || c.sourceId || c.name;
      if (c.source === 'fsnb') byFsnb.push(label);
      else if (c.source === 'imported') byImported.push(c.sourceId ?? label);
      else if (c.source === 'custom') byCustom.push(c.sourceId ?? label);
    }

    const lines: string[] = [];
    lines.push(
      'Найди ДРУГИЕ подходящие расценки по тому же запросу — те, которые ты ещё не предлагал.',
    );
    lines.push('');
    lines.push('УЖЕ ПРЕДЛОЖЕНО (НЕ предлагай повторно):');
    if (byFsnb.length > 0) lines.push(`- ФСНБ: ${byFsnb.join(', ')}`);
    if (byImported.length > 0) lines.push(`- 1С: ${byImported.join(', ')}`);
    if (byCustom.length > 0) lines.push(`- custom: ${byCustom.join(', ')}`);
    lines.push('');
    lines.push(
      'Вызови search_rates_semantic минимум 2 раза с РАЗНЫМИ формулировками: попробуй синонимы (например, «монтаж» вместо «устройство», «облицовка» вместо «отделка», «сборка» вместо «изготовление»). Поищи по соседним технологическим подэтапам той же работы (каркас → стёкла → крепёж → герметизация и т.п.).',
    );
    lines.push('');
    lines.push(
      'Если в результатах есть таблицы ФСНБ, в которых ты ещё не смотрел все нормы — вызови list_fsnb_norms_in_table для их полного содержимого.',
    );
    lines.push('');
    lines.push(
      'Когда найдёшь новые — вызови propose_rate_set ТОЛЬКО с новыми расценками (без уже перечисленных выше). Если ничего нового не нашлось — так и скажи в summary, без вызова propose_rate_set.',
    );

    await runTurn(lines.join('\n'));
  }, [loading, runTurn]);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setProposedRateIds(new Set());
    proposedRef.current = [];
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
    proposedCount: proposedRateIds.size,
    findMore,
  };
}
