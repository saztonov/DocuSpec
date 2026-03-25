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

  const runEstimate = useCallback(async (model?: string) => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      setProgress({
        status: 'preparing',
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
        onProgress: (p) => setProgress(p),
      });

      setEstimateId(result.estimateId);
      setProgress(prev => ({ ...prev, status: 'done', phase: 'Готово' }));
    } catch (err) {
      setProgress(prev => ({
        ...prev,
        status: 'error',
        phase: 'Ошибка',
        agentThinking: err instanceof Error ? err.message : 'Неизвестная ошибка',
      }));
    } finally {
      runningRef.current = false;
    }
  }, [docId]);

  return { progress, estimateId, runEstimate };
}
