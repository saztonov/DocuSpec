import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Table, Space, Button, Spin, Alert, App, Popconfirm, Tag } from 'antd';
import { DeleteOutlined, DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import type { DbStatement, DbStatementItem } from '../types/database.ts';

const { Title, Text } = Typography;

export default function StatementViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [statement, setStatement] = useState<DbStatement | null>(null);
  const [items, setItems] = useState<DbStatementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editField, setEditField] = useState<string>('');
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      try {
        const [stmtRes, itemsRes] = await Promise.all([
          supabase.from('statements').select('*').eq('id', id).single(),
          supabase.from('statement_items').select('*').eq('statement_id', id).order('canonical_name'),
        ]);
        if (stmtRes.error) throw new Error(stmtRes.error.message);
        if (itemsRes.error) throw new Error(itemsRes.error.message);
        setStatement(stmtRes.data as DbStatement);
        setItems((itemsRes.data as DbStatementItem[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    const { error: err } = await supabase.from('statements').delete().eq('id', id);
    if (err) {
      message.error('Ошибка удаления');
    } else {
      message.success('Ведомость удалена');
      navigate('/statements');
    }
  }

  function startEdit(recordId: string, field: string, currentValue: string) {
    setEditingKey(recordId);
    setEditField(field);
    setEditValue(currentValue);
  }

  async function saveEdit(recordId: string) {
    const updateData: Record<string, unknown> = { [editField]: editField === 'total_qty' ? parseFloat(editValue) || null : editValue };
    const { error: err } = await supabase
      .from('statement_items')
      .update(updateData)
      .eq('id', recordId);

    if (err) {
      message.error('Ошибка сохранения');
    } else {
      message.success('Сохранено');
      setItems(prev => prev.map(i =>
        i.id === recordId ? { ...i, ...updateData } : i
      ));
    }
    setEditingKey(null);
  }

  function renderEditable(value: string | number | null, record: DbStatementItem, field: string) {
    if (editingKey === record.id && editField === field) {
      return (
        <Space.Compact style={{ width: '100%' }}>
          <input
            style={{ flex: 1, padding: '2px 8px', border: '1px solid #d9d9d9', borderRadius: 4 }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void saveEdit(record.id); if (e.key === 'Escape') setEditingKey(null); }}
            autoFocus
          />
          <Button size="small" type="primary" onClick={() => void saveEdit(record.id)}>OK</Button>
          <Button size="small" onClick={() => setEditingKey(null)}>✕</Button>
        </Space.Compact>
      );
    }
    return (
      <Text
        style={{ cursor: 'pointer' }}
        onClick={() => startEdit(record.id, field, String(value ?? ''))}
        title="Нажмите для редактирования"
      >
        {value != null ? String(value) : <Text type="secondary" italic>—</Text>}
      </Text>
    );
  }

  function exportCsv() {
    if (!statement) return;
    const header = ['№', 'Наименование', 'Ед.', 'Итого кол-во', 'Источников'];
    const rows = items.map((item, idx) => [
      String(idx + 1),
      item.canonical_name,
      item.unit ?? '',
      item.total_qty?.toString() ?? '',
      item.fact_count.toString(),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${statement.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 64 }}><Spin size="large" /></div>;
  if (error || !statement) return <Alert type="error" message="Ошибка" description={error ?? 'Ведомость не найдена'} showIcon />;

  const columns = [
    {
      title: '№',
      key: 'rowNum',
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: 'Наименование',
      dataIndex: 'canonical_name',
      key: 'canonical_name',
      ellipsis: true,
      render: (v: string, record: DbStatementItem) => renderEditable(v, record, 'canonical_name'),
    },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 60,
      render: (v: string | null, record: DbStatementItem) => renderEditable(v, record, 'unit'),
    },
    {
      title: 'Итого кол-во',
      dataIndex: 'total_qty',
      key: 'total_qty',
      width: 120,
      render: (v: number | null, record: DbStatementItem) => renderEditable(v, record, 'total_qty'),
    },
    { title: 'Источников', dataIndex: 'fact_count', key: 'fact_count', width: 100 },
    {
      title: 'Проверены',
      dataIndex: 'user_verified',
      key: 'user_verified',
      width: 100,
      render: (v: boolean) => v ? <Tag color="green">Да</Tag> : <Tag>Нет</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/statements')}>Назад</Button>
      </Space>

      <Title level={3}>{statement.name}</Title>

      <Space>
        {statement.model_used && <Tag color="blue">{statement.model_used}</Tag>}
        <Text type="secondary">{new Date(statement.created_at).toLocaleString('ru-RU')}</Text>
      </Space>

      <Space>
        <Button icon={<DownloadOutlined />} onClick={exportCsv}>Экспорт CSV</Button>
        <Popconfirm title="Удалить ведомость?" onConfirm={() => void handleDelete()} okText="Да" cancelText="Нет">
          <Button danger icon={<DeleteOutlined />}>Удалить</Button>
        </Popconfirm>
      </Space>

      <Table
        dataSource={items.map(i => ({ ...i, key: i.id }))}
        columns={columns}
        size="small"
        pagination={{ defaultPageSize: 30 }}
        locale={{ emptyText: 'Позиции отсутствуют' }}
      />
    </Space>
  );
}
