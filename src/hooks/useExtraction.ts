import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import { parseDocument } from '../lib/parser.ts';
import { classifyTable, isExtractableCategory, isVedomostMaterialov } from '../lib/tableClassifier.ts';
import {
  ruleBasedExtract,
  llmExtractBatch,
  llmExtractImageBlock,
  mergeResults,
  FALLBACK_PROMPT_UNIVERSAL,
  FALLBACK_PROMPT_LAYER_CAKE,
} from '../lib/extraction.ts';
import { generateCanonicalKey } from '../lib/canonical.ts';
import type { ExtractionProgress, MaterialFactItem } from '../types/extraction.ts';
import type { BlockForExtraction } from '../lib/extraction.ts';

export function useExtraction(docId: string) {
  const [progress, setProgress] = useState<ExtractionProgress>({
    status: 'idle',
    phase: undefined,
    completedBatches: 0,
    totalBatches: 0,
    extractedFacts: 0,
    errorMessage: null,
  });

  const runExtraction = useCallback(async (model?: string) => {
    try {
      await supabase
        .from('documents')
        .update({ status: 'extracting', model_used: model || null })
        .eq('id', docId);

      await supabase
        .from('material_facts')
        .delete()
        .eq('doc_id', docId);

      // ── Загрузить промпты из БД ──
      const promptsResult = await supabase
        .from('llm_prompts')
        .select('key, system_prompt')
        .eq('is_active', true);

      const promptMap = new Map<string, string>();
      for (const row of promptsResult.data ?? []) {
        promptMap.set(row.key as string, row.system_prompt as string);
      }

      const universalPrompt = promptMap.get('universal_extraction') ?? FALLBACK_PROMPT_UNIVERSAL;
      const layerCakePrompt = promptMap.get('layer_cake') ?? FALLBACK_PROMPT_LAYER_CAKE;

      // ── Загрузить документ ──
      setProgress(p => ({ ...p, status: 'rule_based', phase: 'Загрузка документа', errorMessage: null }));

      const { data: doc } = await supabase
        .from('documents')
        .select('raw_md')
        .eq('id', docId)
        .single();

      if (!doc?.raw_md) throw new Error('Document not found or raw_md is empty');

      const parsed = parseDocument(doc.raw_md);

      // ── Загрузить блоки из БД (включая image_url) ──
      const { data: dbBlocksRaw } = await supabase
        .from('doc_blocks')
        .select('id, block_uid, has_table, block_type, page_id, image_url')
        .eq('doc_id', docId);

      if (!dbBlocksRaw) throw new Error('Could not load blocks');

      type DbBlockRow = { id: string; block_uid: string; has_table: boolean; block_type: string; page_id: string; image_url: string | null };
      const dbBlocks = dbBlocksRaw as DbBlockRow[];

      const blockUidToDbBlock = new Map(dbBlocks.map(b => [b.block_uid, b]));

      // ── Классифицировать все TEXT блоки ──
      const vedomostBlocks: BlockForExtraction[] = [];    // Фаза 1: ведомости материалов
      const specBlocks: BlockForExtraction[] = [];         // Фаза 2: спецификации
      const imageBlocks: BlockForExtraction[] = [];        // Фаза 3: изображения (пироги)

      for (const page of parsed.pages) {
        for (const block of page.blocks) {
          if (block.hasError) continue;
          const dbBlock = blockUidToDbBlock.get(block.uid);
          if (!dbBlock) continue;

          if (block.type === 'TEXT') {
            const sectionLower = (block.sectionTitle || '').toLowerCase();
            const isGeneralSection = /общие указания|общие характеристики|общие данные|условные обозначения|общие сведения/.test(sectionLower);
            if (isGeneralSection) continue;

            if (block.hasTable) {
              // Определяем, к какой фазе относится блок по категориям его таблиц
              const categories = block.tables.map(t => classifyTable(t));
              const hasVedomost = categories.some(c => isVedomostMaterialov(c));
              const hasExtractable = categories.some(c => isExtractableCategory(c) && !isVedomostMaterialov(c));

              if (hasVedomost) {
                vedomostBlocks.push({
                  block,
                  pageNo: page.pageNo,
                  blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'vedomost_materialov',
                  blockTypeDisplay: 'Таблица',
                });
              }
              if (hasExtractable) {
                specBlocks.push({
                  block,
                  pageNo: page.pageNo,
                  blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya',
                  blockTypeDisplay: 'Таблица',
                });
              }
              // Блоки с unknown-таблицами — в спецификации
              const hasUnknown = categories.some(c => c === 'unknown');
              if (hasUnknown && !hasVedomost && !hasExtractable) {
                specBlocks.push({
                  block,
                  pageNo: page.pageNo,
                  blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya',
                  blockTypeDisplay: 'Таблица',
                });
              }
            } else {
              // Текстовые блоки без таблиц — только с явными количественными паттернами
              const hasQuantityPattern = /\d+[,.]?\d*\s*(шт|м2|м3|м\.п\.|кг(?![\s]*\/)|т(?![\s]*\/|олщ)|л(?!ист|ин)|компл|слоя?)/i.test(block.content);
              if (hasQuantityPattern) {
                specBlocks.push({
                  block,
                  pageNo: page.pageNo,
                  blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya',
                  blockTypeDisplay: 'Текст',
                });
              }
            }
          } else if (block.type === 'IMAGE') {
            // Пропускаем легенды и планы этажей
            const contentLower = block.content.toLowerCase();
            if (contentLower.includes('тип: легенда') || contentLower.includes('тип: план')) continue;

            // Обрабатываем только разрезы, сечения, узлы
            const isCrossSection = contentLower.includes('тип: разрез') ||
              contentLower.includes('тип: сечение') ||
              contentLower.includes('тип: узел');

            if (isCrossSection && block.content.includes('Текст на чертеже:')) {
              imageBlocks.push({
                block,
                pageNo: page.pageNo,
                blockDbId: dbBlock.id,
                sectionContext: block.sectionTitle,
                imageUrl: dbBlock.image_url,
                sourceSection: 'pirog',
                blockTypeDisplay: 'Изображение',
              });
            }
          }
        }
      }

      let totalFacts = 0;

      // ════════════════════════════════════════════════════════
      // ФАЗА 1: Ведомости материалов
      // ════════════════════════════════════════════════════════
      setProgress(p => ({
        ...p,
        status: 'rule_based',
        phase: 'Фаза 1: Ведомости материалов',
        completedBatches: 0,
        totalBatches: vedomostBlocks.length,
      }));

      const ruleBasedResults = new Map<string, MaterialFactItem[]>();
      const vedomostNeedingLlm: BlockForExtraction[] = [];

      for (const bfe of vedomostBlocks) {
        const ruleItems = ruleBasedExtract(bfe.block);
        if (ruleItems.length > 0) {
          ruleBasedResults.set(bfe.blockDbId, ruleItems);
          await saveFactsToDb(docId, bfe.blockDbId, ruleItems, 'vedomost_materialov', 'Таблица');
          totalFacts += ruleItems.length;
        } else {
          vedomostNeedingLlm.push(bfe);
        }
      }

      if (vedomostNeedingLlm.length > 0) {
        setProgress(p => ({
          ...p,
          status: 'llm_extracting',
          phase: 'Фаза 1: Ведомости материалов (LLM)',
          completedBatches: 0,
          totalBatches: vedomostNeedingLlm.length,
          extractedFacts: totalFacts,
        }));

        const llmVedomost = await llmExtractBatch(
          vedomostNeedingLlm,
          universalPrompt,
          (completed, total) => setProgress(p => ({ ...p, completedBatches: completed, totalBatches: total })),
          model,
        );

        for (const [blockDbId, items] of llmVedomost) {
          const filtered = filterLlmItems(items);
          if (filtered.length > 0) {
            await saveFactsToDb(docId, blockDbId, filtered, 'vedomost_materialov', 'Таблица');
            totalFacts += filtered.length;
          }
        }
      }

      // ════════════════════════════════════════════════════════
      // ФАЗА 2: Спецификации
      // ════════════════════════════════════════════════════════
      setProgress(p => ({
        ...p,
        status: 'llm_extracting',
        phase: 'Фаза 2: Спецификации',
        completedBatches: 0,
        totalBatches: specBlocks.length,
        extractedFacts: totalFacts,
      }));

      const specRuleResults = new Map<string, MaterialFactItem[]>();
      const specNeedingLlm: BlockForExtraction[] = [];

      for (const bfe of specBlocks) {
        if (bfe.block.hasTable) {
          const ruleItems = ruleBasedExtract(bfe.block);
          const hasComplexTables = bfe.block.tables.some(t => {
            const cat = classifyTable(t);
            return isExtractableCategory(cat) && cat !== 'material_qty' && cat !== 'element_spec' && cat !== 'spec_elements' && cat !== 'vedomost_materialov';
          });
          const hasUnknownTables = bfe.block.tables.some(t => classifyTable(t) === 'unknown');

          if (ruleItems.length > 0) {
            specRuleResults.set(bfe.blockDbId, ruleItems);
            await saveFactsToDb(docId, bfe.blockDbId, ruleItems, 'spetsifikatsiya', bfe.blockTypeDisplay ?? 'Таблица');
            totalFacts += ruleItems.length;
          }

          if (hasComplexTables || hasUnknownTables || ruleItems.length === 0) {
            specNeedingLlm.push(bfe);
          }
        } else {
          // Текстовые блоки — всегда в LLM
          specNeedingLlm.push(bfe);
        }
      }

      if (specNeedingLlm.length > 0) {
        const llmSpec = await llmExtractBatch(
          specNeedingLlm,
          universalPrompt,
          (completed, total) => setProgress(p => ({ ...p, completedBatches: completed, totalBatches: total })),
          model,
        );

        setProgress(p => ({ ...p, status: 'merging', phase: 'Фаза 2: Сохранение спецификаций' }));

        for (const [blockDbId, llmItems] of llmSpec) {
          const filtered = filterLlmItems(llmItems);
          const ruleItems = specRuleResults.get(blockDbId) ?? [];
          const merged = mergeResults(ruleItems, filtered);

          const ruleKeys = new Set(ruleItems.map(i =>
            `${i.raw_name.toLowerCase().trim()}|${i.quantity ?? ''}|${(i.unit || '').toLowerCase()}`
          ));
          const llmUnique = merged.filter(i => {
            const key = `${i.raw_name.toLowerCase().trim()}|${i.quantity ?? ''}|${(i.unit || '').toLowerCase()}`;
            return !ruleKeys.has(key);
          });

          const bfe = specNeedingLlm.find(b => b.blockDbId === blockDbId);
          const blockTypeDisplay = bfe?.blockTypeDisplay ?? 'Текст';

          if (llmUnique.length > 0) {
            await saveFactsToDb(docId, blockDbId, llmUnique, 'spetsifikatsiya', blockTypeDisplay);
            totalFacts += llmUnique.length;
          }
        }
      }

      // ════════════════════════════════════════════════════════
      // ФАЗА 3: Пироги из изображений
      // ════════════════════════════════════════════════════════
      setProgress(p => ({
        ...p,
        status: 'llm_extracting',
        phase: 'Фаза 3: Пироги конструкций',
        completedBatches: 0,
        totalBatches: imageBlocks.length,
        extractedFacts: totalFacts,
      }));

      for (let i = 0; i < imageBlocks.length; i++) {
        const bfe = imageBlocks[i];
        const items = await llmExtractImageBlock(bfe, layerCakePrompt, model);
        const filtered = items.filter(item => item.source_snippet);

        if (filtered.length > 0) {
          await saveFactsToDb(docId, bfe.blockDbId, filtered, 'pirog', 'Изображение');
          totalFacts += filtered.length;
        }

        setProgress(p => ({ ...p, completedBatches: i + 1, extractedFacts: totalFacts }));

        if (i < imageBlocks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // ── Финализация ──
      setProgress(p => ({ ...p, status: 'saving', phase: 'Сохранение' }));

      await supabase
        .from('documents')
        .update({ status: 'done' })
        .eq('id', docId);

      setProgress({
        status: 'done',
        phase: undefined,
        completedBatches: vedomostBlocks.length + specBlocks.length + imageBlocks.length,
        totalBatches: vedomostBlocks.length + specBlocks.length + imageBlocks.length,
        extractedFacts: totalFacts,
        errorMessage: null,
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      setProgress(p => ({
        ...p,
        status: 'error',
        errorMessage: message,
      }));

      await supabase
        .from('documents')
        .update({ status: 'error', error_message: message })
        .eq('id', docId);
    }
  }, [docId]);

  return { progress, runExtraction };
}

function filterLlmItems(items: MaterialFactItem[]): MaterialFactItem[] {
  return items.filter(item => {
    if (item.quantity !== null) return true;
    if (item.unit === null && item.confidence < 0.85) return false;
    const nameLower = (item.canonical_name || item.raw_name).toLowerCase();
    const isGenericHeader = /^(элементы|ограждения|перегородки|поручни|покрытия|наружная|стены|стена)\b/.test(nameLower);
    if (isGenericHeader && item.quantity === null) return false;
    return true;
  });
}

async function saveFactsToDb(
  docId: string,
  blockDbId: string,
  items: MaterialFactItem[],
  sourceSection: string,
  blockTypeDisplay: string,
): Promise<void> {
  if (items.length === 0) return;

  const rows = items.map(item => ({
    doc_id: docId,
    block_id: blockDbId,
    raw_name: item.raw_name,
    canonical_name: item.canonical_name || item.raw_name,
    canonical_key: item.canonical_key || generateCanonicalKey(item.raw_name),
    construction: item.construction ?? null,
    extra_params: item.extra_params ?? null,
    quantity: item.quantity,
    unit: item.unit,
    mark: item.mark,
    gost: item.gost,
    description: item.description,
    note: item.note,
    source_snippet: item.source_snippet,
    source_section: sourceSection,
    block_type_display: blockTypeDisplay,
    table_category: sourceSection,
    confidence: item.confidence,
    user_verified: false,
  }));

  const { error } = await supabase
    .from('material_facts')
    .insert(rows);

  if (error) {
    console.error('Failed to save material facts:', error);
    throw new Error(`Failed to save facts: ${error.message}`);
  }
}
