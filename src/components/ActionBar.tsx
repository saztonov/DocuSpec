import { Button, Progress, Select, Space, Typography, Tag } from 'antd';
import { ExperimentOutlined, CalculatorOutlined, ReloadOutlined, DownloadOutlined, StopOutlined } from '@ant-design/icons';
import { getAvailableModels } from '../lib/models.ts';
import type { ExtractionProgress } from '../types/extraction.ts';
import type { EstimateProgress as EstimateProgressType } from '../types/estimate.ts';

const { Text } = Typography;

interface ActionBarProps {
  docStatus: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
  // Extraction
  extractionProgress: ExtractionProgress;
  onRunExtraction: () => void;
  onStopExtraction: () => void;
  onReExtract?: () => void;
  onDownloadLog?: () => void;
  // Estimate
  estimateProgress: EstimateProgressType;
  onRunEstimate: () => void;
  onStopEstimate: () => void;
}

const EXTRACT_STATUS_TEXT: Record<string, string> = {
  idle: '',
  glossary: 'Глоссарий...',
  rule_based: 'Извлечение из таблиц...',
  llm_extracting: 'LLM-извлечение...',
  merging: 'Объединение...',
  saving: 'Сохранение...',
  done: 'Готово',
  error: 'Ошибка',
};

const ESTIMATE_PHASE_LABEL: Record<string, string> = {
  preparing: 'Подготовка...',
  classifying: 'Классификация работ...',
  pricing: 'Подбор расценок...',
  matching: 'Подбор ресурсов...',
  calculating: 'Расчёт объёмов...',
  validating: 'Проверка...',
};

export default function ActionBar({
  docStatus,
  selectedModel,
  onModelChange,
  extractionProgress,
  onRunExtraction,
  onStopExtraction,
  onReExtract,
  onDownloadLog,
  estimateProgress,
  onRunEstimate,
  onStopEstimate,
}: ActionBarProps) {
  const models = getAvailableModels();

  const isExtracting = extractionProgress.status !== 'idle' && extractionProgress.status !== 'done' && extractionProgress.status !== 'error';
  const isEstimating = estimateProgress.status !== 'done' && estimateProgress.status !== 'error' && estimateProgress.status !== 'draft' && estimateProgress.currentStep > 0;
  const isBusy = isExtracting || isEstimating;

  const extractPercent = extractionProgress.totalBatches > 0
    ? Math.round((extractionProgress.completedBatches / extractionProgress.totalBatches) * 100)
    : 0;

  const estimatePercent = estimateProgress.maxSteps > 0
    ? Math.round((estimateProgress.currentStep / estimateProgress.maxSteps) * 100)
    : 0;

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        background: '#fff',
        borderTop: '1px solid #f0f0f0',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.06)',
        padding: '10px 24px',
        zIndex: 10,
      }}
    >
      {/* Progress bars row - show when busy */}
      {isBusy && (
        <div style={{ marginBottom: 8 }}>
          {isExtracting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {EXTRACT_STATUS_TEXT[extractionProgress.status]}
                {extractionProgress.phase ? ` ${extractionProgress.phase}` : ''}
                {extractionProgress.status === 'llm_extracting' ? ` (${extractionProgress.completedBatches}/${extractionProgress.totalBatches})` : ''}
              </Text>
              <Progress
                percent={extractPercent}
                size="small"
                style={{ flex: 1, margin: 0, maxWidth: 300 }}
                status="active"
              />
            </div>
          )}
          {isEstimating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {ESTIMATE_PHASE_LABEL[estimateProgress.status] ?? estimateProgress.phase ?? 'Обработка...'}
                {estimateProgress.currentAgent ? ` (${estimateProgress.currentAgent})` : ''}
              </Text>
              <Progress
                percent={estimatePercent}
                size="small"
                style={{ flex: 1, margin: 0, maxWidth: 300 }}
                status="active"
              />
            </div>
          )}
        </div>
      )}

      {/* Buttons row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isExtracting ? (
          <Button
            danger
            icon={<StopOutlined />}
            onClick={onStopExtraction}
          >
            Остановить
          </Button>
        ) : (
          <Button
            type="primary"
            icon={extractionProgress.status === 'done' ? <ReloadOutlined /> : <ExperimentOutlined />}
            disabled={isBusy}
            onClick={extractionProgress.status === 'done' ? onReExtract ?? onRunExtraction : onRunExtraction}
          >
            {extractionProgress.status === 'done' ? 'Пересобрать' : 'Собрать материалы'}
          </Button>
        )}

        {isEstimating ? (
          <Button
            danger
            icon={<StopOutlined />}
            onClick={onStopEstimate}
          >
            Остановить
          </Button>
        ) : (
          <Button
            icon={<CalculatorOutlined />}
            disabled={isBusy || docStatus !== 'done'}
            onClick={onRunEstimate}
          >
            Составить смету
          </Button>
        )}

        {models.length > 1 && (
          <Select
            value={selectedModel}
            onChange={onModelChange}
            options={models}
            style={{ width: 220 }}
            disabled={isBusy}
            size="small"
          />
        )}

        {extractionProgress.status === 'done' && onDownloadLog && (
          <Button size="small" icon={<DownloadOutlined />} onClick={onDownloadLog}>Лог</Button>
        )}

        <div style={{ flex: 1 }} />

        {/* Status tags */}
        {extractionProgress.status === 'done' && (
          <Tag color="green">{extractionProgress.extractedFacts} материалов</Tag>
        )}

        {extractionProgress.status === 'error' && (
          <Tag color="red">Ошибка: {extractionProgress.errorMessage?.slice(0, 40) ?? 'извлечение'}</Tag>
        )}

        {estimateProgress.status === 'done' && (
          <Tag color="green">Смета готова</Tag>
        )}

        {estimateProgress.status === 'error' && (
          <Tag color="red">Ошибка: {estimateProgress.agentThinking?.slice(0, 40) ?? 'смета'}</Tag>
        )}
      </div>
    </div>
  );
}
