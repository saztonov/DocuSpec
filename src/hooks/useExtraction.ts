import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import { parseDocument } from '../lib/parser.ts';
import { classifyTable, isExtractableCategory } from '../lib/tableClassifier.ts';
import { ruleBasedExtract, llmExtractBatch, mergeResults } from '../lib/extraction.ts';
import { generateCanonicalKey } from '../lib/canonical.ts';
import type { ExtractionProgress, MaterialFactItem } from '../types/extraction.ts';
import type { BlockForExtraction } from '../lib/extraction.ts';
import type { DbDocBlock } from '../types/database.ts';

export function useExtraction(docId: string) {
  const [progress, setProgress] = useState<ExtractionProgress>({
    status: 'idle',
    completedBatches: 0,
    totalBatches: 0,
    extractedFacts: 0,
    errorMessage: null,
  });

  const runExtraction = useCallback(async () => {
    try {
      // Update document status
      await supabase
        .from('documents')
        .update({ status: 'extracting' })
        .eq('id', docId);

      // Clear existing material_facts for this document
      await supabase
        .from('material_facts')
        .delete()
        .eq('doc_id', docId);

      // 1. Load the document file from storage to re-parse
      setProgress(p => ({ ...p, status: 'rule_based', errorMessage: null }));

      const { data: doc } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', docId)
        .single();

      if (!doc) throw new Error('Document not found');

      const { data: fileData } = await supabase.storage
        .from('documents')
        .download(doc.storage_path);

      if (!fileData) throw new Error('Could not download document file');

      const mdText = await fileData.text();
      const parsed = parseDocument(mdText);

      // 2. Load block DB records to get their IDs
      const { data: dbBlocks } = await supabase
        .from('doc_blocks')
        .select('id, block_uid, has_table, has_error, page_id')
        .eq('doc_id', docId);

      if (!dbBlocks) throw new Error('Could not load blocks');

      // Load pages for page_no mapping
      const { data: dbPages } = await supabase
        .from('doc_pages')
        .select('id, page_no')
        .eq('doc_id', docId);

      const _pageIdToNo = new Map((dbPages ?? []).map(p => [p.id, p.page_no as number]));
      void _pageIdToNo; // reserved for future use
      const blockUidToDbId = new Map((dbBlocks as DbDocBlock[]).map(b => [b.block_uid, b.id]));

      // 3. Rule-based extraction from parsed tables
      const ruleBasedResults = new Map<string, MaterialFactItem[]>();
      const blocksNeedingLlm: BlockForExtraction[] = [];

      for (const page of parsed.pages) {
        for (const block of page.blocks) {
          if (block.hasError || block.type !== 'TEXT') continue;

          const dbId = blockUidToDbId.get(block.uid);
          if (!dbId) continue;

          // Try rule-based extraction first
          if (block.hasTable) {
            const ruleItems = ruleBasedExtract(block);
            if (ruleItems.length > 0) {
              ruleBasedResults.set(dbId, ruleItems);
            }

            // Check if any tables need LLM (non-trivial categories)
            const hasComplexTables = block.tables.some(t => {
              const cat = classifyTable(t);
              return isExtractableCategory(cat) && cat !== 'material_qty' && cat !== 'element_spec' && cat !== 'spec_elements';
            });

            const hasUnknownTables = block.tables.some(t => classifyTable(t) === 'unknown');

            if (hasComplexTables || hasUnknownTables || ruleItems.length === 0) {
              blocksNeedingLlm.push({
                block,
                pageNo: page.pageNo,
                blockDbId: dbId,
                sectionContext: block.sectionTitle,
              });
            }
          } else {
            // Text blocks without tables — might still contain material mentions
            // Only send to LLM if content seems relevant (has quantity-like patterns)
            const hasQuantityPattern = /\d+[,.]?\d*\s*(шт|м2|м3|м\.п\.|кг|т|л|компл)/i.test(block.content);
            if (hasQuantityPattern) {
              blocksNeedingLlm.push({
                block,
                pageNo: page.pageNo,
                blockDbId: dbId,
                sectionContext: block.sectionTitle,
              });
            }
          }
        }
      }

      // 4. Save rule-based results immediately
      let totalFacts = 0;
      for (const [blockDbId, items] of ruleBasedResults) {
        await saveFactsToDb(docId, blockDbId, items, 'rule_based');
        totalFacts += items.length;
      }

      setProgress({
        status: 'llm_extracting',
        completedBatches: 0,
        totalBatches: blocksNeedingLlm.length,
        extractedFacts: totalFacts,
        errorMessage: null,
      });

      // 5. LLM extraction for remaining blocks
      if (blocksNeedingLlm.length > 0) {
        const llmResults = await llmExtractBatch(
          blocksNeedingLlm,
          (completed, total) => {
            setProgress(p => ({
              ...p,
              completedBatches: completed,
              totalBatches: total,
            }));
          },
        );

        // 6. Merge and save LLM results
        setProgress(p => ({ ...p, status: 'merging' }));

        for (const [blockDbId, llmItems] of llmResults) {
          const ruleItems = ruleBasedResults.get(blockDbId) ?? [];
          const merged = mergeResults(ruleItems, llmItems);

          // Only save LLM-unique items (rule-based already saved)
          const ruleKeys = new Set(ruleItems.map(i =>
            `${i.raw_name.toLowerCase().trim()}|${i.quantity ?? ''}|${(i.unit || '').toLowerCase()}`
          ));
          const llmUnique = merged.filter(i => {
            const key = `${i.raw_name.toLowerCase().trim()}|${i.quantity ?? ''}|${(i.unit || '').toLowerCase()}`;
            return !ruleKeys.has(key);
          });

          if (llmUnique.length > 0) {
            await saveFactsToDb(docId, blockDbId, llmUnique, 'llm');
            totalFacts += llmUnique.length;
          }
        }
      }

      // 7. Update document status
      setProgress(p => ({ ...p, status: 'saving' }));

      await supabase
        .from('documents')
        .update({ status: 'done' })
        .eq('id', docId);

      setProgress({
        status: 'done',
        completedBatches: blocksNeedingLlm.length,
        totalBatches: blocksNeedingLlm.length,
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

async function saveFactsToDb(
  docId: string,
  blockDbId: string,
  items: MaterialFactItem[],
  source: 'rule_based' | 'llm',
): Promise<void> {
  if (items.length === 0) return;

  const rows = items.map(item => ({
    doc_id: docId,
    block_id: blockDbId,
    raw_name: item.raw_name,
    canonical_name: item.canonical_name || item.raw_name,
    canonical_key: item.canonical_key || generateCanonicalKey(item.raw_name),
    quantity: item.quantity,
    unit: item.unit,
    mark: item.mark,
    gost: item.gost,
    description: item.description,
    note: item.note,
    source_snippet: item.source_snippet,
    table_category: source,
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
