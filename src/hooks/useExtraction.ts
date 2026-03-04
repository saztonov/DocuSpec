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
  enrichMaterialFacts,
  detectQtyScope,
  FALLBACK_PROMPT_UNIVERSAL,
  FALLBACK_PROMPT_LAYER_CAKE,
  FALLBACK_PROMPT_GLOSSARY,
} from '../lib/extraction.ts';
import { generateCanonicalKey } from '../lib/canonical.ts';
import { ExtractionLogger } from '../lib/extractionLogger.ts';
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
  const [lastLogger, setLastLogger] = useState<ExtractionLogger | null>(null);

  const runExtraction = useCallback(async (model?: string) => {
    const logger = new ExtractionLogger();
    try {
      logger.logStart();

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

      logger.logPrompts({ universal: universalPrompt, layerCake: layerCakePrompt, glossary: glossaryPrompt });

      // ── Загрузить документ и section.code ──
      setProgress(p => ({ ...p, status: 'rule_based', phase: 'Загрузка документа', errorMessage: null }));

      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('raw_md, section_id, filename')
        .eq('id', docId)
        .single();

      if (docError) throw new Error(`Ошибка загрузки документа: ${docError.message}`);
      if (!doc?.raw_md) throw new Error('Документ не найден или raw_md пуст');

      logger.logSessionInit(docId, doc.filename || 'unknown', model || 'default');

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

      // ── Логирование парсинга ──
      {
        let textBlocks = 0;
        let imgBlocks = 0;
        let errorBlocks = 0;
        for (const page of parsed.pages) {
          for (const block of page.blocks) {
            if (block.hasError) errorBlocks++;
            if (block.type === 'TEXT') textBlocks++;
            else if (block.type === 'IMAGE') imgBlocks++;
          }
        }
        logger.logParsingResult({
          totalPages: parsed.pages.length,
          totalBlocks: parsed.pages.reduce((sum, p) => sum + p.blocks.length, 0),
          textBlocks,
          imageBlocks: imgBlocks,
          errorBlocks,
        });
      }

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
        const glossaryItems = await llmExtractGlossary(glossaryChunks, glossaryPrompt, model, logger);

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

        const byType: Record<string, number> = {};
        for (const item of glossaryItems) {
          byType[item.item_type] = (byType[item.item_type] || 0) + 1;
        }
        logger.logGlossaryResult(glossaryChunks.length, glossaryItems.length, byType);
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
          if (block.hasError) {
            logger.logBlockClassification({ blockUid: block.uid, blockType: block.type, pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'skipped', skipReason: `Ошибка: ${block.errorText || 'unknown'}` });
            continue;
          }
          const dbBlock = blockUidToDbBlock.get(block.uid);
          if (!dbBlock) {
            logger.logBlockClassification({ blockUid: block.uid, blockType: block.type, pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'skipped', skipReason: 'Нет в БД (block_uid не найден)' });
            continue;
          }

          if (block.type === 'TEXT') {
            const sectionLower = (block.sectionTitle || '').toLowerCase();
            const isGeneralSection = /общие указания|общие характеристики|общие данные|условные обозначения|общие сведения/.test(sectionLower);
            if (isGeneralSection) {
              logger.logBlockClassification({ blockUid: block.uid, blockType: 'TEXT', pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'skipped', skipReason: `Общая секция: "${block.sectionTitle}"` });
              continue;
            }

            if (block.hasTable) {
              const categories = block.tables.map(t => classifyTable(t));
              const hasVedomost = categories.some(c => isVedomostMaterialov(c));
              const hasAssemblySpec = categories.some(c => isAssemblySpec(c));
              const hasVedomostIzd = categories.some(c => c === 'vedomost_izdelij');
              const hasExtractable = categories.some(c => isExtractableCategory(c) && !isVedomostMaterialov(c) && !isAssemblySpec(c));

              const assignedPhases: string[] = [];

              if (hasVedomost) {
                vedomostBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'vedomost_materialov', blockTypeDisplay: 'Таблица',
                });
                assignedPhases.push('vedomost');
              }
              if (hasAssemblySpec) {
                assemblyBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'assembly_spec', blockTypeDisplay: 'Таблица',
                });
                assignedPhases.push('assembly');
              }
              if (hasVedomostIzd) {
                productListBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'vedomost_izdelij', blockTypeDisplay: 'Таблица',
                });
                assignedPhases.push('products');
              }
              if (hasExtractable) {
                specBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya', blockTypeDisplay: 'Таблица',
                });
                assignedPhases.push('spec');
              }
              const hasUnknown = categories.some(c => c === 'unknown');
              if (hasUnknown && !hasVedomost && !hasExtractable && !hasAssemblySpec && !hasVedomostIzd) {
                specBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya', blockTypeDisplay: 'Таблица',
                });
                assignedPhases.push('spec(unknown)');
              }

              logger.logBlockClassification({
                blockUid: block.uid, blockType: 'TEXT', pageNo: page.pageNo,
                sectionTitle: block.sectionTitle ?? null,
                tableCategories: categories,
                assignedPhase: assignedPhases.length > 0 ? assignedPhases.join('+') : 'skipped',
                skipReason: assignedPhases.length === 0 ? `Таблицы [${categories.join(', ')}] не extractable` : undefined,
              });
            } else {
              const hasQuantityPattern = /\d+[,.]?\d*\s*(шт|м2|м3|м\.п\.|кг(?![\s]*\/)|т(?![\s]*\/|олщ)|л(?!ист|ин)|компл|слоя?)/i.test(block.content);
              if (hasQuantityPattern) {
                specBlocks.push({
                  block, pageNo: page.pageNo, blockDbId: dbBlock.id,
                  sectionContext: block.sectionTitle,
                  sourceSection: 'spetsifikatsiya', blockTypeDisplay: 'Текст',
                });
                logger.logBlockClassification({ blockUid: block.uid, blockType: 'TEXT', pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'spec(text)' });
              } else {
                logger.logBlockClassification({ blockUid: block.uid, blockType: 'TEXT', pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'skipped', skipReason: 'Нет таблиц и нет паттерна количества' });
              }
            }
          } else if (block.type === 'IMAGE') {
            const contentLower = block.content.toLowerCase();
            if (contentLower.includes('тип: легенда') || contentLower.includes('тип: план')) {
              logger.logBlockClassification({ blockUid: block.uid, blockType: 'IMAGE', pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'skipped', skipReason: 'IMAGE тип: легенда/план' });
              continue;
            }
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
              logger.logBlockClassification({ blockUid: block.uid, blockType: 'IMAGE', pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'image' });
            } else {
              logger.logBlockClassification({ blockUid: block.uid, blockType: 'IMAGE', pageNo: page.pageNo, sectionTitle: block.sectionTitle ?? null, tableCategories: [], assignedPhase: 'skipped', skipReason: isCrossSection ? 'Нет "Текст на чертеже:"' : 'IMAGE не разрез/сечение/узел' });
            }
          }
        }
      }

      let totalFacts = 0;

      // ── Логирование классификации ──
      const totalClassified = vedomostBlocks.length + specBlocks.length + assemblyBlocks.length + productListBlocks.length + imageBlocks.length;
      logger.logClassification({
        vedomost: vedomostBlocks.length,
        spec: specBlocks.length,
        assembly: assemblyBlocks.length,
        products: productListBlocks.length,
        images: imageBlocks.length,
        skipped: dbBlocks.length - totalClassified,
        total: dbBlocks.length,
      });

      // ════════════════════════════════════════════════════════
      // ФАЗА 1: Ведомости материалов
      // ════════════════════════════════════════════════════════
      setProgress(p => ({
        ...p, status: 'rule_based', phase: 'Фаза 1: Ведомости материалов',
        completedBatches: 0, totalBatches: vedomostBlocks.length,
      }));

      const vedomostNeedingLlm: BlockForExtraction[] = [];
      let phase1RuleFacts = 0;

      for (const bfe of vedomostBlocks) {
        const ruleItems = ruleBasedExtract(bfe.block);
        logger.logRuleBasedExtraction(bfe.block.uid, 'Фаза 1', ruleItems);
        if (ruleItems.length > 0) {
          await saveFactsToDb(docId, bfe.blockDbId, ruleItems, 'vedomost_materialov', 'Таблица', bfe.sectionContext, glossaryMap);
          totalFacts += ruleItems.length;
          phase1RuleFacts += ruleItems.length;
        } else {
          vedomostNeedingLlm.push(bfe);
        }
      }

      let phase1LlmFacts = 0;
      if (vedomostNeedingLlm.length > 0) {
        setProgress(p => ({
          ...p, status: 'llm_extracting', phase: 'Фаза 1: Ведомости материалов (LLM)',
          completedBatches: 0, totalBatches: vedomostNeedingLlm.length, extractedFacts: totalFacts,
        }));

        const promptWithGlossary1 = buildPromptWithGlossary(universalPrompt, glossaryMap);
        logger.logPromptWithGlossary(promptWithGlossary1);

        const llmVedomost = await llmExtractBatch(
          vedomostNeedingLlm,
          promptWithGlossary1,
          (completed, total) => setProgress(p => ({ ...p, completedBatches: completed, totalBatches: total })),
          model,
          logger,
          'Фаза 1',
        );

        for (const [blockDbId, items] of llmVedomost) {
          const filtered = filterLlmItemsWithLog(items, blockDbId, 'Фаза 1', logger);
          if (filtered.length > 0) {
            const bfe = vedomostNeedingLlm.find(b => b.blockDbId === blockDbId);
            await saveFactsToDb(docId, blockDbId, filtered, 'vedomost_materialov', 'Таблица', bfe?.sectionContext, glossaryMap);
            totalFacts += filtered.length;
            phase1LlmFacts += filtered.length;
          }
        }
      }

      logger.logPhaseSummary('Фаза 1', {
        ruleBasedBlocks: vedomostBlocks.length - vedomostNeedingLlm.length,
        ruleBasedFacts: phase1RuleFacts,
        llmBlocks: vedomostNeedingLlm.length,
        llmFacts: phase1LlmFacts,
      });
      logger.addMaterialFacts(phase1RuleFacts + phase1LlmFacts);

      // ════════════════════════════════════════════════════════
      // ФАЗА 2: Спецификации
      // ════════════════════════════════════════════════════════
      setProgress(p => ({
        ...p, status: 'llm_extracting', phase: 'Фаза 2: Спецификации',
        completedBatches: 0, totalBatches: specBlocks.length, extractedFacts: totalFacts,
      }));

      const specRuleResults = new Map<string, MaterialFactItem[]>();
      const specNeedingLlm: BlockForExtraction[] = [];
      let phase2RuleFacts = 0;

      for (const bfe of specBlocks) {
        if (bfe.block.hasTable) {
          const ruleItems = ruleBasedExtract(bfe.block);
          logger.logRuleBasedExtraction(bfe.block.uid, 'Фаза 2', ruleItems);
          const hasComplexTables = bfe.block.tables.some(t => {
            const cat = classifyTable(t);
            return isExtractableCategory(cat) && cat !== 'material_qty' && cat !== 'element_spec' && cat !== 'spec_elements' && cat !== 'vedomost_materialov';
          });
          const hasUnknownTables = bfe.block.tables.some(t => classifyTable(t) === 'unknown');

          if (ruleItems.length > 0) {
            specRuleResults.set(bfe.blockDbId, ruleItems);
            await saveFactsToDb(docId, bfe.blockDbId, ruleItems, 'spetsifikatsiya', bfe.blockTypeDisplay ?? 'Таблица', bfe.sectionContext, glossaryMap);
            totalFacts += ruleItems.length;
            phase2RuleFacts += ruleItems.length;
          }

          if (hasComplexTables || hasUnknownTables || ruleItems.length === 0) {
            specNeedingLlm.push(bfe);
          }
        } else {
          specNeedingLlm.push(bfe);
        }
      }

      let phase2LlmFacts = 0;
      if (specNeedingLlm.length > 0) {
        const llmSpec = await llmExtractBatch(
          specNeedingLlm,
          buildPromptWithGlossary(universalPrompt, glossaryMap),
          (completed, total) => setProgress(p => ({ ...p, completedBatches: completed, totalBatches: total })),
          model,
          logger,
          'Фаза 2',
        );

        setProgress(p => ({ ...p, status: 'merging', phase: 'Фаза 2: Сохранение спецификаций' }));

        for (const [blockDbId, llmItems] of llmSpec) {
          const filtered = filterLlmItemsWithLog(llmItems, blockDbId, 'Фаза 2', logger);
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
            await saveFactsToDb(docId, blockDbId, llmUnique, 'spetsifikatsiya', blockTypeDisplay, bfe?.sectionContext, glossaryMap);
            totalFacts += llmUnique.length;
            phase2LlmFacts += llmUnique.length;
          }
        }
      }

      logger.logPhaseSummary('Фаза 2', {
        ruleBasedBlocks: specBlocks.length - specNeedingLlm.length,
        ruleBasedFacts: phase2RuleFacts,
        llmBlocks: specNeedingLlm.length,
        llmFacts: phase2LlmFacts,
      });
      logger.addMaterialFacts(phase2RuleFacts + phase2LlmFacts);

      // ════════════════════════════════════════════════════════
      // ФАЗА 2b: Спецификации сборок (assembly_spec)
      // ════════════════════════════════════════════════════════
      if (assemblyBlocks.length > 0) {
        setProgress(p => ({
          ...p, status: 'rule_based', phase: 'Фаза 2b: Спецификации изделий',
          completedBatches: 0, totalBatches: assemblyBlocks.length, extractedFacts: totalFacts,
        }));

        let phase2bMaterials = 0;
        let phase2bProducts = 0;

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
            await saveFactsToDb(docId, bfe.blockDbId, allMaterials, 'assembly_spec', 'Таблица', bfe.sectionContext, glossaryMap);
            totalFacts += allMaterials.length;
            phase2bMaterials += allMaterials.length;
          }
          if (allProducts.length > 0) {
            await saveProductsToDb(docId, bfe.blockDbId, allProducts, 'assembly_spec', bfe.sectionContext);
            phase2bProducts += allProducts.length;
          }
        }

        logger.logPhaseSummary('Фаза 2b', {
          ruleBasedBlocks: assemblyBlocks.length,
          ruleBasedFacts: phase2bMaterials,
          llmBlocks: 0,
          llmFacts: 0,
        });
        logger.addMaterialFacts(phase2bMaterials);
        logger.addProductFacts(phase2bProducts);
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
          logger,
          'Фаза 2c',
        );

        let phase2cProducts = 0;
        for (const [blockDbId, items] of llmProducts) {
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
            const bfe = productListBlocks.find(b => b.blockDbId === blockDbId);
            await saveProductsToDb(docId, blockDbId, products, 'vedomost_izdelij', bfe?.sectionContext);
            phase2cProducts += products.length;
          }
        }

        logger.logPhaseSummary('Фаза 2c', {
          ruleBasedBlocks: 0,
          ruleBasedFacts: 0,
          llmBlocks: productListBlocks.length,
          llmFacts: phase2cProducts,
        });
        logger.addProductFacts(phase2cProducts);
      }

      // ════════════════════════════════════════════════════════
      // ДВИЖОК УМНОЖЕНИЯ: assembly_spec × vedomost_izdelij
      // ════════════════════════════════════════════════════════
      if (assemblyBlocks.length > 0 && productListBlocks.length > 0) {
        setProgress(p => ({
          ...p, status: 'merging', phase: 'Умножение: состав изделий × ведомость',
        }));

        // Загрузить сохранённые product_facts (ведомость изделий → количество по маркам)
        const { data: savedProducts } = await supabase
          .from('product_facts')
          .select('assembly_mark, quantity, qty_scope')
          .eq('doc_id', docId)
          .eq('source_section', 'vedomost_izdelij');

        // Загрузить material_facts из assembly_spec (компоненты "на 1 изделие")
        const { data: assemblyMaterials } = await supabase
          .from('material_facts')
          .select('id, construction, raw_name, canonical_name, canonical_key, quantity, unit, mark, gost, description, note, source_snippet, confidence, qty_scope')
          .eq('doc_id', docId)
          .eq('source_section', 'assembly_spec');

        if (savedProducts && savedProducts.length > 0 && assemblyMaterials && assemblyMaterials.length > 0) {
          // Сформировать map марка → общее кол-во изделий
          const productQtyMap = new Map<string, number>();
          for (const p of savedProducts) {
            if (p.quantity != null && p.quantity > 0) {
              const existing = productQtyMap.get(p.assembly_mark) ?? 0;
              productQtyMap.set(p.assembly_mark, existing + p.quantity);
            }
          }

          const derivedRows: Array<Record<string, unknown>> = [];

          for (const mat of assemblyMaterials) {
            const mark = mat.construction;
            if (!mark || !productQtyMap.has(mark)) continue;
            if (mat.quantity == null) continue;

            const productQty = productQtyMap.get(mark)!;

            // Определяем scope материала
            const matScope = mat.qty_scope as string | null;

            if (matScope === 'per_unit') {
              // Точно "на 1 изделие" — умножаем
              derivedRows.push({
                doc_id: docId,
                block_id: null,
                raw_name: mat.raw_name,
                canonical_name: mat.canonical_name,
                canonical_key: mat.canonical_key,
                construction: mark,
                quantity: mat.quantity * productQty,
                unit: mat.unit,
                mark: mat.mark,
                gost: mat.gost,
                description: mat.description,
                note: mat.note,
                source_snippet: mat.source_snippet,
                source_section: 'assembly_total',
                block_type_display: 'Расчёт',
                table_category: 'assembly_total',
                confidence: Math.min(mat.confidence, 0.85),
                user_verified: false,
                kind: 'material',
                qty_scope: 'total',
                needs_review: false,
                derived_from_fact_id: mat.id,
                multiplier: productQty,
                calc_note: `${mark} × ${productQty} шт: ${mat.quantity} × ${productQty} = ${mat.quantity * productQty}`,
              });
            } else if (matScope === 'total') {
              // Уже "на все" — не умножаем, пропускаем
            } else {
              // scope неизвестен — НЕ умножаем, помечаем needs_review на исходном факте
              await supabase
                .from('material_facts')
                .update({ needs_review: true, qty_scope: 'unknown' })
                .eq('id', mat.id);
            }
          }

          if (derivedRows.length > 0) {
            const { error: derivedErr } = await supabase.from('material_facts').insert(derivedRows);
            if (derivedErr) {
              console.error('Failed to save derived facts:', derivedErr);
            } else {
              totalFacts += derivedRows.length;
              logger.addMaterialFacts(derivedRows.length);
            }
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

      let phase3Facts = 0;
      let phase3ImagesWithUrl = 0;

      for (let i = 0; i < imageBlocks.length; i++) {
        const bfe = imageBlocks[i];
        if (bfe.imageUrl) phase3ImagesWithUrl++;

        const items = await llmExtractImageBlock(bfe, layerCakePrompt, model, logger);
        const filtered = items.filter(item => item.source_snippet);

        if (filtered.length > 0) {
          await saveFactsToDb(docId, bfe.blockDbId, filtered, 'pirog', 'Изображение', bfe.sectionContext, glossaryMap);
          totalFacts += filtered.length;
          phase3Facts += filtered.length;
        }

        setProgress(p => ({ ...p, completedBatches: i + 1, extractedFacts: totalFacts }));

        if (i < imageBlocks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      logger.setImageStats(phase3ImagesWithUrl, imageBlocks.length);
      logger.logPhaseSummary('Фаза 3', {
        ruleBasedBlocks: 0,
        ruleBasedFacts: 0,
        llmBlocks: imageBlocks.length,
        llmFacts: phase3Facts,
      });
      logger.addMaterialFacts(phase3Facts);

      // ── Финализация ──
      setProgress(p => ({ ...p, status: 'saving', phase: 'Сохранение' }));

      const tokens = logger.getTokenUsage();

      await supabase
        .from('documents')
        .update({
          status: 'done',
          prompt_tokens: tokens.prompt_tokens,
          completion_tokens: tokens.completion_tokens,
          total_tokens: tokens.total_tokens,
        })
        .eq('id', docId);

      const totalBlocks = vedomostBlocks.length + specBlocks.length + assemblyBlocks.length + productListBlocks.length + imageBlocks.length;
      setProgress({
        status: 'done',
        phase: undefined,
        completedBatches: totalBlocks,
        totalBatches: totalBlocks,
        extractedFacts: totalFacts,
        errorMessage: null,
        promptTokens: tokens.prompt_tokens,
        completionTokens: tokens.completion_tokens,
        totalTokens: tokens.total_tokens,
      });

      logger.logFinalSummary();
      logger.downloadLog();
      setLastLogger(logger);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      console.error('[DocuSpec] Ошибка извлечения:', message);
      logger.logSessionInit(docId, 'error', model || 'unknown');
      logger.logLlmError('global', 'extraction', 'init', message, '', '');
      setProgress(p => ({ ...p, status: 'error', errorMessage: message }));
      await supabase
        .from('documents')
        .update({ status: 'error', error_message: message })
        .eq('id', docId);
      logger.downloadLog();
      setLastLogger(logger);
    }
  }, [docId]);

  return { progress, runExtraction, lastLogger };
}

/**
 * Inject glossary context into system prompt if glossary is non-empty.
 */
function buildPromptWithGlossary(systemPrompt: string, glossaryMap: GlossaryMap): string {
  if (glossaryMap.size === 0) return systemPrompt;

  const assemblyEntries = [...glossaryMap.values()].filter(e => e.item_type === 'assembly');
  const equipmentEntries = [...glossaryMap.values()].filter(e => e.item_type === 'equipment');

  if (assemblyEntries.length === 0 && equipmentEntries.length === 0) return systemPrompt;

  const parts: string[] = [];

  if (assemblyEntries.length > 0) {
    const assemblyContext = assemblyEntries
      .slice(0, 40)
      .map(e => `- ${e.code}: assembly — "${e.description || 'сборная единица'}" → NOT a material, NOT a component`)
      .join('\n');
    parts.push(`ASSEMBLIES (do NOT extract as materials):\n${assemblyContext}`);
  }

  if (equipmentEntries.length > 0) {
    const equipmentContext = equipmentEntries
      .slice(0, 20)
      .map(e => `- ${e.code}: equipment — "${e.description || 'оборудование'}" → classify as EQUIPMENT, not material`)
      .join('\n');
    parts.push(`EQUIPMENT (classify separately from materials):\n${equipmentContext}`);
  }

  return `${systemPrompt}\n\nDOCUMENT GLOSSARY:\n${parts.join('\n\n')}`;
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

function categorizeDropReason(item: MaterialFactItem): string {
  if (item.unit === null && item.confidence < 0.85) return 'no_quantity_low_confidence';
  const nameLower = (item.canonical_name || item.raw_name).toLowerCase();
  if (/^(элементы|ограждения|перегородки|поручни|покрытия|наружная|стены|стена)\b/.test(nameLower) && item.quantity === null) return 'generic_header_no_quantity';
  return 'unknown';
}

function filterLlmItemsWithLog(items: MaterialFactItem[], blockDbId: string, phase: string, logger: ExtractionLogger): MaterialFactItem[] {
  const result = filterLlmItems(items);
  if (items.length !== result.length) {
    const resultSet = new Set(result);
    const dropped = items.filter(i => !resultSet.has(i));
    logger.logFilterResult({
      blockDbId,
      phase,
      inputCount: items.length,
      outputCount: result.length,
      droppedItems: dropped.map(i => ({ raw_name: i.raw_name, reason: categorizeDropReason(i) })),
    });
  }
  return result;
}

async function saveFactsToDb(
  docId: string,
  blockDbId: string,
  items: MaterialFactItem[],
  sourceSection: string,
  blockTypeDisplay: string,
  sectionContext?: string | null,
  glossaryMap?: GlossaryMap,
): Promise<void> {
  if (items.length === 0) return;

  const enriched = enrichMaterialFacts(items, sectionContext ?? null, glossaryMap);

  const rows = enriched.map(item => ({
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
    kind: item.kind ?? 'material',
    qty_scope: item.qty_scope ?? null,
    needs_review: item.needs_review ?? false,
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
  sectionContext?: string | null,
): Promise<void> {
  if (products.length === 0) return;

  const qtyScope = detectQtyScope(sectionContext ?? null);

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
    kind: p.kind ?? 'product',
    qty_scope: p.qty_scope ?? qtyScope ?? null,
    needs_review: p.needs_review ?? (p.confidence < 0.5),
    extra_params: p.extra_params ?? null,
  }));

  const { error } = await supabase.from('product_facts').insert(rows);
  if (error) {
    console.error('Failed to save product facts:', error);
    throw new Error(`Failed to save products: ${error.message}`);
  }
}
