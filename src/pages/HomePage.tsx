import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Space, Table, Tag, App, Button, Popconfirm, Empty } from 'antd';
import { FileTextOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import { useDocument } from '../hooks/useDocument.ts';
import type { DbDocument } from '../types/database.ts';
import AppHeader from '../components/layout/AppHeader.tsx';
import HamburgerMenu from '../components/layout/HamburgerMenu.tsx';
import UploadModal from '../components/UploadModal.tsx';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  uploaded: 'default',
  parsing: 'processing',
  extracting: 'processing',
  done: 'success',
  error: 'error',
  has_errors: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Загружен',
  parsing: 'Разбор',
  extracting: 'Извлечение',
  done: 'Готов',
  error: 'Ошибка',
  has_errors: 'Есть ошибки',
};

export default function HomePage() {
  const navigate = useNavigate();
  const { deleteDocument } = useDocument();
  const { message } = App.useApp();
  const [documents, setDocuments] = useState<DbDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    async function loadDocs() {
      setLoadingDocs(true);
      const { data } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      setDocuments((data as DbDocument[]) ?? []);
      setLoadingDocs(false);
    }
    void loadDocs();
  }, []);

  async function handleDeleteDoc(docId: string) {
    try {
      await deleteDocument(docId);
      message.success('Документ удалён');
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch {
      message.error('Ошибка удаления документа');
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
      title: 'Документ',
      dataIndex: 'filename',
      key: 'filename',
      render: (name: string, record: DbDocument) => (
        <Link to={`/doc/${record.id}`}>
          <Space>
            <FileTextOutlined />
            <Text>{name}</Text>
          </Space>
        </Link>
      ),
    },
    {
      title: 'Код',
      dataIndex: 'doc_code',
      key: 'doc_code',
      width: 160,
      render: (v: string | null) => v || '-',
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_LABEL[s] ?? s}</Tag>
      ),
    },
    {
      title: 'Страниц',
      dataIndex: 'page_count',
      key: 'page_count',
      width: 90,
      render: (v: number | null) => v ?? '-',
    },
    {
      title: 'Блоков',
      dataIndex: 'block_count',
      key: 'block_count',
      width: 90,
      render: (v: number | null) => v ?? '-',
    },
    {
      title: 'Ошибки',
      dataIndex: 'error_blocks_count',
      key: 'error_blocks_count',
      width: 80,
      render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : '0',
    },
    {
      title: 'Дата',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('ru-RU'),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: DbDocument) => (
        <Popconfirm
          title="Удалить документ?"
          description="Будут удалены блоки, материалы и ведомости этого документа."
          onConfirm={() => void handleDeleteDoc(record.id)}
          okText="Да"
          cancelText="Нет"
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <AppHeader onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={(docId) => navigate(`/doc/${docId}`)}
      />

      <div style={{ padding: 24, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Title level={3} style={{ margin: 0 }}>Документы</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setUploadOpen(true)}
          >
            Загрузить
          </Button>
        </div>

        {!loadingDocs && documents.length === 0 ? (
          <Empty description="Документы ещё не загружены">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadOpen(true)}>
              Загрузить первый документ
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={documents.map(d => ({ ...d, key: d.id }))}
            columns={columns}
            size="middle"
            loading={loadingDocs}
            pagination={{ defaultPageSize: 10 }}
            scroll={{ x: 800 }}
            onRow={(record) => ({
              onClick: () => navigate(`/doc/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>
    </>
  );
}
