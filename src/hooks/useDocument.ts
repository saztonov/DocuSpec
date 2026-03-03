import { useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { parseDocument } from '../lib/parser.ts';
import type { DocumentStatus } from '../types/database.ts';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Parse _result.json companion file and extract image URLs by block UID.
 * URLs are found in ocr_html field as href="https://..." for IMAGE blocks.
 */
function parseImageUrlsFromJson(jsonText: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const data = JSON.parse(jsonText);
    const blocks: unknown[] = Array.isArray(data) ? data : (data?.blocks ?? data?.pages?.flatMap((p: { blocks?: unknown[] }) => p.blocks ?? []) ?? []);
    for (const block of blocks) {
      if (typeof block !== 'object' || !block) continue;
      const b = block as Record<string, unknown>;
      const uid = typeof b['block_uid'] === 'string' ? b['block_uid'] : null;
      const blockType = typeof b['block_type'] === 'string' ? b['block_type'] : '';
      const ocrHtml = typeof b['ocr_html'] === 'string' ? b['ocr_html'] : '';
      if (!uid || blockType.toUpperCase() !== 'IMAGE' || !ocrHtml) continue;
      const match = ocrHtml.match(/href="(https:\/\/[^"]+)"/);
      if (match) {
        map.set(uid, match[1]);
      }
    }
  } catch {
    // Ignore JSON parse errors — treat as no images
  }
  return map;
}

export function useDocument() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadDocument(
    file: File,
    options?: { projectId?: string; sectionId?: string; jsonFile?: File },
  ): Promise<string> {
    setLoading(true);
    setError(null);

    try {
      // 1. Read MD file
      const mdText = await readFileAsText(file);

      // 2. Parse JSON companion if provided
      let imageUrlMap = new Map<string, string>();
      if (options?.jsonFile) {
        const jsonText = await readFileAsText(options.jsonFile);
        imageUrlMap = parseImageUrlsFromJson(jsonText);
      }

      // 3. Parse document
      const parsed = parseDocument(mdText);

      // 4. Insert document record with status='parsing'
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: 'anonymous',
          filename: file.name,
          raw_md: mdText,
          doc_code: parsed.docCode,
          stamp_text: parsed.stampText,
          project_id: options?.projectId ?? null,
          section_id: options?.sectionId ?? null,
          status: 'parsing' as DocumentStatus,
          error_blocks_count: 0,
          page_count: null,
          block_count: null,
          error_message: null,
        })
        .select('id')
        .single();

      if (docError || !docData) {
        throw new Error(`Document insert failed: ${docError?.message ?? 'no data returned'}`);
      }

      const docId: string = docData.id;

      // 5. Insert pages and blocks
      let totalBlockCount = 0;
      let errorBlockCount = 0;

      for (const page of parsed.pages) {
        const { data: pageData, error: pageError } = await supabase
          .from('doc_pages')
          .insert({
            doc_id: docId,
            page_no: page.pageNo,
            sheet_label: page.sheetLabel,
            sheet_name: page.sheetName,
          })
          .select('id')
          .single();

        if (pageError || !pageData) {
          throw new Error(`Page insert failed: ${pageError?.message ?? 'no data returned'}`);
        }

        const pageId: string = pageData.id;

        for (const block of page.blocks) {
          const imageUrl = imageUrlMap.get(block.uid) ?? null;

          const { error: blockError } = await supabase
            .from('doc_blocks')
            .insert({
              doc_id: docId,
              page_id: pageId,
              block_uid: block.uid,
              block_type: block.type,
              content: block.content,
              has_table: block.hasTable,
              has_error: block.hasError,
              error_text: block.errorText,
              section_title: block.sectionTitle,
              image_url: imageUrl,
            });

          if (blockError) {
            throw new Error(`Block insert failed: ${blockError.message}`);
          }

          totalBlockCount++;
          if (block.hasError) errorBlockCount++;
        }
      }

      // 6. Update document with final counts and status
      const finalStatus: DocumentStatus = errorBlockCount > 0 ? 'has_errors' : 'done';

      const { error: updateError } = await supabase
        .from('documents')
        .update({
          status: finalStatus,
          page_count: parsed.pages.length,
          block_count: totalBlockCount,
          error_blocks_count: errorBlockCount,
        })
        .eq('id', docId);

      if (updateError) {
        throw new Error(`Document update failed: ${updateError.message}`);
      }

      return docId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown upload error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function deleteDocument(docId: string): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const { error: delError } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);
      if (delError) {
        throw new Error(`Ошибка удаления документа: ${delError.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка удаления';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { uploadDocument, deleteDocument, loading, error };
}
