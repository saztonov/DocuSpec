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

export function useDocument() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadDocument(file: File): Promise<string> {
    setLoading(true);
    setError(null);

    try {
      // 1. Read file as text
      const mdText = await readFileAsText(file);

      // 2. Parse with parseDocument
      const parsed = parseDocument(mdText);

      // 3. Upload raw file to Supabase Storage
      const storagePath = `${crypto.randomUUID()}/${file.name}`;
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file);

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      // 4. Insert document record with status='parsing'
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: 'anonymous',
          filename: file.name,
          storage_path: storagePath,
          doc_code: parsed.docCode,
          stamp_text: parsed.stampText,
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

      // 5 & 6. Insert pages and blocks
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
            });

          if (blockError) {
            throw new Error(`Block insert failed: ${blockError.message}`);
          }

          totalBlockCount++;
          if (block.hasError) errorBlockCount++;
        }
      }

      // 7. Update document with final counts and status
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

      // 8. Return the document id
      return docId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown upload error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { uploadDocument, loading, error };
}
