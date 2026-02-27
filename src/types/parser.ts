export interface ParsedTable {
  headers: string[];
  rows: string[][];
  sectionContext: string | null;
}

export interface ParsedBlock {
  uid: string;
  type: 'TEXT' | 'IMAGE';
  content: string;
  hasTable: boolean;
  hasError: boolean;
  errorText: string | null;
  sectionTitle: string | null;
  tables: ParsedTable[];
}

export interface ParsedPage {
  pageNo: number;
  sheetLabel: string | null;
  sheetName: string | null;
  blocks: ParsedBlock[];
}

export interface ParsedDocument {
  title: string;
  generated: string | null;
  stampText: string | null;
  docCode: string | null;
  pages: ParsedPage[];
  totalBlocks: number;
  errorBlocks: number;
}
