import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Typography,
  Tabs,
  Tag,
  Space,
  Spin,
  Alert,
  Descriptions,
  Table,
  Button,
  Progress,
  App,
} from 'antd';
import {
  FileTextOutlined,
  ExperimentOutlined,
  UnorderedListOutlined,
  WarningOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import { useBom } from '../hooks/useBom.ts';
import { useExtraction } from '../hooks/useExtraction.ts';
import { generateCanonicalKey } from '../lib/canonical.ts';
import type { DbDocument, DbDocPage, DbDocBlock, DbMaterialFact } from '../types/database.ts';

const { Title, Text } = Typography;

// ── Status color mapping ──
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

// ── ErrorBlocksAlert ──
function ErrorBlocksAlert({ blocks }: { blocks: DbDocBlock[] }) {
  const errorBlocks = blocks.filter((b) => b.has_error);
  if (errorBlocks.length === 0) return null;

  return (
    <Alert
      type="warning"
      showIcon
      icon={<WarningOutlined />}
      message={`Обнаружено блоков с ошибками: ${errorBlocks.length}`}
      description={
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          {errorBlocks.slice(0, 10).map((b) => (
            <li key={b.id}>
              <Text code>{b.block_uid}</Text>{' '}
              <Text type="secondary">{b.error_text ?? 'Неизвестная ошибка'}</Text>
            </li>
          ))}
          {errorBlocks.length > 10 && (
            <li>
              <Text type="secondary">...и ещё {errorBlocks.length - 10}</Text>
            </li>
          )}
        </ul>
      }
      style={{ marginBottom: 16 }}
    />
  );
}

// ── BlockList ──
function BlockList({ pages, blocks }: { pages: DbDocPage[]; blocks: DbDocBlock[] }) {
  const pageMap = new Map(pages.map((p) => [p.id, p]));

  const dataSource = blocks.map((b) => {
    const page = pageMap.get(b.page_id);
    return {
      key: b.id,
      block_uid: b.block_uid,
      block_type: b.block_type,
      page_no: page?.page_no ?? '-',
      sheet_label: page?.sheet_label ?? '-',
      has_table: b.has_table,
      has_error: b.has_error,
      error_text: b.error_text,
      section_title: b.section_title,
      content_preview: b.content.slice(0, 120) + (b.content.length > 120 ? '...' : ''),
    };
  });

  const columns = [
    {
      title: 'Стр.',
      dataIndex: 'page_no',
      key: 'page_no',
      width: 60,
    },
    {
      title: 'Блок',
      dataIndex: 'block_uid',
      key: 'block_uid',
      width: 180,
      render: (uid: string) => <Text code>{uid}</Text>,
    },
    {
      title: 'Тип',
      dataIndex: 'block_type',
      key: 'block_type',
      width: 80,
      render: (type: string) => (
        <Tag color={type === 'TEXT' ? 'blue' : 'purple'}>{type}</Tag>
      ),
    },
    {
      title: 'Таблица',
      dataIndex: 'has_table',
      key: 'has_table',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="cyan">Да</Tag> : '-'),
    },
    {
      title: 'Ошибка',
      dataIndex: 'has_error',
      key: 'has_error',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="red">Да</Tag> : '-'),
    },
    {
      title: 'Раздел',
      dataIndex: 'section_title',
      key: 'section_title',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Содержимое',
      dataIndex: 'content_preview',
      key: 'content_preview',
      ellipsis: true,
    },
  ];

  return (
    <Table
      dataSource={dataSource}
      columns={columns}
      size="small"
      pagination={{ pageSize: 20 }}
      scroll={{ x: 900 }}
    />
  );
}

// ── MaterialFactTable with inline editing ──
function MaterialFactTable({ docId }: { docId: string }) {
  const [facts, setFacts] = useState<DbMaterialFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const { message: msg } = App.useApp();

  async function loadFacts() {
    setLoading(true);
    const { data } = await supabase
      .from('material_facts')
      .select('*')
      .eq('doc_id', docId)
      .order('created_at');
    setFacts((data as DbMaterialFact[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void loadFacts(); }, [docId]);

  function startEdit(record: DbMaterialFact) {
    setEditingKey(record.id);
    setEditValue(record.canonical_name || record.raw_name);
  }

  async function saveEdit(id: string) {
    const newKey = generateCanonicalKey(editValue);
    const { error } = await supabase
      .from('material_facts')
      .update({ canonical_name: editValue, canonical_key: newKey, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      msg.error('Ошибка сохранения');
    } else {
      msg.success('Сохранено');
      setFacts(prev => prev.map(f =>
        f.id === id ? { ...f, canonical_name: editValue, canonical_key: newKey } : f
      ));
    }
    setEditingKey(null);
  }

  const columns = [
    { title: 'Наименование', dataIndex: 'raw_name', key: 'raw_name', width: 250, ellipsis: true },
    {
      title: 'Канон. имя',
      dataIndex: 'canonical_name',
      key: 'canonical_name',
      width: 250,
      render: (val: string, record: DbMaterialFact) => {
        if (editingKey === record.id) {
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
            onClick={() => startEdit(record)}
            title="Нажмите для редактирования"
          >
            {val || <Text type="secondary" italic>—</Text>}
          </Text>
        );
      },
    },
    { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 90 },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 60 },
    { title: 'Марка', dataIndex: 'mark', key: 'mark', width: 100, ellipsis: true },
    { title: 'ГОСТ', dataIndex: 'gost', key: 'gost', width: 130, ellipsis: true },
    {
      title: 'Источник',
      dataIndex: 'source_snippet',
      key: 'source_snippet',
      width: 200,
      ellipsis: true,
      render: (v: string) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : '-',
    },
    {
      title: 'Уверенность',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 90,
      render: (v: number) => {
        const pct = Math.round(v * 100);
        const color = pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red';
        return <Tag color={color}>{pct}%</Tag>;
      },
    },
  ];

  return (
    <Table
      dataSource={facts.map((f) => ({ ...f, key: f.id }))}
      columns={columns}
      size="small"
      loading={loading}
      pagination={{ pageSize: 30 }}
      scroll={{ x: 1100 }}
      locale={{ emptyText: 'Материалы ещё не извлечены. Нажмите "Собрать ведомость".' }}
    />
  );
}

// ── BomView with expandable rows + CSV export ──
function BomView({ docId }: { docId: string }) {
  const { bomLines, loading, error } = useBom(docId);
  const [expandedFacts, setExpandedFacts] = useState<Map<string, DbMaterialFact[]>>(new Map());

  async function loadFactsForKey(canonicalKey: string) {
    if (expandedFacts.has(canonicalKey)) return;
    const { data } = await supabase
      .from('material_facts')
      .select('*')
      .eq('doc_id', docId)
      .eq('canonical_key', canonicalKey)
      .order('created_at');
    setExpandedFacts(prev => new Map(prev).set(canonicalKey, (data as DbMaterialFact[]) ?? []));
  }

  function exportCsv() {
    const header = ['Канон. ключ', 'Наименование', 'Ед.', 'Итого кол-во', 'Кол-во источников'];
    const rows = bomLines.map(b => [
      b.canonical_key,
      b.canonical_name,
      b.unit ?? '',
      b.total_qty?.toString() ?? '',
      b.fact_count.toString(),
    ]);

    const csv = [header, ...rows].map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const bom = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(bom);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bom_${docId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return <Alert type="error" message="Ошибка загрузки ведомости" description={error} />;
  }

  const columns = [
    { title: 'Наименование', dataIndex: 'canonical_name', key: 'canonical_name', ellipsis: true },
    { title: 'Канон. ключ', dataIndex: 'canonical_key', key: 'canonical_key', width: 200, ellipsis: true },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 60 },
    {
      title: 'Итого кол-во',
      dataIndex: 'total_qty',
      key: 'total_qty',
      width: 120,
      render: (v: number | null) => v != null ? <Text strong>{v}</Text> : '-',
    },
    { title: 'Источников', dataIndex: 'fact_count', key: 'fact_count', width: 100 },
    {
      title: 'Проверены',
      dataIndex: 'all_verified',
      key: 'all_verified',
      width: 100,
      render: (v: boolean) => (v ? <Tag color="green">Все</Tag> : <Tag>Нет</Tag>),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {bomLines.length > 0 && (
        <Button onClick={exportCsv} style={{ alignSelf: 'flex-end' }}>
          Экспорт CSV
        </Button>
      )}
      <Table
        dataSource={bomLines.map((b) => ({ ...b, key: b.canonical_key }))}
        columns={columns}
        size="small"
        loading={loading}
        pagination={{ pageSize: 30 }}
        scroll={{ x: 800 }}
        locale={{ emptyText: 'Сводная ведомость пока пуста' }}
        expandable={{
          expandedRowRender: (record) => {
            const facts = expandedFacts.get(record.canonical_key);
            if (!facts) return <Spin size="small" />;
            return (
              <Table
                dataSource={facts.map(f => ({ ...f, key: f.id }))}
                columns={[
                  { title: 'Исходное название', dataIndex: 'raw_name', key: 'raw_name', ellipsis: true },
                  { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 80 },
                  { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 60 },
                  { title: 'Источник (snippet)', dataIndex: 'source_snippet', key: 'source_snippet', ellipsis: true },
                  { title: 'Блок', dataIndex: 'block_id', key: 'block_id', width: 120, ellipsis: true },
                ]}
                size="small"
                pagination={false}
              />
            );
          },
          onExpand: (expanded, record) => {
            if (expanded) void loadFactsForKey(record.canonical_key);
          },
        }}
      />
    </Space>
  );
}

// ── ExtractionProgress ──
function ExtractionProgress({ docId, onComplete }: { docId: string; onComplete?: () => void }) {
  const { progress, runExtraction } = useExtraction(docId);
  const { message } = App.useApp();

  const isRunning = progress.status !== 'idle' && progress.status !== 'done' && progress.status !== 'error';

  async function handleStart() {
    try {
      await runExtraction();
      message.success(`Извлечение завершено: ${progress.extractedFacts} материалов`);
      onComplete?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка извлечения';
      message.error(msg);
    }
  }

  const statusLabels: Record<string, string> = {
    idle: 'Готов к запуску',
    rule_based: 'Извлечение из таблиц (правила)...',
    llm_extracting: `LLM-извлечение (${progress.completedBatches}/${progress.totalBatches})...`,
    merging: 'Объединение результатов...',
    saving: 'Сохранение...',
    done: `Готово: ${progress.extractedFacts} материалов`,
    error: progress.errorMessage ?? 'Ошибка',
  };

  const percent = progress.totalBatches > 0
    ? Math.round((progress.completedBatches / progress.totalBatches) * 100)
    : 0;

  return (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
      <Space>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={isRunning}
          onClick={handleStart}
          disabled={isRunning}
        >
          Собрать ведомость
        </Button>
        {progress.status === 'done' && (
          <Button icon={<ReloadOutlined />} onClick={handleStart}>
            Пересобрать
          </Button>
        )}
      </Space>

      {isRunning && (
        <div>
          <Text type="secondary">{statusLabels[progress.status]}</Text>
          {progress.status === 'llm_extracting' && (
            <Progress percent={percent} size="small" style={{ marginTop: 8 }} />
          )}
        </div>
      )}

      {progress.status === 'done' && (
        <Text type="success">{statusLabels.done}</Text>
      )}

      {progress.status === 'error' && (
        <Alert type="error" message={statusLabels.error} />
      )}
    </Space>
  );
}

// ── Main DocumentPage ──
export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<DbDocument | null>(null);
  const [pages, setPages] = useState<DbDocPage[]>([]);
  const [blocks, setBlocks] = useState<DbDocBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [docRes, pagesRes, blocksRes] = await Promise.all([
          supabase.from('documents').select('*').eq('id', id).single(),
          supabase.from('doc_pages').select('*').eq('doc_id', id).order('page_no'),
          supabase.from('doc_blocks').select('*').eq('doc_id', id),
        ]);

        if (docRes.error) throw new Error(docRes.error.message);
        if (pagesRes.error) throw new Error(pagesRes.error.message);
        if (blocksRes.error) throw new Error(blocksRes.error.message);

        setDocument(docRes.data as DbDocument);
        setPages((pagesRes.data as DbDocPage[]) ?? []);
        setBlocks((blocksRes.data as DbDocBlock[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки документа');
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [id]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <Alert
        type="error"
        message="Ошибка"
        description={error ?? 'Документ не найден'}
        showIcon
      />
    );
  }

  const tabItems = [
    {
      key: 'blocks',
      label: (
        <span>
          <FileTextOutlined /> Блоки
        </span>
      ),
      children: <BlockList pages={pages} blocks={blocks} />,
    },
    {
      key: 'materials',
      label: (
        <span>
          <ExperimentOutlined /> Материалы
        </span>
      ),
      children: <MaterialFactTable docId={document.id} />,
    },
    {
      key: 'bom',
      label: (
        <span>
          <UnorderedListOutlined /> Сводная ведомость
        </span>
      ),
      children: <BomView docId={document.id} />,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={3}>{document.filename}</Title>

      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
        <Descriptions.Item label="Файл">{document.filename}</Descriptions.Item>
        <Descriptions.Item label="Статус">
          <Tag color={STATUS_COLOR[document.status] ?? 'default'}>
            {STATUS_LABEL[document.status] ?? document.status}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Код документа">
          {document.doc_code ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Страниц">{document.page_count ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Блоков">{document.block_count ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Ошибок">
          {document.error_blocks_count > 0 ? (
            <Text type="danger">{document.error_blocks_count}</Text>
          ) : (
            0
          )}
        </Descriptions.Item>
      </Descriptions>

      {document.status === 'has_errors' && <ErrorBlocksAlert blocks={blocks} />}

      <Tabs items={tabItems} defaultActiveKey="blocks" />

      <ExtractionProgress docId={document.id} onComplete={() => window.location.reload()} />
    </Space>
  );
}
