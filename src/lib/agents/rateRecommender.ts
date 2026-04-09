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
import { getNormComposition, getAllowedResources, searchNorms } from '../ragSearch.ts';
import type { AgentTool } from '../../types/skills.ts';
import type {
  ChatHistoryMessage,
  ChatAgentConfig,
} from './agentChatRunner.ts';
import type { RateContextSnapshot, RateSearchScope } from '../../types/customRates.ts';
import Fuse from 'fuse.js';

// ── Fallback-промпт (используется, если в БД нет записи rate_recommender_system) ──

export const FALLBACK_RATE_RECOMMENDER_PROMPT = `Ты — эксперт-сметчик строительного производства. Ведёшь диалог с пользователем, чтобы подобрать набор расценок для описанных им работ. Подбор идёт из трёх источников: ФСНБ (государственные нормы), 1С (старые корпоративные расценки, source_kind=imported) и Custom (новые корпоративные).

ФСНБ — полноценный, основной источник, не fallback.

## Стартовый контекст
В первом system-сообщении тебе передана МЕТА-карта:
1. Дерево ФСНБ до уровня таблиц (без названий норм — их получишь через tool)
2. Все категории и виды затрат
3. Маленький список custom_rates (если он короткий) — корпоративные новые

Сами расценки (нормы ФСНБ и записи 1С) НЕ перечислены в стартовом контексте. Получай их ТОЛЬКО через tool search_rates_semantic.

## Алгоритм работы

### Шаг 1 (ВСЕГДА): семантический поиск
Вызови tool search_rates_semantic с описанием работ из запроса пользователя. Используй естественный язык, не сокращай до одного слова. Например, для запроса «Устройство фасада — алюминиевые витражи» вызови search_rates_semantic({ query: "Устройство фасада алюминиевые витражи стоечно-ригельная система", limit: 30 }).

Tool вернёт два массива: fsnb (через embeddings + FTS) и imported (1С через локальный fuzzy). Кандидаты обогащены полями category_id/type_id (для 1С) и collection/division/table_code (для ФСНБ).

### Шаг 2 (опционально): расширение по дереву ФСНБ
Если в результатах ФСНБ нашлась релевантная таблица — вызови list_fsnb_norms_in_table, чтобы посмотреть всех соседей в той же таблице. Часто в одной таблице 5-15 родственных норм, и LLM-поиск возвращает не все.

### Шаг 3 (опционально): уточнение состава
Для 2-3 наиболее релевантных норм можешь вызвать get_norm_details, чтобы убедиться, что ресурсный состав соответствует ожидаемому.

### Шаг 4: финальное предложение
Вызови terminal tool propose_rate_set со всеми отобранными расценками.

## Полнота результата (КРИТИЧНО)
Твоя задача — найти МАКСИМУМ релевантных расценок, а не первые попавшиеся.
- Вызывай search_rates_semantic с limit: 30 (не меньше).
- Перед propose_rate_set пройди по ВСЕМ результатам поиска и отбери все, у которых score выше порога релевантности или название явно про ту же работу. Не отбрасывай «похожих» только потому, что нашёл «более точный».
- В типичном запросе («фасад», «полы», «кровля») релевантных расценок обычно 8-15. Если предлагаешь меньше 5 — вероятно, ты не дочитал результаты или слишком строго отфильтровал.
- Группируй варианты: «монтаж каркаса», «установка стёкол», «крепёжные элементы» — это РАЗНЫЕ расценки одного фасада, нужны все три.
- propose_rate_set может содержать массив из 15-20 элементов — это нормально.
- Никогда не останавливайся на первых 5-7. Это считается ошибкой работы.

## Терминологический хинт
Названия в ФСНБ — формальные и не повторяют речь пользователя. Глагол в запросе и в норме часто различается:
- «Устройство» в запросе → «Монтаж», «Установка», «Сборка», «Изготовление» в норме
- «Отделка» → «Облицовка», «Штукатурка», «Окраска»
- «Положить плитку» → «Устройство покрытий из плит»

Не отбрасывай кандидата с релевантным семантическим score только потому, что глагол другой.

## Предпочтения при равной релевантности
Выбирай по релевантности к описанию работ. При действительно равной релевантности (score близкие, описание совпадает) предпочитай custom (точно настроены под нашу компанию). ФСНБ и 1С равны по приоритету.

## Формат propose_rate_set (СТРОГО)
Все поля обязательны. UUID берутся ТОЛЬКО из переданных данных, никаких выдуманных. source ∈ {"fsnb","imported","custom"}.

## Важные правила
- ВСЕГДА указывай suggested_category_id и suggested_type_id (для 1С — берёшь напрямую из результата search_rates_semantic; для ФСНБ — выбираешь из categories/types в стартовом контексте по смыслу работ).
- НЕ повторяй одинаковые tool-вызовы с тем же query.
- После propose_rate_set диалог продолжается — пользователь может попросить корректировки или вызвать «Найти ещё подходящие».
- Если пользователь просит «найди ещё» с указанием уже предложенных id — НЕ предлагай их повторно, ищи с другими формулировками.`;

/**
 * Вариант промпта для режима «Только ФСНБ». Корпоративные расценки 1С
 * недоступны, tools по ним не вызываются.
 */
export const FALLBACK_RATE_RECOMMENDER_PROMPT_FSNB = `Ты — эксперт-сметчик строительного производства. Ведёшь диалог с пользователем, чтобы подобрать набор расценок для описанных им работ. Область поиска ОГРАНИЧЕНА государственными нормами ФСНБ (whitelist v2, is_selected=true). Корпоративные расценки 1С и custom в этом режиме недоступны.

## Стартовый контекст
В первом system-сообщении тебе передана МЕТА-карта ФСНБ:
1. Дерево ФСНБ до уровня таблиц (без названий норм — их получишь через tool)
2. Справочник категорий и видов затрат (нужен для полей suggested_category_id/suggested_type_id)

Сами нормы в стартовом контексте НЕ перечислены. Получай их через tool search_rates_semantic.

## Алгоритм работы

### Шаг 1 (ВСЕГДА): семантический поиск
Вызови search_rates_semantic({ query: "<описание работ>", limit: 30 }). Tool вернёт массив fsnb с обогащёнными полями collection_code/division_code/table_code и score.

### Шаг 2: расширение по дереву
Если в результатах нашлась релевантная таблица — вызови list_fsnb_norms_in_table, чтобы посмотреть всех соседей. Часто LLM-поиск возвращает не все нормы из родственной группы.

### Шаг 3 (опционально): уточнение состава
Для 2-3 норм-кандидатов вызови get_norm_details.

### Шаг 4: финальное предложение
Вызови terminal tool propose_rate_set. В поле source всех расценок ТОЛЬКО "fsnb".

## Полнота результата (КРИТИЧНО)
- search_rates_semantic с limit: 30 минимум.
- В типичном запросе релевантных норм 8-15. Если предлагаешь меньше 5 — вероятно, не дочитал результаты.
- Группируй родственные нормы (каркас + стёкла + крепёж — это РАЗНЫЕ нужные расценки).
- propose_rate_set может содержать 15-20 элементов — это нормально.
- Никогда не останавливайся на первых 5-7.

## Терминологический хинт
Названия в ФСНБ — формальные. «Устройство» в речи → «Монтаж», «Установка», «Сборка», «Изготовление» в норме. «Положить плитку» → «Устройство покрытий из плит». Не отбрасывай кандидата с релевантным score только из-за глагола.

## Формат propose_rate_set (СТРОГО)
Все поля обязательны. UUID берутся ТОЛЬКО из переданных данных. Источник строго "fsnb".

## Важные правила
- ВСЕГДА указывай suggested_category_id и suggested_type_id из стартового контекста.
- НЕ предлагай расценки с source="imported" или "custom" — они вне области поиска.
- НЕ повторяй одинаковые tool-вызовы с тем же query.
- Если пользователь просит «найди ещё» с указанием уже предложенных id — НЕ предлагай их повторно, ищи с другими формулировками.`;

/**
 * Вариант промпта для режима «Только 1С». ФСНБ недоступен, tools по нему
 * не вызываются. Все корпоративные расценки переданы в стартовом контексте —
 * выбирай напрямую, без tools поиска.
 */
export const FALLBACK_RATE_RECOMMENDER_PROMPT_IMPORTED = `Ты — эксперт-сметчик строительного производства. Ведёшь диалог с пользователем, чтобы подобрать набор расценок для описанных им работ. Область поиска ОГРАНИЧЕНА корпоративными расценками 1С (imported_rates). ФСНБ и custom в этом режиме недоступны.

## Стартовый контекст
В первом system-сообщении тебе передана МЕТА-карта:
1. Категории и виды затрат (для информации)
2. Статистика количества записей

Сами расценки 1С в стартовом контексте НЕ перечислены — их более 1000. Получай их через tool search_rates_semantic.

## Алгоритм работы

### Шаг 1 (ВСЕГДА): поиск
Вызови search_rates_semantic({ query: "<описание работ>", source: "imported", limit: 30 }). Tool вернёт массив imported с обогащёнными полями category_id/category_name/type_id/type_name и score.

### Шаг 2: финальное предложение
Отбери ВСЕ релевантные кандидаты (см. блок «Полнота») и вызови terminal tool propose_rate_set. В поле source ТОЛЬКО "imported", source_id — id из результатов search_rates_semantic.

## Полнота результата (КРИТИЧНО)
- search_rates_semantic с limit: 30 минимум.
- В типичном запросе релевантных расценок 8-15. Если предлагаешь меньше 5 — вероятно, не дочитал результаты.
- Можно вызвать search_rates_semantic несколько раз с разными формулировками (синонимами), чтобы расширить охват.
- propose_rate_set может содержать 15-20 элементов — это нормально.
- Никогда не останавливайся на первых 5-7.

## Терминологический хинт
В 1С названия часто неформальные, но всё же могут отличаться от речи. Пробуй синонимы: «устройство»/«монтаж»/«установка», «отделка»/«облицовка».

## Формат propose_rate_set (СТРОГО)
Все поля обязательны. UUID берутся ТОЛЬКО из переданных данных. Источник строго "imported". Поле code = null (у 1С нет кодов).

## Важные правила
- ВСЕГДА указывай suggested_category_id и suggested_type_id (бери их прямо из результата search_rates_semantic).
- НЕ предлагай расценки с source="fsnb" или "custom" — они вне области поиска.
- НЕ повторяй одинаковые tool-вызовы с тем же query.
- Если пользователь просит «найди ещё» с указанием уже предложенных id — НЕ предлагай их повторно, ищи с другими формулировками.`;

const PROMPT_KEY_BY_SCOPE: Record<RateSearchScope, string> = {
  both: 'rate_recommender_system',
  fsnb: 'rate_recommender_system_fsnb',
  imported: 'rate_recommender_system_imported',
};

const FALLBACK_BY_SCOPE: Record<RateSearchScope, string> = {
  both: FALLBACK_RATE_RECOMMENDER_PROMPT,
  fsnb: FALLBACK_RATE_RECOMMENDER_PROMPT_FSNB,
  imported: FALLBACK_RATE_RECOMMENDER_PROMPT_IMPORTED,
};

// ── Загрузка системного промпта ─────────────────────────────────

export async function loadRateRecommenderPrompt(scope: RateSearchScope = 'both'): Promise<string> {
  const key = PROMPT_KEY_BY_SCOPE[scope];
  const fallback = FALLBACK_BY_SCOPE[scope];
  try {
    const { data, error } = await supabase
      .from('llm_prompts')
      .select('system_prompt')
      .eq('key', key)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('[rateRecommender] Не удалось загрузить промпт из БД:', error.message);
      return fallback;
    }
    return (data?.system_prompt as string | undefined) ?? fallback;
  } catch (e) {
    console.warn('[rateRecommender] Ошибка загрузки промпта:', e);
    return fallback;
  }
}

// ── Сериализация стартового контекста ───────────────────────────

/**
 * Формирует компактный JSON-блок с картой территории, который добавляется
 * в system-сообщение перед началом диалога.
 *
 * Содержит ТОЛЬКО метаданные:
 *  - дерево ФСНБ до уровня таблиц (без названий норм — их получает search_rates_semantic)
 *  - все категории и виды затрат (нужны LLM для заполнения suggested_category_id/type_id)
 *  - small custom_rates (≤ 50 шт) — слишком мало, чтобы тратить tool-call
 *  - статистика
 *
 * Полные списки fsnbNorms и importedRates НЕ встраиваются — это делало контекст
 * ~280 KB и создавало асимметрию (ФСНБ — только структура, 1С — целиком). Теперь
 * оба источника поднимаются через единый tool search_rates_semantic.
 */
export function buildStartContext(
  snapshot: RateContextSnapshot,
  scope: RateSearchScope = 'both',
): string {
  const includeFsnb = scope === 'fsnb' || scope === 'both';
  const includeImported = scope === 'imported' || scope === 'both';

  const tree = includeFsnb ? buildFsnbTreeForLlm(snapshot) : null;

  const categoriesPayload = snapshot.categories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const typesPayload = snapshot.types.map((t) => ({
    id: t.id,
    category_id: t.category_id,
    name: t.name,
  }));

  // Custom-расценок обычно единицы — встраиваем целиком, чтобы не плодить tool-call
  const customPayload = scope === 'both' && snapshot.customRates.length <= 50
    ? snapshot.customRates.map((r) => ({
        id: r.id,
        name: r.work_name,
        unit: r.unit,
        type_id: r.type_id,
        source_kind: r.source_kind,
      }))
    : [];

  const block: Record<string, unknown> = {
    categories: categoriesPayload,
    types: typesPayload,
    stats: {
      fsnb_norms_total: includeFsnb ? snapshot.fsnbNorms.length : 0,
      imported_total: includeImported ? snapshot.importedRates.length : 0,
      custom_total: scope === 'both' ? snapshot.customRates.length : 0,
    },
  };
  if (includeFsnb) block.fsnb_tree = tree;
  if (scope === 'both' && customPayload.length > 0) block.custom_rates = customPayload;

  return (
    '\n\n## Стартовая карта территории\n\n' +
    'Это только МЕТА-карта. Сами расценки (нормы ФСНБ и 1С) получай через tool ' +
    '`search_rates_semantic` — они НЕ перечислены в этом блоке.\n\n' +
    '```json\n' +
    JSON.stringify(block, null, 2) +
    '\n```\n'
  );
}

// ── Tools агента ────────────────────────────────────────────────

function buildTools(snapshot: RateContextSnapshot, scope: RateSearchScope = 'both'): AgentTool[] {
  // Индекс fsnbNorms по id — нужен для быстрого обогащения результата searchNorms
  // полями collection/division/table_code из локального snapshot. Заодно гарантирует
  // фильтр whitelist v2: searchNorms() ходит в hybrid_search_norms по всей fsnb_norms,
  // а в snapshot только is_selected=true → результаты вне whitelist отсеиваются.
  const fsnbById = new Map(snapshot.fsnbNorms.map((n) => [n.id, n]));

  // Локальный Fuse для 1С — у imported_rates нет embeddings, идём по name/unit.
  const fuseImported = new Fuse(snapshot.importedRates, {
    keys: [
      { name: 'work_name', weight: 1.0 },
      { name: 'type_name', weight: 0.4 },
      { name: 'category_name', weight: 0.2 },
    ],
    threshold: 0.45,
    distance: 200,
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

  // 3. search_rates_semantic — главный tool: симметричный поиск по обоим источникам
  // ФСНБ — гибридный (вектор embeddings + FTS-fallback) через ragSearch.searchNorms.
  // 1С — локальный Fuse (у imported_rates нет embedding-колонки).
  // Параметр source ограничивает источник; default — оба.
  const searchSemanticTool: AgentTool = {
    name: 'search_rates_semantic',
    description:
      'ОСНОВНОЙ ИНСТРУМЕНТ ПОИСКА. Семантический поиск расценок по описанию работ. ' +
      'Возвращает топ-N релевантных кандидатов с обеих сторон (ФСНБ + 1С). ' +
      'ВСЕГДА вызывай первым шагом с описанием работ из запроса пользователя. ' +
      'Можешь вызывать несколько раз с разными формулировками (синонимы), чтобы расширить охват.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Описание работ для поиска. Используй естественный язык (как пишет пользователь). ' +
            'Не сокращай до одного слова — больше контекста = лучше релевантность.',
        },
        source: {
          type: 'string',
          enum: ['fsnb', 'imported', 'both'],
          description: 'Откуда искать. По умолчанию both. Используй "fsnb"/"imported" чтобы сузить.',
        },
        limit: {
          type: 'number',
          description: 'Максимум результатов с каждого источника (по умолчанию 30, не меньше 20).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (input: unknown) => {
      const {
        query,
        source = 'both',
        limit = 30,
      } = input as { query: string; source?: 'fsnb' | 'imported' | 'both'; limit?: number };

      // Защита: если scope ограничен, форсим source
      const effectiveSource: 'fsnb' | 'imported' | 'both' =
        scope === 'fsnb' ? 'fsnb' : scope === 'imported' ? 'imported' : source;

      const tasks: Array<Promise<unknown>> = [];

      // ФСНБ — hybrid через searchNorms, фильтр по whitelist v2
      const fsnbTask: Promise<Array<Record<string, unknown>>> =
        effectiveSource === 'imported'
          ? Promise.resolve([])
          : searchNorms(query, { limit }).then((rows) =>
              rows
                .map((r) => {
                  const enriched = fsnbById.get(r.id);
                  if (!enriched) return null; // нет в whitelist v2
                  return {
                    source: 'fsnb',
                    id: enriched.id,
                    norm_code: enriched.norm_code,
                    name: enriched.name,
                    unit: enriched.unit,
                    collection_code: enriched.collection_code,
                    division_code: enriched.division_code,
                    table_code: enriched.table_code,
                    score: r.score,
                  };
                })
                .filter((x): x is Record<string, unknown> => x !== null),
            ).catch((e) => {
              console.warn('[search_rates_semantic] searchNorms failed:', e);
              return [];
            });
      tasks.push(fsnbTask);

      // 1С — Fuse-индекс по name/type/category
      const importedTask: Promise<Array<Record<string, unknown>>> =
        effectiveSource === 'fsnb'
          ? Promise.resolve([])
          : Promise.resolve(
              fuseImported.search(query, { limit }).map((r) => ({
                source: 'imported',
                id: r.item.id,
                name: r.item.work_name,
                unit: r.item.unit,
                category_id: r.item.category_id,
                category_name: r.item.category_name,
                type_id: r.item.type_id,
                type_name: r.item.type_name,
                score: r.score, // Fuse score: 0 = идеально, 1 = далеко
              })),
            );
      tasks.push(importedTask);

      const [fsnbResults, importedResults] = (await Promise.all(tasks)) as [
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
      ];

      return {
        query,
        source: effectiveSource,
        fsnb: fsnbResults,
        imported: importedResults,
        hint:
          fsnbResults.length === 0 && importedResults.length === 0
            ? 'Ничего не найдено. Попробуй другую формулировку или синонимы (например "монтаж" вместо "устройство", "облицовка" вместо "отделка").'
            : 'Не отбрасывай похожие — выбери ВСЕ релевантные. Для широких запросов нормально предложить 8-15 расценок.',
      };
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

  // search_rates_semantic — главный универсальный поисковый инструмент во всех режимах.
  // Для scope='imported' исключаем ФСНБ-only tools (list_fsnb_norms_in_table, get_norm_details).
  if (scope === 'imported') {
    return [searchSemanticTool, proposeTool];
  }
  return [searchSemanticTool, listNormsTool, getDetailsTool, proposeTool];
}

// ── Фабрика конфигурации ────────────────────────────────────────

/**
 * Создаёт ChatAgentConfig для RateRecommender. Тоже асинхронная — нужно
 * подгрузить snapshot и системный промпт из БД.
 */
export async function createRateRecommenderConfig(
  options: { scope?: RateSearchScope } = {},
): Promise<{
  config: ChatAgentConfig;
  snapshot: RateContextSnapshot;
  systemPromptWithContext: string;
}> {
  const scope = options.scope ?? 'both';
  const snapshot = await getRateContextSnapshot();
  const basePrompt = await loadRateRecommenderPrompt(scope);
  const startContext = buildStartContext(snapshot, scope);
  const systemPromptWithContext = basePrompt + startContext;

  const tools = buildTools(snapshot, scope);

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
