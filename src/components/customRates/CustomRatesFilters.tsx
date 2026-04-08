import { Card, Input, Select, Space, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { RateCategory, RateType } from '../../lib/importedRates';
import type { CustomRatesFilters as Filters } from '../../hooks/useCustomRates';
import type { RateSourceKind } from '../../types/customRates';
import { RATE_SOURCE_LABEL } from '../../types/customRates';

interface Props {
  value: Filters;
  categories: RateCategory[];
  types: RateType[];
  onChange: (patch: Partial<Filters>) => void;
  onCategoryChange: (categoryId: string | null) => void | Promise<void>;
}

export default function CustomRatesFilters({
  value,
  categories,
  types,
  onChange,
  onCategoryChange,
}: Props) {
  const filteredTypes = value.categoryId
    ? types.filter((t) => t.category_id === value.categoryId)
    : types;

  const handleReset = () => {
    onChange({ categoryId: null, typeId: null, sourceKind: null, search: '' });
    void onCategoryChange(null);
  };

  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <Space wrap>
        <Input.Search
          style={{ width: 280 }}
          placeholder="Поиск по наименованию"
          allowClear
          value={value.search}
          onChange={(e) => onChange({ search: e.target.value })}
          onSearch={(s) => onChange({ search: s })}
        />
        <Select<string | null>
          style={{ minWidth: 220 }}
          placeholder="Категория затрат"
          allowClear
          showSearch
          optionFilterProp="label"
          value={value.categoryId}
          onChange={(v) => onCategoryChange(v ?? null)}
          options={categories.map((c) => ({ label: c.name, value: c.id }))}
        />
        <Select<string | null>
          style={{ minWidth: 220 }}
          placeholder="Вид затрат"
          allowClear
          showSearch
          optionFilterProp="label"
          value={value.typeId}
          onChange={(v) => onChange({ typeId: v ?? null })}
          options={filteredTypes.map((t) => ({ label: t.name, value: t.id }))}
        />
        <Select<RateSourceKind | null>
          style={{ minWidth: 160 }}
          placeholder="Источник"
          allowClear
          value={value.sourceKind}
          onChange={(v) => onChange({ sourceKind: (v ?? null) as RateSourceKind | null })}
          options={[
            { label: RATE_SOURCE_LABEL.fsnb, value: 'fsnb' },
            { label: RATE_SOURCE_LABEL.imported, value: 'imported' },
            { label: RATE_SOURCE_LABEL.custom, value: 'custom' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          Сброс
        </Button>
      </Space>
    </Card>
  );
}
