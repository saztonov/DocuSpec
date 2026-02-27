import type { ParsedDocument, ParsedPage, ParsedBlock, ParsedTable } from '../types/parser.ts';

// ── Regex patterns matching the actual document format ──
const PAGE_RE = /^## СТРАНИЦА (\d+)$/;
const SHEET_LABEL_RE = /^\*\*Лист:\*\*\s*(.+)$/;
const SHEET_NAME_RE = /^\*\*Наименование листа:\*\*\s*(.+)$/;
const BLOCK_RE = /^### BLOCK \[(TEXT|IMAGE)\]:\s*([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)$/;
const TABLE_ROW_RE = /^\|.+\|$/;
const TABLE_SEPARATOR_RE = /^\|[\s\-:|]+\|$/;
const ERROR_RE = /\[Ошибка[^\]]*\]/;
const SECTION_RE = /^#{4,6}\s+(.+)$/;
const STAMP_RE = /^\*\*Штамп:\*\*\s*(.+)$/;
const GENERATED_RE = /^Сгенерировано:\s*(.+)$/;

export function parseDocument(mdText: string): ParsedDocument {
  const lines = mdText.split('\n');

  // Extract header metadata (before first page)
  let title = '';
  let generated: string | null = null;
  let stampText: string | null = null;
  let docCode: string | null = null;

  if (lines.length > 0 && lines[0].startsWith('# ')) {
    title = lines[0].replace(/^# /, '');
    // Try to extract doc code from title (e.g. "133/23-ГК-АР1")
    const codeMatch = title.match(/(\d+\/\d+-[А-Яа-яA-Za-z]+-[А-Яа-яA-Za-z0-9]+)/);
    if (codeMatch) docCode = codeMatch[1];
  }

  for (let i = 1; i < Math.min(lines.length, 10); i++) {
    const genMatch = lines[i].match(GENERATED_RE);
    if (genMatch) generated = genMatch[1].trim();
    const stampMatch = lines[i].match(STAMP_RE);
    if (stampMatch) stampText = stampMatch[1].trim();
  }

  // Parse pages and blocks
  const pages: ParsedPage[] = [];
  let currentPage: ParsedPage | null = null;
  let currentBlock: { type: 'TEXT' | 'IMAGE'; uid: string; lines: string[]; startIdx: number } | null = null;

  // State for page metadata (between page header and first block)
  let inPageMetadata = false;

  function finalizeBlock() {
    if (!currentBlock || !currentPage) return;
    const block = buildBlock(currentBlock.uid, currentBlock.type, currentBlock.lines);
    currentPage.blocks.push(block);
    currentBlock = null;
  }

  function finalizePage() {
    finalizeBlock();
    currentPage = null;
    inPageMetadata = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for page header
    const pageMatch = line.match(PAGE_RE);
    if (pageMatch) {
      finalizePage();
      currentPage = {
        pageNo: parseInt(pageMatch[1], 10),
        sheetLabel: null,
        sheetName: null,
        blocks: [],
      };
      pages.push(currentPage);
      inPageMetadata = true;
      continue;
    }

    // Check for page metadata (between page header and first block)
    if (currentPage && inPageMetadata) {
      const labelMatch = line.match(SHEET_LABEL_RE);
      if (labelMatch) {
        currentPage.sheetLabel = labelMatch[1].trim();
        continue;
      }
      const nameMatch = line.match(SHEET_NAME_RE);
      if (nameMatch) {
        currentPage.sheetName = nameMatch[1].trim();
        continue;
      }
      // Empty lines in metadata area are fine
      if (line.trim() === '') continue;
    }

    // Check for block header
    const blockMatch = line.match(BLOCK_RE);
    if (blockMatch) {
      finalizeBlock();
      inPageMetadata = false;

      // If no page exists yet, create a default page 1
      if (!currentPage) {
        currentPage = { pageNo: 1, sheetLabel: null, sheetName: null, blocks: [] };
        pages.push(currentPage);
      }

      currentBlock = {
        type: blockMatch[1] as 'TEXT' | 'IMAGE',
        uid: blockMatch[2],
        lines: [],
        startIdx: i,
      };
      continue;
    }

    // Accumulate content lines into current block
    if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }

  // Finalize last block/page
  finalizePage();

  // Fallback: if no pages were found, treat entire content as page 1
  if (pages.length === 0) {
    const fallbackPage: ParsedPage = {
      pageNo: 1,
      sheetLabel: null,
      sheetName: null,
      blocks: [{
        uid: 'FALLBACK-0000-000',
        type: 'TEXT',
        content: mdText,
        hasTable: TABLE_ROW_RE.test(mdText),
        hasError: ERROR_RE.test(mdText),
        errorText: null,
        sectionTitle: null,
        tables: [],
      }],
    };
    pages.push(fallbackPage);
  }

  // Count totals
  let totalBlocks = 0;
  let errorBlocks = 0;
  for (const page of pages) {
    for (const block of page.blocks) {
      totalBlocks++;
      if (block.hasError) errorBlocks++;
    }
  }

  return {
    title,
    generated,
    stampText,
    docCode,
    pages,
    totalBlocks,
    errorBlocks,
  };
}

function buildBlock(uid: string, type: 'TEXT' | 'IMAGE', contentLines: string[]): ParsedBlock {
  const content = contentLines.join('\n').trim();

  // Detect errors
  const hasError = ERROR_RE.test(content);
  let errorText: string | null = null;
  if (hasError) {
    const errMatch = content.match(/\[Ошибка[^\]]*\]/);
    if (errMatch) errorText = errMatch[0];
  }

  // Detect section titles (#### / ##### / ######)
  let sectionTitle: string | null = null;
  for (const line of contentLines) {
    const secMatch = line.match(SECTION_RE);
    if (secMatch && secMatch[1].trim().length > 0) {
      sectionTitle = secMatch[1].trim();
      break;
    }
  }

  // Detect and parse tables
  const hasTable = contentLines.some(l => TABLE_ROW_RE.test(l));
  const tables: ParsedTable[] = hasTable ? parseTables(contentLines, sectionTitle) : [];

  return {
    uid,
    type,
    content,
    hasTable,
    hasError,
    errorText,
    sectionTitle,
    tables,
  };
}

function parseTables(lines: string[], defaultSection: string | null): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let currentSection = defaultSection;
  let i = 0;

  while (i < lines.length) {
    // Track section titles
    const secMatch = lines[i].match(SECTION_RE);
    if (secMatch) {
      currentSection = secMatch[1].trim();
      i++;
      continue;
    }

    // Look for table start (a row with |)
    if (!TABLE_ROW_RE.test(lines[i])) {
      i++;
      continue;
    }

    // Found potential table start — collect all consecutive table rows
    const tableLines: string[] = [];
    while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
      tableLines.push(lines[i]);
      i++;
    }

    if (tableLines.length < 2) continue; // Need at least header + separator

    // Parse the table
    const table = parseMarkdownTable(tableLines, currentSection);
    if (table) tables.push(table);
  }

  return tables;
}

function parseMarkdownTable(tableLines: string[], sectionContext: string | null): ParsedTable | null {
  if (tableLines.length < 2) return null;

  // First line is headers
  const headers = splitTableRow(tableLines[0]);

  // Second line should be separator (---|---|---)
  // Skip it
  let dataStart = 1;
  if (tableLines.length > 1 && TABLE_SEPARATOR_RE.test(tableLines[1])) {
    dataStart = 2;
  }

  // Sometimes headers are actually in the second data row (when first row is a merged title)
  // We handle this as-is; classifier will deal with interpretation

  const rows: string[][] = [];
  for (let i = dataStart; i < tableLines.length; i++) {
    if (TABLE_SEPARATOR_RE.test(tableLines[i])) continue; // Skip any extra separators
    rows.push(splitTableRow(tableLines[i]));
  }

  return { headers, rows, sectionContext };
}

function splitTableRow(line: string): string[] {
  // Remove leading/trailing |, then split by |
  const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(cell => cell.trim());
}
