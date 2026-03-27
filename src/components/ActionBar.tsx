import { Button, Progress, Select, Space, Typography, Tag } from 'antd';
import { ExperimentOutlined, CalculatorOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { getAvailableModels } from '../lib/models.ts';
import type { ExtractionProgress } from '../types/extraction.ts';
import type { EstimateProgress as EstimateProgressType } from '../types/estimate.ts';
import EstimateProgress from './estimate/EstimateProgress.tsx';

const { Text } = Typography;

interface ActionBarProps {
  docStatus: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
  // Extraction
  extractionProgress: ExtractionProgress;
  onRunExtraction: () => void;
  onReExtract?: () => void;
  onDownloadLog?: () => void;
  // Estimate
  estimateProgress: EstimateProgressType;
  onRunEstimate: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  idle: '',
  rule_based: 'Извлечение из таблиц...',
  llm_extracting: 'LLM-извлечение...',
  merging: 'Объединение...',
  saving: 'Сохранение...',
  done: 'Готово',
  error: 'Ошибка',
};

export default function ActionBar({
  docStatus,
  selectedModel,
  onModelChange,
  extractionProgress,
  onRunExtraction,
  onReExtract,
  onDownloadLog,
  estimateProgress,
  onRunEstimate,
}: ActionBarProps) {
  const models = getAvailableModels();

  const isExtracting = extractionProgress.status !== 'idle' && extractionProgress.status !== 'done' && extractionProgress.status !== 'error';
  const isEstimating = estimateProgress.status !== 'done' && estimateProgress.status !== 'error' && estimateProgress.status !== 'draft' && estimateProgress.currentStep > 0;
  const isBusy = isExtracting || isEstimating;

  const extractPercent = extractionProgress.totalBatches > 0
    ? Math.round((extractionProgress.completedBatches / extractionProgress.totalBatches) * 100)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          type="primary"
          icon={extractionProgress.status === 'done' ? <ReloadOutlined /> : <ExperimentOutlined />}
          loading={isExtracting}
          disabled={isBusy}
          onClick={extractionProgress.status === 'done' ? onReExtract ?? onRunExtraction : onRunExtraction}
        >
          {extractionProgress.status === 'done' ? 'Пересобрать' : 'Собрать материалы'}
        </Button>

        <Button
          icon={<CalculatorOutlined />}
          loading={isEstimating}
          disabled={isBusy || docStatus !== 'done'}
          onClick={onRunEstimate}
        >
          Составить смету
        </Button>

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

        {/* Extraction progress */}
        {isExtracting && (
          <Space size={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {STATUS_TEXT[extractionProgress.status]} {extractionProgress.status === 'llm_extracting' ? `${extractionProgress.completedBatches}/${extractionProgress.totalBatches}` : ''}
            </Text>
            {extractionProgress.totalBatches > 0 && (
              <Progress percent={extractPercent} size="small" style={{ width: 120, margin: 0 }} />
            )}
          </Space>
        )}

        {extractionProgress.status === 'done' && (
          <Tag color="green">{extractionProgress.extractedFacts} материалов</Tag>
        )}

        {extractionProgress.status === 'error' && (
          <Tag color="red">Ошибка извлечения</Tag>
        )}

        {/* Estimate progress */}
        {isEstimating && (
          <div style={{ maxWidth: 400 }}>
            <EstimateProgress progress={estimateProgress} />
          </div>
        )}

        {estimateProgress.status === 'done' && (
          <Tag color="green">Смета готова</Tag>
        )}

        {estimateProgress.status === 'error' && (
          <Tag color="red">Ошибка сметы</Tag>
        )}
      </div>
    </div>
  );
}
