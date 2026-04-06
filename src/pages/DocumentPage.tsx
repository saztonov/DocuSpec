import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography,
  Tabs,
  Tag,
  Space,
  Spin,
  Alert,
  Table,
  Button,
  App,
  Empty,
} from 'antd';
import {
  FileTextOutlined,
  ExperimentOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  WarningOutlined,
  SaveOutlined,
  CalculatorOutlined,
} from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import { useBom } from '../hooks/useBom.ts';
import { useExtraction } from '../hooks/useExtraction.ts';
import { useProducts } from '../hooks/useProducts.ts';
import { getAvailableModels } from '../lib/models.ts';
import BlockTableModal from '../components/BlockTableModal.tsx';
import BlockLink from '../components/BlockLink.tsx';
import AppHeader from '../components/layout/AppHeader.tsx';
import HamburgerMenu from '../components/layout/HamburgerMenu.tsx';
import MaterialsTable from '../components/MaterialsTable.tsx';
import EstimateLinesTable from '../components/EstimateLinesTable.tsx';
import ActionBar from '../components/ActionBar.tsx';
import { useEstimate } from '../hooks/useEstimate.ts';
import { useEstimatesList } from '../hooks/useEstimateData.ts';
import type { DbDocument, DbDocPage, DbDocBlock, DbMaterialFact, DbBomSummary, DbProductFact } from '../types/database.ts';

const { Text } = Typography;

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

// ── BlockList (for hamburger menu access) ──
function BlockList({ pages, blocks }: { pages: DbDocPage[]; blocks: DbDocBlock[] }) {
  const [selectedBlock, setSelectedBlock] = useState<DbDocBlock | null>(null);
  const pageMap = new Map(pages.map((p) => [p.id, p]));

  const dataSource = blocks.map((b) => {
    const page = pageMap.get(b.page_id);
    return {
      key: b.id,
      block_uid: b.block_uid,
      block_type: b.block_type,
      page_no: page?.page_no ?? '-',
      has_table: b.has_table,
      has_error: b.has_error,
      section_title: b.section_title,
      content_preview: b.content.slice(0, 120) + (b.content.length > 120 ? '...' : ''),
    };
  });

  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  const columns = [
    { title: '№', key: 'rowNum', width: 50, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: 'Стр.', dataIndex: 'page_no', key: 'page_no', width: 60 },
    { title: 'Блок', dataIndex: 'block_uid', key: 'block_uid', width: 180, render: (uid: string) => <Text code>{uid}</Text> },
    { title: 'Тип', dataIndex: 'block_type', key: 'block_type', width: 80, render: (type: string) => <Tag color={type === 'TEXT' ? 'blue' : 'purple'}>{type}</Tag> },
    { title: 'Таблица', dataIndex: 'has_table', key: 'has_table', width: 80, render: (v: boolean) => (v ? <Tag color="cyan">Да</Tag> : '-') },
    { title: 'Ошибка', dataIndex: 'has_error', key: 'has_error', width: 80, render: (v: boolean) => (v ? <Tag color="red">Да</Tag> : '-') },
    { title: 'Раздел', dataIndex: 'section_title', key: 'section_title', width: 200, ellipsis: true },
    { title: 'Содержимое', dataIndex: 'content_preview', key: 'content_preview', ellipsis: true },
  ];

  return (
    <>
      <Table
        dataSource={dataSource}
        columns={columns}
        size="small"
        pagination={{ defaultPageSize: 20 }}
        scroll={{ x: 900 }}
        onRow={(record) => ({
          onClick: record.has_table ? () => setSelectedBlock(blockMap.get(record.key as string) ?? null) : undefined,
          style: record.has_table ? { cursor: 'pointer' } : undefined,
        })}
      />
      {selectedBlock && <BlockTableModal block={selectedBlock} onClose={() => setSelectedBlock(null)} />}
    </>
  );
}

// ── ProductsTab (for hamburger menu access) ──
const PRODUCT_KIND_LABEL: Record<string, string> = { product: 'Изделие', equipment: 'Оборудование', assembly: 'Сборка' };
const PRODUCT_KIND_COLOR: Record<string, string> = { product: 'blue', equipment: 'volcano', assembly: 'purple' };

function ProductsTab({ docId }: { docId: string }) {
  const { products, loading } = useProducts(docId);
  const [filterMark, setFilterMark] = useState<string | null>(null);
  const [showReviewOnly, setShowReviewOnly] = useState(false);

  if (loading) return <Spin />;
  if (products.length === 0) return <Empty description="Изделия не обнаружены." />;

  const reviewCount = (products as DbProductFact[]).filter(p => p.needs_review).length;

  const prodColumns = [
    {
      title: 'Марка', dataIndex: 'assembly_mark', key: 'assembly_mark', width: 120,
      render: (v: string, record: DbProductFact) => (
        <Space size={4}>
          {record.needs_review && <WarningOutlined style={{ color: '#faad14' }} title="Требует проверки" />}
          <Text style={{ cursor: 'pointer', color: filterMark === v ? '#1677ff' : undefined }} onClick={() => setFilterMark((prev) => prev === v ? null : v)} title="Фильтр по марке">{v}</Text>
        </Space>
      ),
    },
    { title: 'Наименование', dataIndex: 'assembly_name', key: 'assembly_name', ellipsis: true, render: (v: string | null) => v ?? '—' },
    { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 80, render: (v: number | null) => v ?? '—' },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 55, render: (v: string | null) => v ?? '—' },
    { title: 'Тип', dataIndex: 'kind', key: 'kind', width: 100, render: (v: string) => <Tag color={PRODUCT_KIND_COLOR[v] ?? 'default'}>{PRODUCT_KIND_LABEL[v] ?? v}</Tag> },
    { title: 'Доп. пар.', dataIndex: 'extra_params', key: 'extra_params', width: 110, render: (v: string | null) => v ?? '—' },
    { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string | null) => v ?? '—' },
    { title: 'Блок', dataIndex: 'block_id', key: 'block_id', width: 130, render: (v: string | null) => v ? <BlockLink blockId={v} /> : '—' },
  ];

  let filtered = filterMark ? (products as DbProductFact[]).filter(p => p.assembly_mark === filterMark) : products as DbProductFact[];
  if (showReviewOnly) filtered = filtered.filter(p => p.needs_review);

  return (
    <div>
      <Space style={{ marginBottom: 8 }} wrap>
        {filterMark && (
          <>
            <Text type="secondary">Фильтр: </Text>
            <Tag closable onClose={() => setFilterMark(null)} color="blue">{filterMark}</Tag>
          </>
        )}
        {reviewCount > 0 && (
          <Button size="small" type={showReviewOnly ? 'primary' : 'default'} danger={showReviewOnly} icon={<WarningOutlined />} onClick={() => setShowReviewOnly(!showReviewOnly)}>
            Требуют проверки ({reviewCount})
          </Button>
        )}
      </Space>
      <Table dataSource={filtered.map(p => ({ ...p, key: p.id }))} columns={prodColumns} size="small" pagination={false} scroll={{ x: 1000 }} />
    </div>
  );
}

// ── BomView (for hamburger menu access) ──
function BomView({ docId, filename, modelUsed, projectId, sectionId }: { docId: string; filename: string; modelUsed?: string; projectId?: string | null; sectionId?: string | null }) {
  const { bomLines, loading, error } = useBom(docId);
  const [expandedFacts, setExpandedFacts] = useState<Map<string, DbMaterialFact[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const { message: msg } = App.useApp();
  const navigate = useNavigate();

  async function loadFactsForKey(canonicalKey: string) {
    if (expandedFacts.has(canonicalKey)) return;
    const { data } = await supabase.from('material_facts').select('*').eq('doc_id', docId).eq('canonical_key', canonicalKey).order('created_at');
    setExpandedFacts(prev => new Map(prev).set(canonicalKey, (data as DbMaterialFact[]) ?? []));
  }

  function exportCsv() {
    const header = ['Канон. ключ', 'Наименование', 'Ед.', 'Итого кол-во', 'Кол-во источников'];
    const rows = bomLines.map(b => [b.canonical_key, b.canonical_name, b.unit ?? '', b.total_qty?.toString() ?? '', b.fact_count.toString()]);
    const csv = [header, ...rows].map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const bom = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(bom);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bom_${docId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveStatement() {
    setSaving(true);
    try {
      const baseName = filename.replace(/\.md$/i, '');
      const { data: existing } = await supabase.from('statements').select('name').like('name', `${baseName}%`);
      let name = baseName;
      if (existing && existing.length > 0) {
        const existingNames = new Set(existing.map((s: { name: string }) => s.name));
        if (existingNames.has(baseName)) {
          let counter = 2;
          while (existingNames.has(`${baseName} (${counter})`)) counter++;
          name = `${baseName} (${counter})`;
        }
      }
      const { data: stmt, error: stmtErr } = await supabase.from('statements').insert({ doc_id: docId, name, model_used: modelUsed || null, item_count: bomLines.length, project_id: projectId ?? null, section_id: sectionId ?? null }).select('id').single();
      if (stmtErr || !stmt) throw new Error(stmtErr?.message ?? 'Ошибка создания ведомости');
      const items = bomLines.map((b: DbBomSummary) => ({ statement_id: stmt.id, canonical_key: b.canonical_key, canonical_name: b.canonical_name, unit: b.unit, total_qty: b.total_qty, fact_count: b.fact_count, source_block_ids: b.source_block_ids, user_verified: b.all_verified }));
      const { error: itemsErr } = await supabase.from('statement_items').insert(items);
      if (itemsErr) throw new Error(itemsErr.message);
      msg.success(`Ведомость "${name}" сохранена`);
      navigate(`/statements/${stmt.id}`);
    } catch (err) {
      msg.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <Alert type="error" message="Ошибка загрузки ведомости" description={error} />;

  const BLOCK_TYPE_COLOR: Record<string, string> = { 'Таблица': 'cyan', 'Текст': 'blue', 'Изображение': 'purple' };

  const columns = [
    { title: '№', key: 'rowNum', width: 50, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: 'Наименование', dataIndex: 'canonical_name', key: 'canonical_name', ellipsis: true },
    { title: 'Канон. ключ', dataIndex: 'canonical_key', key: 'canonical_key', width: 200, ellipsis: true },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 60 },
    { title: 'Итого кол-во', dataIndex: 'total_qty', key: 'total_qty', width: 120, render: (v: number | null) => v != null ? <Text strong>{v}</Text> : '-' },
    { title: 'Источников', dataIndex: 'fact_count', key: 'fact_count', width: 100 },
    {
      title: 'Тип блока', dataIndex: 'source_block_display_types', key: 'source_block_display_types', width: 160,
      render: (types: string[] | null) => {
        if (!types || types.length === 0) return '—';
        return <Space size={4} wrap>{types.filter(Boolean).map(t => <Tag key={t} color={BLOCK_TYPE_COLOR[t] ?? 'default'}>{t}</Tag>)}</Space>;
      },
    },
    { title: 'Проверены', dataIndex: 'all_verified', key: 'all_verified', width: 100, render: (v: boolean) => (v ? <Tag color="green">Все</Tag> : <Tag>Нет</Tag>) },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {bomLines.length > 0 && (
        <Space>
          <Button icon={<SaveOutlined />} type="primary" onClick={() => void saveStatement()} loading={saving}>Сохранить ведомость</Button>
          <Button onClick={exportCsv}>Экспорт CSV</Button>
        </Space>
      )}
      <Table
        dataSource={bomLines.map((b) => ({ ...b, key: b.canonical_key }))}
        columns={columns}
        size="small"
        loading={loading}
        pagination={{ defaultPageSize: 30 }}
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
                  { title: 'Блок', dataIndex: 'block_id', key: 'block_id', width: 130, render: (v: string) => <BlockLink blockId={v} /> },
                ]}
                size="small"
                pagination={false}
              />
            );
          },
          onExpand: (expanded, record) => { if (expanded) void loadFactsForKey(record.canonical_key); },
        }}
      />
    </Space>
  );
}

// ── Main DocumentPage ──
export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [document, setDocument] = useState<DbDocument | null>(null);
  const [pages, setPages] = useState<DbDocPage[]>([]);
  const [blocks, setBlocks] = useState<DbDocBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const models = getAvailableModels();
  const [selectedModel, setSelectedModel] = useState(models[0]?.value ?? '');
  const { message } = App.useApp();

  // Extraction & Estimate hooks
  const { progress: extractionProgress, runExtraction, stopExtraction, lastLogger } = useExtraction(id ?? '');
  const { progress: estimateProgress, estimateId, runEstimate, stopEstimate } = useEstimate(id ?? '');
  const { estimates } = useEstimatesList(id ?? '');

  const activeTab = searchParams.get('tab') || 'materials';

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

  async function handleRunExtraction() {
    try {
      await runExtraction(selectedModel || undefined);
      message.success(`Извлечение завершено: ${extractionProgress.extractedFacts} материалов`);
      window.location.reload();
    } catch (err) {
      console.error('[DocuSpec] handleRunExtraction error:', err);
      message.error(err instanceof Error ? err.message : 'Ошибка извлечения');
    }
  }

  async function handleRunEstimate() {
    try {
      await runEstimate(selectedModel);
      message.success('Смета сформирована');
    } catch (err) {
      console.error('[DocuSpec] handleRunEstimate error:', err);
      message.error(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !document) {
    return <Alert type="error" message="Ошибка" description={error ?? 'Документ не найден'} showIcon />;
  }

  const latestEstimateId = estimates.length > 0 ? estimates[0].id : estimateId ?? undefined;

  // Main tabs: Материалы + Смета
  const mainTabs = [
    {
      key: 'materials',
      label: <span><ExperimentOutlined /> Материалы</span>,
      children: <MaterialsTable docId={document.id} />,
    },
    {
      key: 'estimate',
      label: <span><CalculatorOutlined /> Смета</span>,
      children: <EstimateLinesTable docId={document.id} />,
    },
  ];

  // Service tabs (via hamburger menu ?tab=xxx)
  const serviceTabs = [
    {
      key: 'blocks',
      label: <span><FileTextOutlined /> Блоки</span>,
      children: <BlockList pages={pages} blocks={blocks} />,
    },
    {
      key: 'products',
      label: <span><AppstoreOutlined /> Изделия</span>,
      children: <ProductsTab docId={document.id} />,
    },
    {
      key: 'bom',
      label: <span><UnorderedListOutlined /> Сводная ведомость</span>,
      children: <BomView docId={document.id} filename={document.filename} modelUsed={selectedModel} projectId={document.project_id} sectionId={document.section_id} />,
    },
  ];

  const isServiceTab = ['blocks', 'products', 'bom'].includes(activeTab);
  const allTabs = isServiceTab ? [...mainTabs, ...serviceTabs] : mainTabs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppHeader onMenuClick={() => setMenuOpen(true)} docName={document.filename} />
      <HamburgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        docId={document.id}
        latestEstimateId={latestEstimateId}
      />

      <div style={{ flex: 1, padding: '16px 24px' }}>
        {/* Compact doc info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <Tag color={STATUS_COLOR[document.status] ?? 'default'}>
            {STATUS_LABEL[document.status] ?? document.status}
          </Tag>
          {document.doc_code && <Text type="secondary">Код: {document.doc_code}</Text>}
          <Text type="secondary">{document.page_count ?? 0} стр.</Text>
          <Text type="secondary">{document.block_count ?? 0} блоков</Text>
          {document.error_blocks_count > 0 && <Text type="danger">{document.error_blocks_count} ошибок</Text>}
        </div>

        {document.status === 'has_errors' && <ErrorBlocksAlert blocks={blocks} />}

        <Tabs
          items={allTabs}
          activeKey={activeTab}
          onChange={(key) => setSearchParams({ tab: key })}
        />
      </div>

      <ActionBar
        docStatus={document.status}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        extractionProgress={extractionProgress}
        onRunExtraction={() => void handleRunExtraction()}
        onStopExtraction={stopExtraction}
        onReExtract={() => void handleRunExtraction()}
        onDownloadLog={lastLogger ? () => lastLogger.downloadLog() : undefined}
        estimateProgress={estimateProgress}
        onRunEstimate={() => void handleRunEstimate()}
        onStopEstimate={stopEstimate}
      />
    </div>
  );
}
