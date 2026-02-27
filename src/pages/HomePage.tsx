import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Upload, Space, Table, Tag, App, Divider } from 'antd';
import { InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import { useDocument } from '../hooks/useDocument.ts';
import type { DbDocument } from '../types/database.ts';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface CustomRequestOptions {
  file: File | Blob | string;
  onSuccess?: (body: unknown) => void;
  onError?: (err: Error) => void;
}

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
  const { uploadDocument, loading: uploading } = useDocument();
  const { message } = App.useApp();
  const [documents, setDocuments] = useState<DbDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

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

  async function handleUpload(options: CustomRequestOptions) {
    const file = options.file as File;

    try {
      const docId = await uploadDocument(file);
      message.success(`Документ "${file.name}" загружен`);
      options.onSuccess?.(docId);
      navigate(`/doc/${docId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка загрузки';
      message.error(errorMessage);
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }

  const columns = [
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
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Title level={2}>Загрузка документа</Title>

      <Dragger
        accept=".md"
        multiple={false}
        showUploadList={false}
        customRequest={handleUpload}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          Нажмите или перетащите .md файл для загрузки
        </p>
        <p className="ant-upload-hint">
          Поддерживаются файлы Markdown с разметкой строительной документации
        </p>
      </Dragger>

      {documents.length > 0 && (
        <>
          <Divider />
          <Title level={4}>Загруженные документы</Title>
          <Table
            dataSource={documents.map(d => ({ ...d, key: d.id }))}
            columns={columns}
            size="small"
            loading={loadingDocs}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
          />
        </>
      )}
    </Space>
  );
}
