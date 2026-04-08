/**
 * RateRecommender — агент подбора расценок по описанию работ.
 *
 * Работает в чат-режиме (continueAgentChat), принимает свободное описание
 * пользователя и через многоходовой диалог подбирает набор расценок из трёх
 * источников: ФСНБ (нормы whitelist v2), 1С (старые корпоративные imported_rates)
 * и Custom (новые корпоративные).
 *
 * Все tools работают над локальным rateContextCache (без запросов в БД), кроме
 * get_norm_details — он обращается в БД за ресурсным составом и тех. группами
 * конкретной нормы.
 */

import { supabase } from '../supabase.ts';
import {
  getRateContextSnapshot,
  buildFsnbTreeForLlm,
  listFsnbNormsInTable,
} from '../rateContextCache.ts';
import { getNormComposition, getAllowedResources } from '../ragSearch.ts';
import type { AgentTool } from '../../types/skills.ts';
import type {
  ChatHistoryMessage,
  ChatAgentConfig,
} from './agentChatRunner.ts';
import type { RateContextSnapshot } from '../../types/customRates.ts';
import Fuse from 'fuse.js';

// ── Fallback-промпт (используется, если в БД нет записи rate_recommender_system) ──

export const FALLBACK_RATE_RECOMMENDER_PROMPT = `Ты — эксперт-сметчик строительного производства. Ведёшь диалог с пользователем, чтобы подобрать набор расценок для описанных им работ. Подбор идёт из трёх источников: ФСНБ (государственные нормы), 1С (старые корпоративные расценки, source_kind=imported) и Custom (новые корпоративные).

## Стартовый контекст
В первом system-сообщении тебе передана полная карта территории:
1. Дерево ФСНБ до уровня таблиц включительно (только нормы whitelist v2 с is_selected=true)
2. Все категории и виды затрат корпоративных расценок
3. Все старые корпоративные расценки (source_kind=imported)
4. Все новые корпоративные расценки (source_kind=custom)

Используй эту карту, чтобы сразу видеть, в каких ветках искать. Не делай слепых поисков, если структура уже видна.

## Алгоритм работы

1. Прочитай описание работ. Если оно неоднозначное или слишком общее — задай 1–2 коротких уточняющих вопроса (не больше за раз). Не спрашивай очевидное.
2. Сопоставь описание с категориями/видами/таблицами из стартового контекста.
3. Для ФСНБ-веток вызови tool list_fsnb_norms_in_table, чтобы получить нормы внутри конкретной таблицы.
4. Для корпоративных расценок не нужны tools — они уже в стартовом контексте, выбирай напрямую.
5. Для 2–3 норм-кандидатов вызови tool get_norm_details, чтобы посмотреть ресурсный состав.
6. Используй tool search_fsnb_fallback ТОЛЬКО как запасной вариант.
7. Когда уверен в наборе — вызови terminal tool propose_rate_set.

## Предпочтения при равной релевантности
custom > imported (1С) > fsnb. Свои корпоративные расценки лучше чужих государственных.

## Формат propose_rate_set (СТРОГО)
Все поля обязательны. UUID берутся ТОЛЬКО из переданных данных, никаких выдуманных.

## Важные правила
- ВСЕГДА указывай suggested_category_id и suggested_type_id.
- НЕ повторяй одинаковые tool-вызовы.
- После propose_rate_set диалог продолжается — пользователь может попросить корректировки.`;

// ── Загрузка системного промпта ─────────────────────────────────

export async function loadRateRecommenderPrompt(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('llm_prompts')
      .select('system_prompt')
      .eq('key', 'rate_recommender_system')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('[rateRecommender] Не удалось загрузить промпт из БД:', error.message);
      return FALLBACK_RATE_RECOMMENDER_PROMPT;
    }
    return (data?.system_prompt as string | undefined) ?? FALLBACK_RATE_RECOMMENDER_PROMPT;
  } catch (e) {
    console.warn('[rateRecommender] Ошибка загрузки промпта:', e);
    return FALLBACK_RATE_RECOMMENDER_PROMPT;
  }
}

// ── Сериализация стартового контекста ───────────────────────────

/**
 * Формирует компактный JSON-блок с картой территории, который добавляется
 * в system-сообщение перед началом диалога.
 *
 * Содержит:
 *  - дерево ФСНБ до уровня таблиц
 *  - все категории и виды затрат
 *  - все imported_rates (1С)
 *  - все custom_rates
 */
export function buildStartContext(snapshot: RateContextSnapshot): string {
  const tree = buildFsnbTreeForLlm(snapshot);

  const categoriesPayload = snapshot.categories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const typesPayload = snapshot.types.map((t) => ({
    id: t.id,
    category_id: t.category_id,
    name: t.name,
  }));

  const importedPayload = snapshot.importedRates.map((r) => ({
    id: r.id,
    name: r.work_name,
    unit: r.unit,
    type_id: r.type_id,
    category_id: r.category_id,
  }));

  const customPayload = snapshot.customRates.map((r) => ({
    id: r.id,
    name: r.work_name,
    unit: r.unit,
    type_id: r.type_id,
    source_kind: r.source_kind,
  }));

  const block = {
    fsnb_tree: tree,
    categories: categoriesPayload,
    types: typesPayload,
    imported_rates_1s: importedPayload,
    custom_rates: customPayload,
    stats: {
      fsnb_norms_total: snapshot.fsnbNorms.length,
      imported_total: snapshot.importedRates.length,
      custom_total: snapshot.customRates.length,
    },
  };

  return (
    '\n\n## Стартовая карта территории (используй её для навигации)\n\n' +
    '```json\n' +
    JSON.stringify(block, null, 2) +
    '\n```\n'
  );
}

// ── Tools агента ────────────────────────────────────────────────

function buildTools(snapshot: RateContextSnapshot): AgentTool[] {
  // Подготавливаем общий Fuse-индекс для search_fsnb_fallback
  const fuseFsnb = new Fuse(snapshot.fsnbNorms, {
    keys: [
      { name: 'name', weight: 1.0 },
      { name: 'norm_code', weight: 0.5 },
    ],
    threshold: 0.4,
    distance: 100,
    minMatchCharLength: 3,
    ignoreLocation: true,
    includeScore: true,
  });

  // 1. list_fsnb_norms_in_table — все нормы внутри конкретной таблицы
  const listNormsTool: AgentTool = {
    name: 'list_fsnb_norms_in_table',
    description:
      'Получить все нормы ФСНБ (с is_selected=true) внутри конкретной таблицы. ' +
      'Возвращает массив объектов {id, norm_code, name, unit}. Все аргументы — строки кодов из стартового контекста.',
    parameters: {
      type: 'object',
      properties: {
        collection_code: { type: 'string', description: 'Код коллекции (из стартового контекста)' },
        division_code: { type: 'string', description: 'Код раздела' },
        table_code: { type: 'string', description: 'Код таблицы (подраздела)' },
      },
      required: ['collection_code', 'division_code', 'table_code'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { collection_code, division_code, table_code } = input as {
        collection_code: string;
        division_code: string;
        table_code: string;
      };
      const norms = listFsnbNormsInTable(snapshot, collection_code, division_code, table_code);
      return norms.map((n) => ({
        id: n.id,
        norm_code: n.norm_code,
        name: n.name,
        unit: n.unit,
      }));
    },
  };

  // 2. get_norm_details — единственный tool, реально идущий в БД
  const getDetailsTool: AgentTool = {
    name: 'get_norm_details',
    description:
      'Получить детали нормы ФСНБ: ресурсный состав (материалы, машины, трудозатраты с расходом) ' +
      'и список технологических групп с абстрактными ресурсами. Используется для верификации выбора.',
    parameters: {
      type: 'object',
      properties: {
        norm_id: { type: 'string', description: 'UUID нормы из fsnb_norms' },
      },
      required: ['norm_id'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { norm_id } = input as { norm_id: string };
      const [composition, techGroups] = await Promise.all([
        getNormComposition(norm_id),
        getAllowedResources(norm_id).catch(() => []),
      ]);
      return {
        composition: composition.map((c) => ({
          resource_name: c.resource_name,
          resource_type: c.resource_type,
          consumption: c.consumption,
          unit: c.measure_unit,
        })),
        tech_groups: techGroups.map((g) => ({
          tg_code: g.tg_code,
          resource_count: g.resources.length,
          sample_resources: g.resources.slice(0, 5).map((r) => r.name),
        })),
      };
    },
  };

  // 3. search_fsnb_fallback — локальный fuzzy-поиск
  const fallbackTool: AgentTool = {
    name: 'search_fsnb_fallback',
    description:
      'РЕЗЕРВНЫЙ текстовый поиск по нормам ФСНБ (whitelist v2). ' +
      'Используй ТОЛЬКО если по дереву таблиц не получилось найти подходящего. ' +
      'Возвращает топ-N норм по релевантности.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Поисковый запрос' },
        limit: { type: 'number', description: 'Максимум результатов (по умолчанию 20)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const { query, limit = 20 } = input as { query: string; limit?: number };
      const results = fuseFsnb.search(query, { limit });
      return results.map((r) => ({
        id: r.item.id,
        norm_code: r.item.norm_code,
        name: r.item.name,
        unit: r.item.unit,
        score: r.score,
        collection_code: r.item.collection_code,
        division_code: r.item.division_code,
        table_code: r.item.table_code,
      }));
    },
  };

  // 4. propose_rate_set — терминальный tool (НЕ исполняется здесь, перехватывается chatRunner)
  const proposeTool: AgentTool = {
    name: 'propose_rate_set',
    description:
      'ТЕРМИНАЛЬНЫЙ ИНСТРУМЕНТ. Финальное предложение пользователю — набор подобранных расценок. ' +
      'Каждая расценка должна иметь suggested_category_id и suggested_type_id из стартового контекста. ' +
      'После вызова диалог передаётся обратно пользователю.',
    parameters: {
      type: 'object',
      properties: {
        rates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', enum: ['fsnb', 'imported', 'custom'] },
              source_id: { type: ['string', 'null'] },
              code: { type: ['string', 'null'] },
              name: { type: 'string' },
              unit: { type: 'string' },
              suggested_category_id: { type: 'string' },
              suggested_type_id: { type: 'string' },
              reasoning: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: [
              'source',
              'source_id',
              'name',
              'unit',
              'suggested_category_id',
              'suggested_type_id',
              'reasoning',
              'confidence',
            ],
            additionalProperties: false,
          },
        },
        summary: { type: 'string', description: 'Короткий комментарий пользователю (1-2 предложения)' },
      },
      required: ['rates', 'summary'],
      additionalProperties: false,
    },
    // Никогда не исполняется — перехватывается в continueAgentChat
    execute: async () => ({ ok: true, intercepted_by_ui: true }),
  };

  return [listNormsTool, getDetailsTool, fallbackTool, proposeTool];
}

// ── Фабрика конфигурации ────────────────────────────────────────

/**
 * Создаёт ChatAgentConfig для RateRecommender. Тоже асинхронная — нужно
 * подгрузить snapshot и системный промпт из БД.
 */
export async function createRateRecommenderConfig(): Promise<{
  config: ChatAgentConfig;
  snapshot: RateContextSnapshot;
  systemPromptWithContext: string;
}> {
  const snapshot = await getRateContextSnapshot();
  const basePrompt = await loadRateRecommenderPrompt();
  const startContext = buildStartContext(snapshot);
  const systemPromptWithContext = basePrompt + startContext;

  const tools = buildTools(snapshot);

  const config: ChatAgentConfig = {
    name: 'rate_recommender',
    systemPrompt: systemPromptWithContext,
    tools,
    terminalToolName: 'propose_rate_set',
    maxStepsPerTurn: 8,
    temperature: 0.2,
  };

  return { config, snapshot, systemPromptWithContext };
}

/**
 * Формирует начальное сообщение system для history новой беседы.
 */
export function buildInitialHistory(systemPrompt: string): ChatHistoryMessage[] {
  return [{ role: 'system', content: systemPrompt }];
}
