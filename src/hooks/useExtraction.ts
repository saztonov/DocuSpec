import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import { parseDocument } from '../lib/parser.ts';
import { classifyTable, isExtractableCategory, isVedomostMaterialov, isAssemblySpec } from '../lib/tableClassifier.ts';
import {
  ruleBasedExtract,
  extractAssemblySpec,
  llmExtractBatch,
  llmExtractImageBlock,
  llmExtractGlossary,
  mergeResults,
  FALLBACK_PROMPT_UNIVERSAL,
  FALLBACK_PROMPT_LAYER_CAKE,
  FALLBACK_PROMPT_GLOSSARY,
} from '../lib/extraction.ts';
import { generateCanonicalKey } from '../lib/canonical.ts';
import type { ExtractionProgress, MaterialFactItem, GlossaryMap, ProductFactItem } from '../types/extraction.ts';
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

      await supabase
        .from('product_facts')
        .delete()
        .eq('doc_id', docId);

      await supabase
        .from('doc_glossary')
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
      const glossaryPrompt = promptMap.get('glossary_extraction') ?? FALLBACK_PROMPT_GLOSSARY;

      // ── Загрузить документ и section.code ──
      setProgress(p => ({ ...p, status: 'rule_based', phase: 'Загрузка документа', errorMessage: null }));

      const { data: doc } = await supabase
        .from('documents')
        .select('raw_md, section_id')
        .eq('id', docId)
        .single();

      if (!doc?.raw_md) throw new Error('Document not found or raw_md is empty');

      // Загрузить section.code если есть section_id
      // sectionCode будет использован в будущих итерациях для выбора промптов по разделу
      let _sectionCode: string | null = null;
      if (doc.section_id) {
        const { data: sectionData } = await supabase
          .from('sections')
          .select('code')
          .eq('id', doc.section_id)
          .single();
        _sectionCode = sectionData?.code ?? null;
      }
      void _sectionCode;

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

      // ════════════════════════════════════════════════════════
      // PASS 0: Глоссарий
      // ════════════════════════════════════════════════════════
      setProgress(p => ({ ...p, status: 'glossary', phase: 'Pass 0: Глоссарий', completedBatches: 0, totalBatches: 1 }));

      const glossaryMap: GlossaryMap = new Map();

      // Собираем чанки по ~25 блоков для передачи в LLM
      const CHUNK_SIZE = 25;
      const allTextBlocks: string[] = [];
      for (const page of parsed.pages) {
        for (const block of page.blocks) {
          if (block.type === 'TEXT' && block.content.trim().length > 50) {
            allTextBlocks.push(`[Block ${block.uid}]\n${block.content.slice(0, 2000)}`);
          }
        }
      }

      const glossaryChunks: string[] = [];
      for (let i = 0; i < allTextBlocks.length; i += CHUNK_SIZE) {
        glossaryChunks.push(allTextBlocks.slice(i, i + CHUNK_SIZE).join('\n\n---\n\n'));
      }

      if (glossaryChunks.length > 0) {
        const glossaryItems = await llmExtractGlossary(glossaryChunks, glossaryPrompt, model);

        // Сохранить в doc_glossary и заполнить glossaryMap
        if (glossaryItems.length > 0) {
          const glossaryRows = glossaryItems.map(item => ({
            doc_id: docId,
            code: item.code,
            item_type: item.item_type,
            description: item.description ?? null,
            confidence: 0.85,
          }));
          await supabase.from('doc_glossary').upsert(glossaryRows, { onConflict: 'doc_id,code' });

          for (const item of glossaryItems) {
            glossaryMap.set(item.code, item);
          }
        }

        await supabase
          .from('documents')
          .update({ glossary_status: 'done' })
          .eq('id', docId);
      }

      setProgress(p => ({ ...p, completedBatches: 1 }));

      // ── Классифицировать все блоки ──
      const vedomostBlocks: BlockForExtraction[] = [];    // Фаза 1: ведомости материалов
      const specBlocks: BlockForExtraction[] = [];         // Фаза 2: спецификации
      const assemblyBlocks: BlockForExtraction[] = [];     // Фаза 2b: спецификации сборок
      const productListBlocks: BlockForExtraction[] = [];  // Ведомости изделий → product_facts
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
              const categories = block.tables.map(t => classifyTable(t));
              const hasVedomost = categories.some(c => isVedomostMaterialov(c));
              const hasAssemblySpec = categories.some(c => isAssemblySpec(c));
              const hasVedomostIzd = categories.some(c => c === 'vedomost_izdelij');
              const hasExtractable = categories.some(c => isExtractableCategory(c) && !isVedomostMaterialov(c) && !isAssemblySpec(c));

              if (hasVedomost) {
                vedomostBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'vedomost_materialov', blockTypeDisplay: 'Таблица',
                });
              }
              if (hasAssemblySpec) {
                assemblyBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'assembly_spec', blockTypeDisplay: 'Таблица',
                });
              }
              if (hasVedomostIzd) {
                productListBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'vedomost_izdelij', blockTypeDisplay: 'Таблица',
                });
              }
              if (hasExtractable) {
                specBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya', blockTypeDisplay: 'Таблица',
                });
              }
              const hasUnknown = categories.some(c => c === 'unknown');
              if (hasUnknown && !hasVedomost && !hasExtractable && !hasAssemblySpec && !hasVedomostIzd) {
                specBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya', blockTypeDisplay: 'Таблица',
                });
              }
            } else {
              const hasQuantityPattern = /\d+[,.]?\d*\s*(шт|м2|м3|м\.п\.|кг(?![\s]*\/)|т(?![\s]*\/|олщ)|л(?!ист|ин)|компл|слоя?)/i.test(block.content);
              if (hasQuantityPattern) {
                specBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya', blockTypeDisplay: 'Текст',
                });
              }
            }
          } else if (block.type === 'IMAGE') {
            const contentLower = block.content.toLowerCase();
            if (contentLower.includes('тип: легенда') || contentLower.includes('тип: план')) continue;
            const isCrossSection = contentLower.includes('тип: разрез') ||
              contentLower.includes('тип: сечение') ||
              contentLower.includes('тип: узел');
            if (isCrossSection && block.content.includes('Текст на чертеже:')) {
              imageBlocks.push({
                block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                sectionContext: block.sectionTitle,
                imageUrl: dbBlock.image_url,
                sourceSection: 'pirog', blockTypeDisplay: 'Изображение',
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
        ...p, status: 'rule_based', phase: 'Фаза 1: Ведомости материалов',
        completedBatches: 0, totalBatches: vedomostBlocks.length,
      }));

      const vedomostNeedingLlm: BlockForExtraction[] = [];

      for (const bfe of vedomostBlocks) {
        const ruleItems = ruleBasedExtract(bfe.block);
        if (ruleItems.length > 0) {
          await saveFactsToDb(docId, bfe.blockDbId, ruleItems, 'vedomost_materialov', 'Таблица');
          totalFacts += ruleItems.length;
        } else {
          vedomostNeedingLlm.push(bfe);
        }
      }

      if (vedomostNeedingLlm.length > 0) {
        setProgress(p => ({
          ...p, status: 'llm_extracting', phase: 'Фаза 1: Ведомости материалов (LLM)',
          completedBatches: 0, totalBatches: vedomostNeedingLlm.length, extractedFacts: totalFacts,
        }));

        const llmVedomost = await llmExtractBatch(
          vedomostNeedingLlm,
          buildPromptWithGlossary(universalPrompt, glossaryMap),
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
        ...p, status: 'llm_extracting', phase: 'Фаза 2: Спецификации',
        completedBatches: 0, totalBatches: specBlocks.length, extractedFacts: totalFacts,
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
          specNeedingLlm.push(bfe);
        }
      }

      if (specNeedingLlm.length > 0) {
        const llmSpec = await llmExtractBatch(
          specNeedingLlm,
          buildPromptWithGlossary(universalPrompt, glossaryMap),
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
      // ФАЗА 2b: Спецификации сборок (assembly_spec)
      // ════════════════════════════════════════════════════════
      if (assemblyBlocks.length > 0) {
        setProgress(p => ({
          ...p, status: 'rule_based', phase: 'Фаза 2b: Спецификации изделий',
          completedBatches: 0, totalBatches: assemblyBlocks.length, extractedFacts: totalFacts,
        }));

        for (const bfe of assemblyBlocks) {
          const allMaterials: MaterialFactItem[] = [];
          const allProducts: ProductFactItem[] = [];

          for (const table of bfe.block.tables) {
            if (!isAssemblySpec(classifyTable(table))) continue;
            const { materials, products } = extractAssemblySpec(table, glossaryMap);
            allMaterials.push(...materials);
            allProducts.push(...products);
          }

          if (allMaterials.length > 0) {
            await saveFactsToDb(docId, bfe.blockDbId, allMaterials, 'assembly_spec', 'Таблица');
            totalFacts += allMaterials.length;
          }
          if (allProducts.length > 0) {
            await saveProductsToDb(docId, bfe.blockDbId, allProducts, 'assembly_spec');
          }
        }
      }

      // ════════════════════════════════════════════════════════
      // ФАЗА 2c: Ведомости изделий → product_facts
      // ════════════════════════════════════════════════════════
      if (productListBlocks.length > 0) {
        setProgress(p => ({
          ...p, status: 'llm_extracting', phase: 'Фаза 2c: Ведомости изделий',
          completedBatches: 0, totalBatches: productListBlocks.length, extractedFacts: totalFacts,
        }));

        const llmProducts = await llmExtractBatch(
          productListBlocks,
          buildPromptWithGlossary(universalPrompt, glossaryMap),
          undefined,
          model,
        );

        for (const [blockDbId, items] of llmProducts) {
          // LLM для vedomost_izdelij должна вернуть {"items": []} по правилу Type C.
          // Если LLM всё же вернула элементы — сохраняем их как product_facts по mark/construction.
          const products: ProductFactItem[] = items
            .filter(i => i.source_snippet)
            .map(i => ({
              assembly_mark: i.mark || i.raw_name,
              assembly_name: i.mark ? i.raw_name : null,
              canonical_key: i.canonical_key,
              quantity: i.quantity,
              unit: i.unit,
              description: i.description,
              note: i.note,
              source_snippet: i.source_snippet,
              confidence: i.confidence,
            }));

          if (products.length > 0) {
            await saveProductsToDb(docId, blockDbId, products, 'vedomost_izdelij');
          }
        }
      }

      // ════════════════════════════════════════════════════════
      // ФАЗА 3: Пироги из изображений
      // ════════════════════════════════════════════════════════
      setProgress(p => ({
        ...p, status: 'llm_extracting', phase: 'Фаза 3: Пироги конструкций',
        completedBatches: 0, totalBatches: imageBlocks.length, extractedFacts: totalFacts,
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

      const totalBlocks = vedomostBlocks.length + specBlocks.length + assemblyBlocks.length + productListBlocks.length + imageBlocks.length;
      setProgress({
        status: 'done',
        phase: undefined,
        completedBatches: totalBlocks,
        totalBatches: totalBlocks,
        extractedFacts: totalFacts,
        errorMessage: null,
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      setProgress(p => ({ ...p, status: 'error', errorMessage: message }));
      await supabase
        .from('documents')
        .update({ status: 'error', error_message: message })
        .eq('id', docId);
    }
  }, [docId]);

  return { progress, runExtraction };
}

/**
 * Inject glossary context into system prompt if glossary is non-empty.
 */
function buildPromptWithGlossary(systemPrompt: string, glossaryMap: GlossaryMap): string {
  if (glossaryMap.size === 0) return systemPrompt;

  const assemblyEntries = [...glossaryMap.values()].filter(e => e.item_type === 'assembly');
  if (assemblyEntries.length === 0) return systemPrompt;

  const glossaryContext = assemblyEntries
    .slice(0, 40)
    .map(e => `- ${e.code}: assembly — "${e.description || 'сборная единица'}" → NOT a material, NOT a component`)
    .join('\n');

  return `${systemPrompt}\n\nDOCUMENT GLOSSARY (assemblies identified in this document — do NOT extract as materials):\n${glossaryContext}`;
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

  const { error } = await supabase.from('material_facts').insert(rows);
  if (error) {
    console.error('Failed to save material facts:', error);
    throw new Error(`Failed to save facts: ${error.message}`);
  }
}

async function saveProductsToDb(
  docId: string,
  blockDbId: string,
  products: ProductFactItem[],
  sourceSection: string,
): Promise<void> {
  if (products.length === 0) return;

  const rows = products.map(p => ({
    doc_id: docId,
    block_id: blockDbId,
    assembly_mark: p.assembly_mark,
    assembly_name: p.assembly_name,
    canonical_key: p.canonical_key || generateCanonicalKey(p.assembly_mark),
    quantity: p.quantity,
    unit: p.unit,
    source_section: sourceSection,
    description: p.description,
    note: p.note,
    source_snippet: p.source_snippet,
    confidence: p.confidence,
    user_verified: false,
  }));

  const { error } = await supabase.from('product_facts').insert(rows);
  if (error) {
    console.error('Failed to save product facts:', error);
    throw new Error(`Failed to save products: ${error.message}`);
  }
}
