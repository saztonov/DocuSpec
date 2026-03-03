/**
 * Structured logging for the document extraction process.
 * Collects metrics across all phases and outputs a summary.
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
}
