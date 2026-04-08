import { Badge, Segmented, Typography } from 'antd';
import type { CreateRatesMode } from './createRatesReducer';

interface Props {
  mode: CreateRatesMode;
  onChange: (mode: CreateRatesMode) => void;
  draftCount: number;
}

export default function CreateRatesModeSwitch({ mode, onChange, draftCount }: Props) {
  return (
    <div
      style={{
        height: 48,
        flexShrink: 0,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        background: '#fff',
      }}
    >
      <Segmented
        value={mode}
        onChange={(v) => onChange(v as CreateRatesMode)}
        options={[
          { label: 'Быстрый поиск', value: 'search' },
          { label: 'LLM-чат', value: 'chat' },
        ]}
      />
      <div>
        <Typography.Text type="secondary" style={{ marginRight: 8 }}>
          В черновике:
        </Typography.Text>
        <Badge
          count={draftCount}
          showZero
          color={draftCount > 0 ? '#1677ff' : '#d9d9d9'}
          overflowCount={999}
        />
      </div>
    </div>
  );
}
