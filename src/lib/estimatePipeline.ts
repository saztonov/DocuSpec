/**
 * Оркестратор сметного пайплайна (Phase A → F).
 *
 * Phase A:   Подготовка контекста
 * Phase A.5: Reconciliation (дедупликация, conflicts, dependency extraction)
 * Phase B:   WorkClassifier (Agent 1)
 * Phase C:   PricePicker (Agent 2)
 * Phase D:   ResourceMatcher (Agent 3)
 * Phase E:   VolumeCalculator (Agent 4)
 * Phase F:   Validation (rule-based)
 */

import { supabase } from './supabase.ts';
import type { EstimateProgress } from '../types/estimate.ts';

/** Убирает markdown code block обёртку (```json ... ```) из ответа LLM */
function stripMarkdownJson(text: string): string {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return match ? match[1].trim() : text.trim();
}

export interface PipelineOptions {
  docId: string;
  model?: string;
  onProgress?: (progress: EstimateProgress) => void;
}

export interface PipelineResult {
  estimateId: string;
  workItemsCount: number;
  rateMatchesCount: number;
  resourceMatchesCount: number;
  linesCount: number;
  issuesCount: number;
}

function progress(
  onProgress: PipelineOptions['onProgress'],
  update: Partial<EstimateProgress>,
): void {
  if (onProgress) {
    onProgress({
      status: 'preparing',
      phase: '',
      currentAgent: null,
      currentStep: 0,
      maxSteps: 6,
      agentThinking: null,
      ...update,
    });
  }
}

export async function runEstimatePipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { docId, model, onProgress } = options;

  // ── Phase A: Подготовка контекста ──────────────────────────
  progress(onProgress, {
    status: 'preparing',
    phase: 'Phase A: Подготовка контекста',
    currentStep: 1,
  });

  // Загрузить метаданные документа
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, doc_code, section_id, project_id, status')
    .eq('id', docId)
    .single();

  if (docErr || !doc) throw new Error('Документ не найден');
  if (doc.status !== 'done') throw new Error('Сначала извлеките материалы (статус документа должен быть "done")');

  console.group('📋 [estimate] Сметный пайплайн');
  console.log('Документ:', doc.doc_code, '| ID:', docId);

  // Загрузить section info
  let sectionCode: string | null = null;
  if (doc.section_id) {
    const { data: section } = await supabase
      .from('sections')
      .select('code, name')
      .eq('id', doc.section_id)
      .single();
    sectionCode = section?.code || null;
  }

  // Создать запись сметы
  const { data: estimate, error: estErr } = await supabase
    .from('estimates')
    .insert({
      doc_id: docId,
      project_id: doc.project_id,
      name: `Смета ${doc.doc_code || 'без кода'} от ${new Date().toLocaleDateString('ru')}`,
      status: 'preparing',
      model_used: model || null,
    })
    .select()
    .single();

  if (estErr || !estimate) throw new Error(`Ошибка создания сметы: ${estErr?.message}`);
  const estimateId = estimate.id;
  console.log('[estimate] Смета создана:', estimateId);

  try {
    // ── Phase A.5: Reconciliation ──────────────────────────────
    progress(onProgress, {
      status: 'preparing',
      phase: 'Phase A.5: Reconciliation',
      currentStep: 1,
      agentThinking: 'Дедупликация, зависимости, work hints...',
    });

    console.log('\n[estimate] ═══ Phase A.5: Reconciliation ═══');
    const { runReconciliation } = await import('./reconciliation.ts');
    const reconResult = await runReconciliation(docId);
    console.log('[estimate] Reconciliation результат:', reconResult);

    progress(onProgress, {
      agentThinking: `Reconciliation: ${reconResult.workHintsCount} work hints, ${reconResult.dependencyFlagsCount} зависимостей, ${reconResult.conflictsDetected} конфликтов`,
    });

    // Загрузить material_facts для передачи агентам
    const { data: materialFacts } = await supabase
      .from('material_facts')
      .select('id, raw_name, canonical_name, canonical_key, quantity, unit, gost, mark, construction, source_section, fact_type, quantity_type, kind, confidence')
      .eq('doc_id', docId)
      .in('fact_type', ['observed', 'derived']);

    if (!materialFacts || materialFacts.length === 0) {
      throw new Error('Нет извлечённых материалов для формирования сметы');
    }

    // Группировка по construction
    const groups = new Map<string, typeof materialFacts>();
    for (const fact of materialFacts) {
      const key = fact.construction || '__no_construction__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(fact);
    }
    console.log(`[estimate] Загружено ${materialFacts.length} material_facts, ${groups.size} групп по construction`);

    // ── Phase B: WorkClassifier (Agent 1) ────────────────────────
    console.log('\n[estimate] ═══ Phase B: WorkClassifier ═══');
    await supabase.from('estimates').update({ status: 'classifying' }).eq('id', estimateId);
    progress(onProgress, {
      status: 'classifying',
      phase: 'Phase B: Классификация работ',
      currentAgent: 'WorkClassifier',
      currentStep: 2,
    });

    const { createWorkClassifierConfig } = await import('./agents/workClassifier.ts');
    const { runAgent } = await import('./agents/agentRunner.ts');

    const wcConfig = createWorkClassifierConfig({ model });
    const groupsPayload = Array.from(groups.entries()).map(([construction, facts]) => ({
      construction: construction === '__no_construction__' ? null : construction,
      materials: facts.map(f => ({
        id: f.id,
        name: f.canonical_name || f.raw_name,
        gost: f.gost,
        unit: f.unit,
        quantity: f.quantity,
      })),
    }));

    const wcResult = await runAgent(wcConfig, JSON.stringify({
      doc_code: doc.doc_code,
      section_code: sectionCode,
      groups: groupsPayload.slice(0, 20), // Limit groups to prevent token overflow
    }));

    // Parse and save work items
    let workItemsCount = 0;
    console.log('[estimate] WorkClassifier сырой ответ:', wcResult.finalAnswer?.slice(0, 500));
    console.log(`[estimate] WorkClassifier шагов: ${wcResult.totalSteps}, токенов: ${wcResult.usage.total_tokens}`);
    try {
      const wcParsed = JSON.parse(stripMarkdownJson(wcResult.finalAnswer));
      const workItems = wcParsed.work_items || wcParsed;
      console.log(`[estimate] Распарсено work_items: ${Array.isArray(workItems) ? workItems.length : 'не массив'}`);
      for (const wi of Array.isArray(workItems) ? workItems : []) {
        const linkedFacts = materialFacts
          .filter(f => (f.construction || null) === (wi.construction || null))
          .map(f => f.id);

        await supabase.from('estimate_work_items').insert({
          estimate_id: estimateId,
          work_description: wi.description || wi.work_description || 'Не определено',
          work_category: wi.category || wi.work_category || null,
          construction: wi.construction || null,
          source_material_fact_ids: linkedFacts,
          confidence: wi.confidence || 0.7,
          needs_review: (wi.confidence || 0.7) < 0.6,
          agent_reasoning: wi.reasoning || null,
          agent_steps: wcResult.steps,
        });
        workItemsCount++;
      }
    } catch (wcParseErr) {
      console.error('[estimate] ❌ Ошибка парсинга WorkClassifier:', wcParseErr);
      console.error('[estimate] Сырой ответ:', wcResult.finalAnswer?.slice(0, 500));
    }

    progress(onProgress, {
      agentThinking: `Определено ${workItemsCount} видов работ`,
    });

    // ── Phase C: PricePicker (Agent 2) ───────────────────────────
    console.log(`\n[estimate] ═══ Phase C: PricePicker (${workItemsCount} видов работ) ═══`);
    await supabase.from('estimates').update({ status: 'pricing' }).eq('id', estimateId);
    progress(onProgress, {
      status: 'pricing',
      phase: 'Phase C: Подбор расценок',
      currentAgent: 'PricePicker',
      currentStep: 3,
    });

    const { data: workItems } = await supabase
      .from('estimate_work_items')
      .select('*')
      .eq('estimate_id', estimateId);

    const { createPricePickerConfig } = await import('./agents/pricePicker.ts');
    const ppConfig = createPricePickerConfig(estimateId, { model });

    let rateMatchesCount = 0;
    for (const wi of workItems || []) {
      const wiMaterials = materialFacts
        .filter(f => (wi.source_material_fact_ids || []).includes(f.id))
        .map(f => ({ name: f.canonical_name || f.raw_name, gost: f.gost, unit: f.unit }));

      console.log(`[estimate] PricePicker: "${wi.work_description}" (${wiMaterials.length} материалов)`);
      try {
        const ppResult = await runAgent(ppConfig, JSON.stringify({
          work_item_id: wi.id,
          work_description: wi.work_description,
          work_category: wi.work_category,
          materials: wiMaterials,
        }));
        console.log(`[estimate] PricePicker ответ (${wi.work_description}):`, ppResult.finalAnswer?.slice(0, 300));

        // Результат сохраняется через confirm_rate tool внутри агента
        // Но на случай если агент вернул в финальном ответе:
        try {
          const parsed = JSON.parse(stripMarkdownJson(ppResult.finalAnswer));
          if (parsed.norm_code && !parsed.saved) {
            await supabase.from('estimate_rate_matches').insert({
              estimate_id: estimateId,
              work_item_id: wi.id,
              norm_code: parsed.norm_code,
              norm_name: parsed.norm_name || null,
              norm_unit: parsed.norm_unit || null,
              match_confidence: parsed.confidence || 0.7,
              match_method: 'llm',
              resource_coverage: parsed.coverage || null,
              agent_reasoning: parsed.reasoning || null,
            });
          }
        } catch { /* saved via tool */ }
        rateMatchesCount++;
      } catch (err) {
        console.error(`[estimate] ❌ PricePicker ошибка для "${wi.work_description}":`, err);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    progress(onProgress, { agentThinking: `Подобрано ${rateMatchesCount} расценок` });

    // ── Phase D: ResourceMatcher (Agent 3) ──────────────────────
    console.log(`\n[estimate] ═══ Phase D: ResourceMatcher (${materialFacts.length} материалов) ═══`);
    await supabase.from('estimates').update({ status: 'matching' }).eq('id', estimateId);
    progress(onProgress, {
      status: 'matching',
      phase: 'Phase D: Сопоставление ресурсов',
      currentAgent: 'ResourceMatcher',
      currentStep: 4,
    });

    const { createResourceMatcherConfig } = await import('./agents/resourceMatcher.ts');
    const rmConfig = createResourceMatcherConfig(estimateId, { model });

    let resourceMatchesCount = 0;
    // Process in batches of 10 materials
    const batchSize = 10;
    for (let i = 0; i < materialFacts.length; i += batchSize) {
      const batch = materialFacts.slice(i, i + batchSize);
      console.log(`[estimate] ResourceMatcher batch ${i / batchSize + 1}: ${batch.map(f => f.canonical_name || f.raw_name).join(', ').slice(0, 200)}`);
      try {
        const rmResult = await runAgent(rmConfig, JSON.stringify({
          estimate_id: estimateId,
          materials: batch.map(f => ({
            id: f.id,
            name: f.canonical_name || f.raw_name,
            gost: f.gost,
            mark: f.mark,
            unit: f.unit,
            quantity: f.quantity,
          })),
        }));
        console.log(`[estimate] ResourceMatcher batch ${i / batchSize + 1} ответ:`, rmResult.finalAnswer?.slice(0, 300));
        // Results saved via confirm_match tool
        resourceMatchesCount += batch.length;
      } catch (err) {
        console.error(`[estimate] ❌ ResourceMatcher ошибка batch ${i / batchSize + 1}:`, err);
      }

      progress(onProgress, {
        agentThinking: `Сопоставлено ${Math.min(i + batchSize, materialFacts.length)}/${materialFacts.length} материалов`,
      });
      await new Promise(r => setTimeout(r, 300));
    }

    // ── Phase E: VolumeCalculator (Agent 4) ──────────────────────
    console.log(`\n[estimate] ═══ Phase E: VolumeCalculator ═══`);
    await supabase.from('estimates').update({ status: 'calculating' }).eq('id', estimateId);
    progress(onProgress, {
      status: 'calculating',
      phase: 'Phase E: Расчёт объёмов',
      currentAgent: 'VolumeCalculator',
      currentStep: 5,
    });

    const { data: rateMatches } = await supabase
      .from('estimate_rate_matches')
      .select('*, estimate_work_items!inner(source_material_fact_ids)')
      .eq('estimate_id', estimateId);

    const { createVolumeCalculatorConfig } = await import('./agents/volumeCalculator.ts');
    const vcConfig = createVolumeCalculatorConfig({ model });

    let linesCount = 0;
    for (const rm of rateMatches || []) {
      const factIds = (rm as any).estimate_work_items?.source_material_fact_ids || [];
      console.log(`[estimate] VolumeCalculator: norm=${rm.norm_code}, unit=${rm.norm_unit}, facts=${factIds.length}`);
      try {
        const vcResult = await runAgent(vcConfig, JSON.stringify({
          estimate_id: estimateId,
          rate_match_id: rm.id,
          work_item_id: rm.work_item_id,
          norm_code: rm.norm_code,
          norm_unit: rm.norm_unit,
          material_fact_ids: factIds,
        }));
        console.log(`[estimate] VolumeCalculator ответ:`, vcResult.finalAnswer?.slice(0, 300));

        // Results saved via tools or parsed from final answer
        try {
          const parsed = JSON.parse(stripMarkdownJson(vcResult.finalAnswer));
          if (parsed.volume !== undefined) {
            await supabase.from('estimate_lines').insert({
              estimate_id: estimateId,
              sort_order: linesCount + 1,
              rate_match_id: rm.id,
              work_item_id: rm.work_item_id,
              justification: rm.norm_code ? `ГЭСН ${rm.norm_code}` : null,
              description: rm.norm_name || 'Не определено',
              measure_unit: rm.norm_unit,
              volume: parsed.volume,
              volume_calc_note: parsed.calc_note || null,
              source_material_fact_ids: factIds,
            });
            linesCount++;
          }
        } catch { /* saved via tool */ }
      } catch (err) {
        console.error('[estimate] ❌ VolumeCalculator ошибка:', err);
      }

      await new Promise(r => setTimeout(r, 200));
    }

    progress(onProgress, { agentThinking: `Сформировано ${linesCount} позиций сметы` });

    // ── Phase F: Validation ──────────────────────────────────────
    console.log(`\n[estimate] ═══ Phase F: Валидация ═══`);
    await supabase.from('estimates').update({ status: 'validating' }).eq('id', estimateId);
    progress(onProgress, {
      status: 'validating',
      phase: 'Phase F: Валидация',
      currentAgent: null,
      currentStep: 6,
      agentThinking: 'Проверка полноты и согласованности...',
    });

    const { validateEstimate } = await import('./estimateValidator.ts');
    const validation = await validateEstimate(estimateId, docId);
    console.log(`[estimate] Валидация: ${validation.errors} ошибок, ${validation.warnings} предупреждений, ${validation.infos} инфо`);

    progress(onProgress, {
      agentThinking: `Валидация: ${validation.errors} ошибок, ${validation.warnings} предупреждений, ${validation.infos} инфо`,
    });

    // ── Финализация ──────────────────────────────────────────────
    await supabase.from('estimates').update({
      status: 'done',
      updated_at: new Date().toISOString(),
    }).eq('id', estimateId);

    const result = {
      estimateId,
      workItemsCount,
      rateMatchesCount,
      resourceMatchesCount,
      linesCount,
      issuesCount: validation.issues.length,
    };

    console.log('\n[estimate] ═══ ГОТОВО ═══');
    console.log('[estimate] Результат:', result);
    console.groupEnd();
    return result;

  } catch (err) {
    console.error('\n[estimate] ❌ КРИТИЧЕСКАЯ ОШИБКА:', err);
    console.groupEnd();
    // Пометить смету как ошибочную
    await supabase.from('estimates').update({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Неизвестная ошибка',
    }).eq('id', estimateId);
    throw err;
  }
}
