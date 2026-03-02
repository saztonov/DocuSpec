import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Typography, Table, Space, Button, Tag, App, Popconfirm } from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import type { DbStatement } from '../types/database.ts';

const { Title, Text } = Typography;

export default function StatementsPage() {
  const [statements, setStatements] = useState<DbStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const { message } = App.useApp();

  async function loadStatements() {
    setLoading(true);
    const { data } = await supabase
      .from('statements')
      .select('*')
      .order('created_at', { ascending: false });
    setStatements((data as DbStatement[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void loadStatements(); }, []);

  async function handleDelete(id: string) {
    const { error } = await supabase.from('statements').delete().eq('id', id);
    if (error) {
      message.error('Ошибка удаления');
    } else {
      message.success('Ведомость удалена');
      setStatements(prev => prev.filter(s => s.id !== id));
    }
  }

  const columns = [
    {
      title: '№',
      key: 'rowNum',
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: DbStatement) => (
        <Link to={`/statements/${record.id}`}>
          <Text strong>{name}</Text>
        </Link>
      ),
    },
    {
      title: 'Модель',
      dataIndex: 'model_used',
      key: 'model_used',
      width: 200,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: 'Позиций',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 90,
      render: (v: number | null) => v ?? '-',
    },
    {
      title: 'Дата',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('ru-RU'),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: DbStatement) => (
        <Space>
          <Link to={`/statements/${record.id}`}>
            <Button size="small" icon={<EyeOutlined />} />
          </Link>
          <Popconfirm
            title="Удалить ведомость?"
            onConfirm={() => void handleDelete(record.id)}
            okText="Да"
            cancelText="Нет"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={2}>Ведомости</Title>
      <Table
        dataSource={statements.map(s => ({ ...s, key: s.id }))}
        columns={columns}
        size="small"
        loading={loading}
        pagination={{ defaultPageSize: 20 }}
        locale={{ emptyText: 'Ведомости ещё не созданы' }}
      />
    </Space>
  );
}
