import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  AutoComplete,
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import {
  addRateMaterial,
  loadRateMaterials,
  removeRateMaterial,
  updateRateMaterial,
  type RateKind,
  type RateMaterialRow,
} from '../../lib/importedRates';
import {
  createMaterial,
  findMaterialByName,
  type MaterialRow,
} from '../../lib/materials';
import type { MaterialsCatalog } from '../../hooks/useMaterialsCatalog';

interface Props {
  rateId: string;
  catalog: MaterialsCatalog;
  autoOpenDraft?: boolean;
  onDraftOpened?: () => void;
  onMaterialsCountChange?: (count: number) => void;
}

const priceFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPrice(v: number | null): string {
  return v === null || v === undefined ? '—' : priceFmt.format(v);
}

const qtyFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

function formatQuantity(v: number): string {
  return qtyFmt.format(v);
}

function renderRateKindTag(kind: RateKind) {
  if (kind === 'optional') return <Tag color="blue">Опц</Tag>;
  return <Tag>Баз</Tag>;
}

type DraftState = {
  name: string;
  materialId: string | null;
  unit: string | null;
  price: number | null;
  quantity: number;
  rateType: RateKind;
  options: MaterialRow[];
};

const emptyDraft = (): DraftState => ({
  name: '',
  materialId: null,
  unit: null,
  price: null,
  quantity: 1,
  rateType: 'base',
  options: [],
});

type EditBuffer = {
  quantity: number;
  rateType: RateKind;
};

export default function RateMaterialsPanel({
  rateId,
  catalog,
  autoOpenDraft,
  onDraftOpened,
  onMaterialsCountChange,
}: Props) {
  const { message } = App.useApp();

  const [rows, setRows] = useState<RateMaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<EditBuffer>({ quantity: 1, rateType: 'base' });
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadRateMaterials(rateId);
      setRows(data);
      onMaterialsCountChange?.(data.length);
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [rateId, message, onMaterialsCountChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (autoOpenDraft && !draft && !editingId) {
      setDraft(emptyDraft());
      onDraftOpened?.();
    }
  }, [autoOpenDraft, draft, editingId, onDraftOpened]);

  const cancelDraft = () => {
    setDraft(null);
  };

  const handleDraftNameChange = (value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const options = catalog.searchByName(value, 12);
      return {
        ...d,
        name: value,
        materialId: null,
        unit: null,
        price: null,
        options,
      };
    });
  };

  const handleDraftSelect = (_value: string, option: { data?: MaterialRow }) => {
    const mat = option?.data;
    if (!mat) return;
    setDraft((d) =>
      d
        ? {
            ...d,
            name: mat.name,
            materialId: mat.id,
            unit: mat.unit,
            price: mat.price,
            options: [],
          }
        : d,
    );
  };

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      message.error('Название материала обязательно');
      return;
    }
    setSaving(true);
    try {
      let materialId = draft.materialId;
      if (!materialId) {
        const existing = await findMaterialByName(name);
        if (existing) {
          materialId = existing.id;
          catalog.addLocal(existing);
        } else {
          const created = await createMaterial({
            name,
            unit: draft.unit,
            price: draft.price,
          });
          materialId = created.id;
          catalog.addLocal(created);
        }
      }
      await addRateMaterial({
        rate_id: rateId,
        material_id: materialId,
        quantity: draft.quantity,
        rate_type: draft.rateType,
      });
      message.success('Материал добавлен к расценке');
      setDraft(null);
      await refresh();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: RateMaterialRow) => {
    setEditingId(row.id);
    setEditBuffer({ quantity: row.quantity, rateType: row.rate_type });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateRateMaterial(editingId, {
        quantity: editBuffer.quantity,
        rate_type: editBuffer.rateType,
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeRateMaterial(id);
      await refresh();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  };

  const columns = useMemo<ColumnsType<RateMaterialRow>>(
    () => [
      {
        title: '',
        dataIndex: 'material_name',
        key: 'material_name',
      },
      {
        title: 'Ед. изм.',
        dataIndex: 'material_unit',
        key: 'material_unit',
        width: 90,
        render: (v: string | null) => v || '—',
      },
      {
        title: 'Цена',
        dataIndex: 'material_price',
        key: 'material_price',
        width: 120,
        align: 'right',
        render: (v: number | null) => formatPrice(v),
      },
      {
        title: 'Расход',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 130,
        align: 'right',
        render: (v: number, row) => {
          if (editingId === row.id) {
            return (
              <InputNumber
                value={editBuffer.quantity}
                onChange={(val) =>
                  setEditBuffer((b) => ({ ...b, quantity: typeof val === 'number' ? val : 0 }))
                }
                min={0}
                step={0.01}
                decimalSeparator=","
                style={{ width: '100%' }}
              />
            );
          }
          return formatQuantity(v);
        },
      },
      {
        title: 'Тип',
        dataIndex: 'rate_type',
        key: 'rate_type',
        width: 110,
        render: (v: RateKind, row) => {
          if (editingId === row.id) {
            return (
              <Select<RateKind>
                value={editBuffer.rateType}
                onChange={(val) => setEditBuffer((b) => ({ ...b, rateType: val }))}
                options={[
                  { value: 'base', label: 'Баз' },
                  { value: 'optional', label: 'Опц' },
                ]}
                style={{ width: '100%' }}
              />
            );
          }
          return renderRateKindTag(v);
        },
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 120,
        render: (_v, row) => {
          if (editingId === row.id) {
            return (
              <Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => void saveEdit()}
                />
                <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit} />
              </Space>
            );
          }
          return (
            <Space>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={!!editingId || !!draft}
                onClick={() => startEdit(row)}
              />
              <Popconfirm
                title="Удалить материал из расценки?"
                okText="Да"
                cancelText="Нет"
                onConfirm={() => void handleDelete(row.id)}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={!!editingId || !!draft}
                />
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId, editBuffer, draft],
  );

  return (
    <div style={{ padding: '8px 4px' }}>
      {rows.length > 0 ? (
        <Table<RateMaterialRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          loading={loading || catalog.loading}
        />
      ) : null}
      {draft ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: '#fafafa',
            borderRadius: 6,
            border: '1px dashed #d9d9d9',
          }}
        >
          <Space align="start" wrap size={8}>
            <div style={{ minWidth: 280 }}>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
              >
                Название
              </Typography.Text>
              <AutoComplete
                value={draft.name}
                onChange={handleDraftNameChange}
                onSelect={handleDraftSelect as any}
                options={draft.options.map((m) => ({
                  value: m.name,
                  label: (
                    <Space size={4}>
                      <span>{m.name}</span>
                      {m.unit ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {m.unit}
                        </Typography.Text>
                      ) : null}
                      {m.price !== null ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {priceFmt.format(m.price)}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  ),
                  data: m,
                }))}
                placeholder="Начните вводить название"
                style={{ width: 280 }}
                allowClear
                autoFocus
              />
            </div>
            <div style={{ minWidth: 120 }}>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
              >
                Ед. изм.
              </Typography.Text>
              <Input
                value={draft.unit ?? ''}
                disabled={!!draft.materialId}
                onChange={(e) =>
                  setDraft((d) =>
                    d ? { ...d, unit: e.target.value ? e.target.value : null } : d,
                  )
                }
                placeholder="шт"
                style={{ width: 120 }}
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
              >
                Цена
              </Typography.Text>
              <InputNumber
                value={draft.price ?? undefined}
                disabled={!!draft.materialId}
                onChange={(val) =>
                  setDraft((d) =>
                    d
                      ? { ...d, price: typeof val === 'number' ? val : null }
                      : d,
                  )
                }
                min={0}
                step={0.01}
                decimalSeparator=","
                style={{ width: 140 }}
                placeholder="0,00"
              />
            </div>
            <div style={{ minWidth: 120 }}>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
              >
                Расход
              </Typography.Text>
              <InputNumber
                value={draft.quantity}
                onChange={(val) =>
                  setDraft((d) =>
                    d ? { ...d, quantity: typeof val === 'number' ? val : 0 } : d,
                  )
                }
                min={0}
                step={0.01}
                decimalSeparator=","
                style={{ width: 120 }}
              />
            </div>
            <div style={{ minWidth: 110 }}>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
              >
                Тип
              </Typography.Text>
              <Select<RateKind>
                value={draft.rateType}
                onChange={(val) =>
                  setDraft((d) => (d ? { ...d, rateType: val } : d))
                }
                options={[
                  { value: 'base', label: 'Баз' },
                  { value: 'optional', label: 'Опц' },
                ]}
                style={{ width: 110 }}
              />
            </div>
            <div style={{ alignSelf: 'end' }}>
              <Space>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={saving}
                  onClick={() => void saveDraft()}
                >
                  Сохранить
                </Button>
                <Button icon={<CloseOutlined />} onClick={cancelDraft}>
                  Отмена
                </Button>
              </Space>
            </div>
          </Space>
          {draft.materialId ? (
            <div style={{ marginTop: 8 }}>
              <Tag color="green">Выбран существующий материал</Tag>
            </div>
          ) : draft.name.trim().length >= 2 && draft.options.length === 0 ? (
            <div style={{ marginTop: 8 }}>
              <Tag color="gold">Будет создан новый материал в справочнике</Tag>
            </div>
          ) : null}
        </div>
      ) : null}
      {!draft && catalog.loading ? (
        <div style={{ marginTop: 8 }}>
          <Spin size="small" />
        </div>
      ) : null}
    </div>
  );
}
