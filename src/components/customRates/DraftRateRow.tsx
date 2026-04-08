import { Button, Input, Select, Tag, Tooltip, Typography } from 'antd';
import { CloseOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { DraftRow } from '../../types/customRates';
import { RATE_SOURCE_COLOR, RATE_SOURCE_LABEL } from '../../types/customRates';
import type { RateCategory, RateType } from '../../lib/importedRates';

interface Props {
  row: DraftRow;
  categories: RateCategory[];
  types: RateType[];
  onUpdate: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
}

export default function DraftRateRow({ row, categories, types, onUpdate, onRemove }: Props) {
  const filteredTypes = row.categoryId
    ? types.filter((t) => t.category_id === row.categoryId)
    : [];

  const isInvalid = !row.workName.trim() || !row.categoryId || !row.typeId;
  const isDuplicate = row.status === 'duplicate';
  const isError = row.status === 'error';

  const bg = isDuplicate ? '#fffbe6' : isError ? '#fff2f0' : '#fff';
  const border = isDuplicate ? '#ffd591' : isError ? '#ffccc7' : '#e8e8e8';

  const handleCategoryChange = (categoryId: string | null) => {
    // При смене категории очищаем typeId, если он не относится к новой категории
    const validType = types.find((t) => t.id === row.typeId && t.category_id === categoryId);
    onUpdate({
      categoryId,
      typeId: validType ? row.typeId : null,
      status: 'editing',
      error: undefined,
    });
  };

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        padding: 10,
        marginBottom: 8,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Tag color={RATE_SOURCE_COLOR[row.source]} style={{ margin: 0 }}>
          {RATE_SOURCE_LABEL[row.source]}
        </Tag>
        {row.sourceCode && (
          <Typography.Text code style={{ fontSize: 11, color: '#8c8c8c' }}>
            {row.sourceCode}
          </Typography.Text>
        )}
        {isInvalid && !isDuplicate && !isError && (
          <Tooltip title="Заполните наименование, категорию и вид затрат">
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          </Tooltip>
        )}
        {isDuplicate && (
          <Tag color="warning" style={{ margin: 0 }}>
            Уже в каталоге
          </Tag>
        )}
        {isError && (
          <Tooltip title={row.error}>
            <Tag color="error" style={{ margin: 0 }}>
              Ошибка
            </Tag>
          </Tooltip>
        )}
        <div style={{ flex: 1 }} />
        <Button
          icon={<CloseOutlined />}
          type="text"
          size="small"
          onClick={onRemove}
          danger
        />
      </div>

      <Input
        value={row.workName}
        onChange={(e) => onUpdate({ workName: e.target.value, status: 'editing', error: undefined })}
        placeholder="Наименование работы"
        size="small"
        style={{ marginBottom: 6 }}
      />

      <Input
        value={row.unit}
        onChange={(e) => onUpdate({ unit: e.target.value, status: 'editing', error: undefined })}
        placeholder="Единица измерения"
        size="small"
        style={{ marginBottom: 6 }}
      />

      <Select<string | null>
        value={row.categoryId}
        onChange={(v) => handleCategoryChange(v ?? null)}
        placeholder="Категория затрат"
        size="small"
        style={{ width: '100%', marginBottom: 6 }}
        showSearch
        optionFilterProp="label"
        allowClear
        options={categories.map((c) => ({ label: c.name, value: c.id }))}
        status={!row.categoryId ? 'warning' : undefined}
      />

      <Select<string | null>
        value={row.typeId}
        onChange={(v) => onUpdate({ typeId: v ?? null, status: 'editing', error: undefined })}
        placeholder={row.categoryId ? 'Вид затрат' : 'Сначала выберите категорию'}
        size="small"
        style={{ width: '100%' }}
        showSearch
        optionFilterProp="label"
        allowClear
        disabled={!row.categoryId}
        options={filteredTypes.map((t) => ({ label: t.name, value: t.id }))}
        status={!row.typeId && row.categoryId ? 'warning' : undefined}
      />

      {row.reasoning && (
        <Typography.Text
          type="secondary"
          style={{ fontSize: 11, display: 'block', marginTop: 6, fontStyle: 'italic' }}
          ellipsis={{ tooltip: row.reasoning }}
        >
          От LLM: {row.reasoning}
        </Typography.Text>
      )}
    </div>
  );
}
