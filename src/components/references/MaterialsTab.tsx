import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Space,
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
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  createMaterial,
  deleteMaterial,
  loadMaterials,
  updateMaterial,
  type MaterialRow,
} from '../../lib/materials';

const priceFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPrice(v: number | null): string {
  return v === null || v === undefined ? '—' : priceFmt.format(v);
}

function genDraftId(): string {
  return `draft-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

type EditBuffer = {
  name: string;
  unit: string | null;
  price: number | null;
};

export default function MaterialsTab() {
  const { message } = App.useApp();

  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<EditBuffer>({
    name: '',
    unit: null,
    price: null,
  });
  const [draftRow, setDraftRow] = useState<MaterialRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadMaterials(search);
      setRows(data);
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, message]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    if (draftRow || editingId) return;
    const draft: MaterialRow = {
      id: genDraftId(),
      name: '',
      unit: null,
      price: null,
      created_at: '',
      updated_at: '',
    };
    setDraftRow(draft);
    setEditingId(draft.id);
    setEditBuffer({ name: '', unit: null, price: null });
  }

  function openEdit(record: MaterialRow) {
    setDraftRow(null);
    setEditingId(record.id);
    setEditBuffer({
      name: record.name,
      unit: record.unit,
      price: record.price,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftRow(null);
    setEditBuffer({ name: '', unit: null, price: null });
  }

  async function saveEdit() {
    const name = editBuffer.name.trim();
    if (!name) {
      message.error('Название обязательно');
      return;
    }
    try {
      if (draftRow) {
        await createMaterial({
          name,
          unit: editBuffer.unit,
          price: editBuffer.price,
        });
        message.success('Материал добавлен');
      } else if (editingId) {
        await updateMaterial(editingId, {
          name,
          unit: editBuffer.unit,
          price: editBuffer.price,
        });
        message.success('Материал обновлён');
      }
      cancelEdit();
      await refresh();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMaterial(id);
      message.success('Материал удалён');
      await refresh();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  function handleSearch() {
    setSearch(searchInput.trim());
  }

  const dataSource = useMemo<MaterialRow[]>(() => {
    if (draftRow) return [draftRow, ...rows];
    return rows;
  }, [draftRow, rows]);

  const columns = useMemo<ColumnsType<MaterialRow>>(
    () => [
      {
        title: '№',
        key: 'rowNum',
        width: 50,
        render: (_v, record, i) => {
          if (draftRow && record.id === draftRow.id) {
            return <Tag color="gold">new</Tag>;
          }
          return draftRow ? i : i + 1;
        },
      },
      {
        title: 'Название',
        dataIndex: 'name',
        key: 'name',
        render: (v, record) => {
          if (editingId === record.id) {
            return (
              <Input
                value={editBuffer.name}
                autoFocus
                onChange={(e) =>
                  setEditBuffer((b) => ({ ...b, name: e.target.value }))
                }
                onPressEnter={() => void saveEdit()}
                placeholder="Название материала"
              />
            );
          }
          return v;
        },
      },
      {
        title: 'Ед. изм.',
        dataIndex: 'unit',
        key: 'unit',
        width: 120,
        render: (v, record) => {
          if (editingId === record.id) {
            return (
              <Input
                value={editBuffer.unit ?? ''}
                onChange={(e) =>
                  setEditBuffer((b) => ({
                    ...b,
                    unit: e.target.value ? e.target.value : null,
                  }))
                }
                placeholder="шт, м, кг"
              />
            );
          }
          return v || '—';
        },
      },
      {
        title: 'Стоимость',
        dataIndex: 'price',
        key: 'price',
        width: 160,
        align: 'right',
        render: (v, record) => {
          if (editingId === record.id) {
            return (
              <InputNumber
                value={editBuffer.price ?? undefined}
                onChange={(val) =>
                  setEditBuffer((b) => ({
                    ...b,
                    price: typeof val === 'number' ? val : null,
                  }))
                }
                min={0}
                step={0.01}
                decimalSeparator=","
                style={{ width: '100%' }}
              />
            );
          }
          return formatPrice(v as number | null);
        },
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 140,
        render: (_v, record) => {
          if (editingId === record.id) {
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
                onClick={() => openEdit(record)}
                disabled={!!editingId}
              />
              <Popconfirm
                title="Удалить материал?"
                okText="Да"
                cancelText="Нет"
                onConfirm={() => void handleDelete(record.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} disabled={!!editingId} />
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId, editBuffer, draftRow],
  );

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={!!editingId}
        >
          Добавить материал
        </Button>
        <Input.Search
          placeholder="Поиск по названию"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onSearch={handleSearch}
          allowClear
          style={{ width: 260 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
          Обновить
        </Button>
        <Typography.Text type="secondary">Всего: {rows.length}</Typography.Text>
      </Space>
      <Table
        rowKey="id"
        dataSource={dataSource}
        columns={columns}
        size="small"
        loading={loading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        locale={{ emptyText: 'Материалы не добавлены' }}
      />
    </>
  );
}
