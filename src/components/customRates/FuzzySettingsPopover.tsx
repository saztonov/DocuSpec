import { Button, Popover, Slider, Typography, InputNumber, Switch, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { FuzzySettings } from '../../types/customRates';
import { DEFAULT_FUZZY_SETTINGS } from '../../types/customRates';

interface Props {
  value: FuzzySettings;
  onChange: (next: FuzzySettings) => void;
}

export default function FuzzySettingsPopover({ value, onChange }: Props) {
  const reset = () => onChange(DEFAULT_FUZZY_SETTINGS);

  const content = (
    <div style={{ width: 320 }}>
      <Typography.Text strong>Расширенные настройки fuzzy</Typography.Text>

      <div style={{ marginTop: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Distance — макс. дистанция совпадения
        </Typography.Text>
        <InputNumber
          min={0}
          max={1000}
          value={value.distance}
          onChange={(v) => onChange({ ...value, distance: Number(v ?? 100) })}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Min match char length
        </Typography.Text>
        <InputNumber
          min={1}
          max={10}
          value={value.minMatchCharLength}
          onChange={(v) => onChange({ ...value, minMatchCharLength: Number(v ?? 3) })}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Switch
          checked={value.ignoreLocation}
          onChange={(v) => onChange({ ...value, ignoreLocation: v })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Ignore location (искать по всей строке)
        </Typography.Text>
      </div>

      <div style={{ marginTop: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Вес поля «Наименование» ({value.weightName.toFixed(2)})
        </Typography.Text>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={value.weightName}
          onChange={(v) => onChange({ ...value, weightName: v as number })}
        />
      </div>

      <div style={{ marginTop: 4 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Вес поля «Код» ({value.weightCode.toFixed(2)})
        </Typography.Text>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={value.weightCode}
          onChange={(v) => onChange({ ...value, weightCode: v as number })}
        />
      </div>

      <div style={{ marginTop: 4 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Вес поля «Единица» ({value.weightUnit.toFixed(2)})
        </Typography.Text>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={value.weightUnit}
          onChange={(v) => onChange({ ...value, weightUnit: v as number })}
        />
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
        <Button size="small" onClick={reset}>
          Сбросить к дефолтам
        </Button>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Tooltip title="Расширенные настройки">
        <Button icon={<SettingOutlined />} type="text" />
      </Tooltip>
    </Popover>
  );
}

// ── localStorage helpers ────────────────────────────────────────

import { FUZZY_SETTINGS_LS_KEY } from '../../types/customRates';

export function loadFuzzySettings(): FuzzySettings {
  try {
    const raw = localStorage.getItem(FUZZY_SETTINGS_LS_KEY);
    if (!raw) return DEFAULT_FUZZY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<FuzzySettings>;
    return { ...DEFAULT_FUZZY_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_FUZZY_SETTINGS;
  }
}

export function saveFuzzySettings(settings: FuzzySettings): void {
  try {
    localStorage.setItem(FUZZY_SETTINGS_LS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
