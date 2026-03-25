import { Steps, Alert, Typography } from 'antd';
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { EstimateProgress as EstimateProgressType } from '../../types/estimate.ts';

const { Text } = Typography;

/** Порядок фаз пайплайна сметы. */
const PIPELINE_PHASES = [
  { key: 'preparing', title: 'Подготовка' },
  { key: 'classifying', title: 'Классификация' },
  { key: 'pricing', title: 'Расценки' },
  { key: 'matching', title: 'Ресурсы' },
  { key: 'calculating', title: 'Объёмы' },
  { key: 'validating', title: 'Валидация' },
] as const;

type PhaseKey = (typeof PIPELINE_PHASES)[number]['key'];

/** Индекс фазы по ключу статуса. -1 = draft, 6 = done/error. */
function phaseIndex(status: string): number {
  const idx = PIPELINE_PHASES.findIndex((p) => p.key === status);
  if (idx !== -1) return idx;
  if (status === 'done') return PIPELINE_PHASES.length;
  if (status === 'error') return -2; // особый случай
  return -1; // draft
}

function stepIcon(phase: PhaseKey, currentStatus: string) {
  const current = phaseIndex(currentStatus);
  const step = PIPELINE_PHASES.findIndex((p) => p.key === phase);

  if (currentStatus === 'error' && step === current) {
    return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
  }
  if (step < current || currentStatus === 'done') {
    return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
  }
  if (step === current) {
    return <LoadingOutlined style={{ color: '#1677ff' }} />;
  }
  return <ClockCircleOutlined style={{ color: '#d9d9d9' }} />;
}

function stepStatus(
  phase: PhaseKey,
  currentStatus: string,
): 'wait' | 'process' | 'finish' | 'error' {
  const current = phaseIndex(currentStatus);
  const step = PIPELINE_PHASES.findIndex((p) => p.key === phase);

  if (currentStatus === 'error') {
    // Фаза, на которой произошла ошибка
    if (step === current) return 'error';
    if (step < current) return 'finish';
    return 'wait';
  }
  if (currentStatus === 'done') return 'finish';
  if (step < current) return 'finish';
  if (step === current) return 'process';
  return 'wait';
}

interface Props {
  progress: EstimateProgressType;
}

export default function EstimateProgress({ progress }: Props) {
  const items = PIPELINE_PHASES.map((phase) => ({
    title: phase.title,
    icon: stepIcon(phase.key, progress.status),
    status: stepStatus(phase.key, progress.status),
  }));

  const currentIdx = phaseIndex(progress.status);

  return (
    <div>
      <Steps
        current={currentIdx >= 0 ? currentIdx : 0}
        items={items}
        size="small"
        style={{ marginBottom: 16 }}
      />

      {progress.agentThinking && (
        <Alert
          type="info"
          showIcon={false}
          message={
            <Text type="secondary" style={{ fontSize: 13, fontStyle: 'italic' }}>
              {progress.currentAgent && (
                <Text strong style={{ fontSize: 13 }}>
                  [{progress.currentAgent}]{' '}
                </Text>
              )}
              {progress.agentThinking}
            </Text>
          }
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
