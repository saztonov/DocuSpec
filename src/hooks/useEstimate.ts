/**
 * Хук для запуска и отслеживания сметного пайплайна.
 * Аналог useExtraction.ts для сметного контура.
 */

import { useState, useCallback, useRef } from 'react';
import type { EstimateProgress } from '../types/estimate.ts';

export function useEstimate(docId: string) {
  const [progress, setProgress] = useState<EstimateProgress>({
    status: 'idle',
    phase: '',
    currentAgent: null,
    currentStep: 0,
    maxSteps: 0,
    agentThinking: null,
  });
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const runningRef = useRef(false);
  const abortRef = useRef(false);

  const stopEstimate = useCallback(() => {
    abortRef.current = true;
  }, []);

  const runEstimate = useCallback(async (model?: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    abortRef.current = false;

    try {
      console.log('[DocuSpec:Estimate] Начало формирования сметы, модель:', model ?? 'default');
      setProgress({
        status: 'preparing' as EstimateProgress['status'],
        phase: 'Подготовка контекста',
        currentAgent: null,
        currentStep: 0,
        maxSteps: 6,
        agentThinking: null,
      });

      // Dynamic import to keep bundle size manageable
      const { runEstimatePipeline } = await import('../lib/estimatePipeline.ts');

      const result = await runEstimatePipeline({
        docId,
        model,
        onProgress: (p: EstimateProgress) => {
          if (abortRef.current) throw new Error('Остановлено пользователем');
          setProgress(p);
        },
      });

      setEstimateId(result.estimateId);
      console.log('[DocuSpec:Estimate] Смета сформирована, id:', result.estimateId);
      setProgress(prev => ({ ...prev, status: 'done' as EstimateProgress['status'], phase: 'Готово' }));
    } catch (err) {
      console.error('[DocuSpec:Estimate] Ошибка формирования сметы:', err);
      if (err instanceof Error && err.stack) console.error('[DocuSpec:Estimate] Stack:', err.stack);
      setProgress(prev => ({
        ...prev,
        status: 'error' as EstimateProgress['status'],
        phase: 'Ошибка',
        agentThinking: err instanceof Error ? err.message : 'Неизвестная ошибка',
      }));
    } finally {
      runningRef.current = false;
    }
  }, [docId]);

  return { progress, estimateId, runEstimate, stopEstimate };
}
