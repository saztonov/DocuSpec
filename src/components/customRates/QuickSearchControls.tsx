import { Input, Slider, Typography, Button, Space, Segmented } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import FuzzySettingsPopover from './FuzzySettingsPopover';
import type { FuzzySettings, RateSearchScope } from '../../types/customRates';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  settings: FuzzySettings;
  onSettingsChange: (next: FuzzySettings) => void;
  onSearch: () => void;
  loading: boolean;
  scope: RateSearchScope;
  onScopeChange: (s: RateSearchScope) => void;
}

export default function QuickSearchControls({
  query,
  onQueryChange,
  settings,
  onSettingsChange,
  onSearch,
  loading,
  scope,
  onScopeChange,
}: Props) {
  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder="Введите наименование расценки"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onPressEnter={onSearch}
          allowClear
          size="large"
        />
        <Button type="primary" icon={<SearchOutlined />} size="large" onClick={onSearch} loading={loading}>
          Найти
        </Button>
      </Space.Compact>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Typography.Text type="secondary" style={{ minWidth: 80 }}>
          База:
        </Typography.Text>
        <Segmented
          size="small"
          value={scope}
          onChange={(v) => onScopeChange(v as RateSearchScope)}
          options={[
            { label: 'ФСНБ', value: 'fsnb' },
            { label: '1С', value: 'imported' },
            { label: 'Обе', value: 'both' },
          ]}
        />
        <Typography.Text type="secondary" style={{ minWidth: 130 }}>
          Чувствительность:
        </Typography.Text>
        <Slider
          style={{ flex: 1 }}
          min={0}
          max={1}
          step={0.05}
          value={settings.threshold}
          onChange={(v) => onSettingsChange({ ...settings, threshold: v as number })}
          tooltip={{ formatter: (v) => `${v?.toFixed(2)}` }}
        />
        <Typography.Text type="secondary" style={{ minWidth: 90, fontSize: 12 }}>
          {settings.threshold < 0.3
            ? 'строгий'
            : settings.threshold < 0.6
            ? 'средний'
            : 'мягкий'}
        </Typography.Text>
        <FuzzySettingsPopover value={settings} onChange={onSettingsChange} />
      </div>
    </div>
  );
}
