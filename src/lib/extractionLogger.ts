/**
 * Structured logging for the document extraction process.
 * Collects metrics across all phases and outputs a summary.
 * Generates a downloadable JSON log file for each extraction session.
 */

const PREFIX = '[DocuSpec]';

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface LlmCallEntry {
  blockUid: string;
  blockType: string; // 'TEXT' | 'IMAGE' | 'glossary'
  phase: string;
  responseKeys: string[];
  itemCount: number;
  usage: LlmUsage | null;
  hasImage: boolean;
  durationMs: number;
}

interface PhaseStats {
  ruleBasedBlocks: number;
  ruleBasedFacts: number;
  llmBlocks: number;
  llmFacts: number;
}

// ── Detailed log interfaces ──

export interface LlmCallDetailedEntry {
  timestamp: string;
  blockUid: string;
  blockType: string;
  phase: string;
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
  parsedItemsCount: number;
  validItemsCount: number;
  droppedItems: Array<{ raw_name: string; reason: string }>;
  responseKeys: string[];
  usage: LlmUsage | null;
  hasImage: boolean;
  durationMs: number;
  error?: string;
}

export interface ClassificationEntry {
  blockUid: string;
  blockType: string;
  pageNo: number;
  sectionTitle: string | null;
  tableCategories: string[];
  assignedPhase: string | null;
  skipReason?: string;
}

export interface FilterLogEntry {
  blockDbId: string;
  phase: string;
  inputCount: number;
  outputCount: number;
  droppedItems: Array<{ raw_name: string; reason: string }>;
}

interface RuleBasedLogEntry {
  blockUid: string;
  phase: string;
  extractedCount: number;
  items: Array<{ raw_name: string; quantity: number | null; unit: string | null }>;
}

export interface SessionLog {
  version: '1.0';
  documentName: string;
  documentId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  model: string;

  prompts: {
    universal: string;
    layerCake: string;
    glossary: string;
    universalWithGlossary?: string;
  };

  parsing: {
    totalPages: number;
    totalBlocks: number;
    textBlocks: number;
    imageBlocks: number;
    errorBlocks: number;
  };

  classification: {
    summary: { vedomost: number; spec: number; assembly: number; products: number; images: number; skipped: number; total: number };
    details: ClassificationEntry[];
  };

  llmCalls: LlmCallDetailedEntry[];

  filterLog: FilterLogEntry[];

  ruleBasedLog: RuleBasedLogEntry[];

  phases: Array<{
    name: string;
    ruleBasedBlocks: number;
    ruleBasedFacts: number;
    llmBlocks: number;
    llmFacts: number;
  }>;

  summary: {
    totalMaterialFacts: number;
    totalProductFacts: number;
    glossaryCodes: number;
    totalLlmCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    imagesSent: number;
    imagesTotal: number;
    errors: string[];
  };
}

export class ExtractionLogger {
  private startTime = Date.now();
  private llmCalls: LlmCallEntry[] = [];
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalTokens = 0;
  private totalMaterialFacts = 0;
  private totalProductFacts = 0;
  private glossaryCount = 0;
  private imagesSent = 0;
  private imagesTotal = 0;

  // ── Detailed log state ──
  private docId = '';
  private docName = '';
  private model = '';
  private prompts: SessionLog['prompts'] = { universal: '', layerCake: '', glossary: '' };
  private parsingResult: SessionLog['parsing'] = { totalPages: 0, totalBlocks: 0, textBlocks: 0, imageBlocks: 0, errorBlocks: 0 };
  private classificationSummary: SessionLog['classification']['summary'] | null = null;
  private classificationDetails: ClassificationEntry[] = [];
  private detailedCalls: LlmCallDetailedEntry[] = [];
  private filterLogEntries: FilterLogEntry[] = [];
  private ruleBasedEntries: RuleBasedLogEntry[] = [];
  private phaseEntries: SessionLog['phases'] = [];
  private errors: string[] = [];

  // ── Existing console.log methods (unchanged) ──

  logStart(): void {
    this.startTime = Date.now();
    console.log(`${PREFIX} ══ Начало извлечения ══`);
  }

  logClassification(counts: {
    vedomost: number;
    spec: number;
    assembly: number;
    products: number;
    images: number;
    skipped: number;
    total: number;
  }): void {
    this.classificationSummary = counts;
    console.log(
      `${PREFIX} Классификация: ${counts.total} блоков → ведомости:${counts.vedomost}, спец:${counts.spec}, сборки:${counts.assembly}, изделия:${counts.products}, пироги:${counts.images}, пропущено:${counts.skipped}`,
    );
  }

  logPhaseStart(phase: string, blockCount: number): void {
    console.log(`${PREFIX} ${phase}: ${blockCount} блоков`);
  }

  logGlossaryResult(chunkCount: number, totalCodes: number, byType: Record<string, number>): void {
    const types = Object.entries(byType)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    console.log(`${PREFIX} Pass 0: ${chunkCount} чанков → ${totalCodes} кодов (${types})`);
    this.glossaryCount = totalCodes;
  }

  logRuleBasedResult(phase: string, processedBlocks: number, totalBlocks: number, factCount: number): void {
    console.log(
      `${PREFIX} ${phase}: rule-based ${processedBlocks}/${totalBlocks} блоков (${factCount} фактов)`,
    );
  }

  logLlmCall(
    blockUid: string,
    blockType: string,
    phase: string,
    responseKeys: string[],
    itemCount: number,
    usage: LlmUsage | null,
    hasImage: boolean,
    durationMs: number,
  ): void {
    const entry: LlmCallEntry = { blockUid, blockType, phase, responseKeys, itemCount, usage, hasImage, durationMs };
    this.llmCalls.push(entry);

    if (usage) {
      this.totalPromptTokens += usage.prompt_tokens;
      this.totalCompletionTokens += usage.completion_tokens;
      this.totalTokens += usage.total_tokens;
    }

    const usageStr = usage ? `tokens:{p:${usage.prompt_tokens},c:${usage.completion_tokens}}` : 'tokens:n/a';
    const imageStr = blockType === 'IMAGE' ? ` hasImage:${hasImage ? '✓' : '✗'}` : '';
    console.log(
      `${PREFIX} LLM ${blockType}:${blockUid}${imageStr} → keys:${JSON.stringify(responseKeys)} items:${itemCount} ${usageStr} ${durationMs}ms`,
    );
  }

  logPhaseSummary(phase: string, stats: PhaseStats): void {
    const parts: string[] = [];
    if (stats.ruleBasedBlocks > 0) parts.push(`rule-based:${stats.ruleBasedFacts}`);
    if (stats.llmBlocks > 0) parts.push(`LLM:${stats.llmFacts}`);
    const total = stats.ruleBasedFacts + stats.llmFacts;
    console.log(`${PREFIX} ${phase} итог: ${total} фактов (${parts.join(', ')})`);
    this.phaseEntries.push({
      name: phase,
      ruleBasedBlocks: stats.ruleBasedBlocks,
      ruleBasedFacts: stats.ruleBasedFacts,
      llmBlocks: stats.llmBlocks,
      llmFacts: stats.llmFacts,
    });
  }

  addMaterialFacts(count: number): void {
    this.totalMaterialFacts += count;
  }

  addProductFacts(count: number): void {
    this.totalProductFacts += count;
  }

  setImageStats(sent: number, total: number): void {
    this.imagesSent = sent;
    this.imagesTotal = total;
  }

  getTokenUsage(): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
    return {
      prompt_tokens: this.totalPromptTokens,
      completion_tokens: this.totalCompletionTokens,
      total_tokens: this.totalTokens,
    };
  }

  logFinalSummary(): void {
    const elapsed = Date.now() - this.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    console.log(`${PREFIX} ══ ИТОГО ══`);
    console.log(`${PREFIX}   LLM вызовов: ${this.llmCalls.length} | Время: ${timeStr}`);
    console.log(`${PREFIX}   Токены: вход ${this.totalPromptTokens} + выход ${this.totalCompletionTokens} = ${this.totalTokens}`);
    console.log(
      `${PREFIX}   Материалов: ${this.totalMaterialFacts} | Изделий: ${this.totalProductFacts} | Глоссарий: ${this.glossaryCount}`,
    );
    if (this.imagesTotal > 0) {
      console.log(
        `${PREFIX}   Изображений передано: ${this.imagesSent}/${this.imagesTotal}${this.imagesTotal - this.imagesSent > 0 ? ` (${this.imagesTotal - this.imagesSent} без image_url)` : ''}`,
      );
    }
  }

  // ── New detailed log methods ──

  logSessionInit(docId: string, docName: string, model: string): void {
    this.docId = docId;
    this.docName = docName;
    this.model = model;
  }

  logPrompts(prompts: { universal: string; layerCake: string; glossary: string }): void {
    this.prompts = { ...prompts };
  }

  logPromptWithGlossary(prompt: string): void {
    this.prompts.universalWithGlossary = prompt;
  }

  logParsingResult(result: SessionLog['parsing']): void {
    this.parsingResult = result;
  }

  logBlockClassification(entry: ClassificationEntry): void {
    this.classificationDetails.push(entry);
  }

  logLlmCallDetailed(entry: Omit<LlmCallDetailedEntry, 'timestamp'>): void {
    this.detailedCalls.push({ ...entry, timestamp: new Date().toISOString() });
  }

  logLlmError(blockUid: string, blockType: string, phase: string, error: string, systemPrompt: string, userPrompt: string, rawResponse?: string): void {
    this.detailedCalls.push({
      timestamp: new Date().toISOString(),
      blockUid,
      blockType,
      phase,
      systemPrompt,
      userPrompt,
      rawResponse: rawResponse || '',
      parsedItemsCount: 0,
      validItemsCount: 0,
      droppedItems: [],
      responseKeys: [],
      usage: null,
      hasImage: false,
      durationMs: 0,
      error,
    });
    this.errors.push(`${phase} ${blockType}:${blockUid} — ${error}`);
  }

  logRuleBasedExtraction(blockUid: string, phase: string, items: Array<{ raw_name: string; quantity: number | null; unit: string | null }>): void {
    this.ruleBasedEntries.push({
      blockUid,
      phase,
      extractedCount: items.length,
      items: items.map(i => ({ raw_name: i.raw_name, quantity: i.quantity, unit: i.unit })),
    });
  }

  logFilterResult(entry: FilterLogEntry): void {
    this.filterLogEntries.push(entry);
  }

  buildSessionLog(): SessionLog {
    const endTime = Date.now();
    return {
      version: '1.0',
      documentName: this.docName,
      documentId: this.docId,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMs: endTime - this.startTime,
      model: this.model,
      prompts: this.prompts,
      parsing: this.parsingResult,
      classification: {
        summary: this.classificationSummary ?? { vedomost: 0, spec: 0, assembly: 0, products: 0, images: 0, skipped: 0, total: 0 },
        details: this.classificationDetails,
      },
      llmCalls: this.detailedCalls,
      filterLog: this.filterLogEntries,
      ruleBasedLog: this.ruleBasedEntries,
      phases: this.phaseEntries,
      summary: {
        totalMaterialFacts: this.totalMaterialFacts,
        totalProductFacts: this.totalProductFacts,
        glossaryCodes: this.glossaryCount,
        totalLlmCalls: this.llmCalls.length,
        totalPromptTokens: this.totalPromptTokens,
        totalCompletionTokens: this.totalCompletionTokens,
        totalTokens: this.totalTokens,
        imagesSent: this.imagesSent,
        imagesTotal: this.imagesTotal,
        errors: this.errors,
      },
    };
  }

  async downloadLog(): Promise<void> {
    const log = this.buildSessionLog();
    const json = JSON.stringify(log, null, 2);
    const safeName = this.docName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_').slice(0, 60) || 'unknown';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `extraction-log_${safeName}_${timestamp}.json`;

    try {
      const res = await fetch('/api/save-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: json }),
      });
      if (res.ok) {
        const result = await res.json();
        console.log(`${PREFIX} Лог сохранён: ${result.path}`);
      } else {
        console.error(`${PREFIX} Ошибка сохранения лога: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`${PREFIX} Не удалось сохранить лог:`, err);
    }
  }
}
