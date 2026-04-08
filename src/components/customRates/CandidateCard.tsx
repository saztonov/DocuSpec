import { useState } from 'react';
import { Button, Tag, Typography, Space, Tooltip } from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import type { Candidate, CandidateStatus } from '../../types/customRates';
import { RATE_SOURCE_COLOR, RATE_SOURCE_LABEL } from '../../types/customRates';

interface Props {
  candidate: Candidate;
  status: CandidateStatus;
  onAdd: (candidate: Candidate) => void;
}

function confidenceColor(c?: number): string {
  if (c === undefined) return '#d9d9d9';
  if (c >= 0.75) return '#52c41a';
  if (c >= 0.5) return '#faad14';
  return '#ff4d4f';
}

export default function CandidateCard({ candidate, status, onAdd }: Props) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  // Стиль фона по состоянию
  const bgColor =
    status === 'in_draft'
      ? '#e6f4ff'
      : status === 'already_in_db'
      ? '#fffbe6'
      : '#fff';
  const borderColor =
    status === 'in_draft'
      ? '#91caff'
      : status === 'already_in_db'
      ? '#ffd591'
      : '#d9d9d9';

  const renderButton = () => {
    if (status === 'in_draft') {
      return (
        <Button icon={<CheckOutlined />} disabled type="default" size="small">
          В черновике
        </Button>
      );
    }
    if (status === 'already_in_db') {
      return (
        <Button
          icon={<ExclamationCircleOutlined />}
          disabled
          type="default"
          size="small"
        >
          Уже в каталоге
        </Button>
      );
    }
    return (
      <Button
        type="primary"
        icon={<PlusOutlined />}
        size="small"
        onClick={() => onAdd(candidate)}
      >
        В черновик
      </Button>
    );
  };

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 12,
        transition: 'all 150ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={8} style={{ marginBottom: 4 }}>
            <Tag color={RATE_SOURCE_COLOR[candidate.source]} style={{ margin: 0 }}>
              {RATE_SOURCE_LABEL[candidate.source]}
            </Tag>
            {candidate.code && (
              <Typography.Text
                code
                style={{ fontSize: 12, color: '#8c8c8c' }}
              >
                {candidate.code}
              </Typography.Text>
            )}
            {candidate.score !== undefined && (
              <Tooltip title="Релевантность Fuse.js (меньше = ближе)">
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  score {(candidate.score ?? 0).toFixed(3)}
                </Typography.Text>
              </Tooltip>
            )}
            {candidate.confidence !== undefined && (
              <Tooltip title={`Уверенность LLM: ${(candidate.confidence * 100).toFixed(0)}%`}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: confidenceColor(candidate.confidence),
                  }}
                />
              </Tooltip>
            )}
          </Space>

          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#262626',
              marginBottom: 2,
              wordBreak: 'break-word',
            }}
          >
            {candidate.name}
          </div>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Единица: {candidate.unit || '—'}
          </Typography.Text>

          {candidate.reasoning && (
            <div style={{ marginTop: 6 }}>
              <Button
                type="link"
                size="small"
                onClick={() => setReasoningOpen(!reasoningOpen)}
                icon={reasoningOpen ? <UpOutlined /> : <DownOutlined />}
                style={{ padding: 0, fontSize: 12 }}
              >
                {reasoningOpen ? 'Свернуть обоснование' : 'Обоснование LLM'}
              </Button>
              {reasoningOpen && (
                <Typography.Paragraph
                  type="secondary"
                  style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}
                >
                  {candidate.reasoning}
                </Typography.Paragraph>
              )}
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0 }}>{renderButton()}</div>
      </div>
    </div>
  );
}
