import { useState, useCallback, useRef } from 'react';
import {
  Typography, Button, Space, Upload, Progress, Table, Input, Card,
  Statistic, Row, Col, Alert, Tag, App, Descriptions, Divider,
} from 'antd';
import {
  UploadOutlined, SearchOutlined, DatabaseOutlined,
  CloudUploadOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { supabase } from '../../lib/supabase.ts';
import type { ImportProgress } from '../../lib/fsnbImporter.ts';

const { Text, Title } = Typography;
const { Search } = Input;

interface CollectionStat {
  code: string;
  name: string;
  base_type: string;
  record_count: number;
  imported_at: string | null;
}

interface SearchResult {
  id: string;
  code: string;
  name: string;
  measure_unit: string | null;
  score?: number;
}

export default function FsnbTab() {
  const { message } = App.useApp();
  const [collections, setCollections] = useState<CollectionStat[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [jsonFiles, setJsonFiles] = useState<Record<string, unknown>>({});

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchType, setSearchType] = useState<'resources' | 'norms'>('resources');

  // Stats
  const [stats, setStats] = useState<{
    resources: number;
    norms: number;
    techGroups: number;
  } | null>(null);

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('fsnb_collections')
        .select('code, name, base_type, record_count, imported_at')
        .order('code');
      if (error) throw error;
      setCollections(data || []);

      // Load counts
      const [resCount, normCount, tgCount] = await Promise.all([
        supabase.from('fsnb_resources').select('id', { count: 'exact', head: true }),
        supabase.from('fsnb_norms').select('id', { count: 'exact', head: true }),
        supabase.from('fsnb_tech_groups').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        resources: resCount.count || 0,
        norms: normCount.count || 0,
        techGroups: tgCount.count || 0,
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setCollectionsLoading(false);
    }
  }, [message]);

  // Load on first render
  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    loadCollections();
  }

  // Handle JSON file selection — beforeUpload receives RcFile (which is a File)
  const handleFileLoad = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setJsonFiles(prev => ({ ...prev, [file.name]: data }));
      message.success(`${file.name}: ${Array.isArray(data) ? data.length + ' записей' : 'загружен'}`);
    } catch {
      message.error(`Ошибка парсинга ${file.name}`);
    }
    return false;
  }, [message]);

  // Run import
  const runImport = useCallback(async () => {
    const resources = jsonFiles['resources.json'] as unknown[];
    if (!resources || !Array.isArray(resources)) {
      message.error('Загрузите resources.json');
      return;
    }

    // Collect norm chunks
    const normChunks: unknown[][] = [];
    for (const [name, data] of Object.entries(jsonFiles)) {
      if (name.startsWith('norms-') && name.endsWith('.json') && Array.isArray(data)) {
        normChunks.push(data as unknown[]);
      }
    }

    const techGroups = (jsonFiles['tech-groups.json'] || []) as unknown[];
    const tgNormLinks = (jsonFiles['tg-norm-links.json'] || []) as unknown[];

    setImporting(true);
    try {
      // Dynamic import to avoid circular deps
      const { importFsnbData } = await import('../../lib/fsnbImporter.ts');
      await importFsnbData(
        {
          resources: resources as any[],
          normChunks: normChunks as any[][],
          techGroups: techGroups as any[],
          tgNormLinks: tgNormLinks as any[],
          version: 'ФСНБ-2022 доп. 17',
        },
        (progress) => setImportProgress(progress),
      );
      message.success('Импорт завершён');
      loadCollections();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  }, [jsonFiles, message, loadCollections]);

  // Search
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      // Simple text search (without embeddings — for quick testing)
      const table = searchType === 'resources' ? 'fsnb_resources' : 'fsnb_norms';
      const codeCol = searchType === 'resources' ? 'code' : 'norm_code';

      const { data, error } = await supabase
        .from(table)
        .select(`id, ${codeCol}, name, measure_unit`)
        .or(`name.ilike.%${query}%,${codeCol}.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;

      setSearchResults(
        (data || []).map((r: any) => ({
          id: r.id,
          code: r[codeCol] || r.code,
          name: r.name,
          measure_unit: r.measure_unit,
        })),
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Ошибка поиска');
    } finally {
      setSearchLoading(false);
    }
  }, [searchType, message]);

  const fileCount = Object.keys(jsonFiles).length;
  const totalRecords = Object.values(jsonFiles).reduce(
    (sum, data) => sum + (Array.isArray(data) ? data.length : 0),
    0,
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {/* Статистика */}
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Ресурсы КСР"
              value={stats?.resources || 0}
              prefix={<DatabaseOutlined />}
              loading={collectionsLoading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Нормы ГЭСН"
              value={stats?.norms || 0}
              prefix={<DatabaseOutlined />}
              loading={collectionsLoading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Технологические группы"
              value={stats?.techGroups || 0}
              prefix={<DatabaseOutlined />}
              loading={collectionsLoading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Сборники" value={collections.length} loading={collectionsLoading} />
          </Card>
        </Col>
      </Row>

      {/* Сборники */}
      {collections.length > 0 && (
        <Table
          size="small"
          dataSource={collections}
          rowKey="code"
          pagination={false}
          columns={[
            { title: 'Код', dataIndex: 'code', width: 120 },
            { title: 'Название', dataIndex: 'name' },
            { title: 'Тип', dataIndex: 'base_type', width: 100, render: (v: string) => <Tag>{v}</Tag> },
            { title: 'Записей', dataIndex: 'record_count', width: 100 },
            {
              title: 'Импортировано',
              dataIndex: 'imported_at',
              width: 180,
              render: (v: string | null) => v ? new Date(v).toLocaleString('ru') : '—',
            },
          ]}
        />
      )}

      <Divider />

      {/* Импорт */}
      <Title level={5}>Импорт справочников ФСНБ-2022</Title>
      <Alert
        type="info"
        showIcon
        message="Подготовка данных"
        description={
          <>
            Сначала выполните: <Text code>npx tsx scripts/fsnb-xml-to-json.ts</Text> — скрипт создаст JSON-файлы
            в <Text code>temp/fsnb-import/</Text>. Затем загрузите эти файлы ниже.
          </>
        }
      />

      <Space>
        <Upload
          multiple
          accept=".json"
          beforeUpload={(file) => {
            handleFileLoad(file);
            return false;
          }}
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />}>Загрузить JSON файлы</Button>
        </Upload>

        {fileCount > 0 && (
          <Text type="secondary">
            {fileCount} файлов, {totalRecords.toLocaleString('ru')} записей
          </Text>
        )}

        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          onClick={runImport}
          disabled={fileCount === 0 || importing}
          loading={importing}
        >
          Импортировать в Supabase
        </Button>
      </Space>

      {/* Загруженные файлы */}
      {fileCount > 0 && (
        <Descriptions size="small" bordered column={2}>
          {Object.entries(jsonFiles).map(([name, data]) => (
            <Descriptions.Item key={name} label={name}>
              {Array.isArray(data) ? `${data.length} записей` : 'объект'}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}

      {/* Прогресс импорта */}
      {importProgress && (
        <Card size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>{importProgress.message}</Text>
            <Progress
              percent={importProgress.total > 0
                ? Math.round((importProgress.current / importProgress.total) * 100)
                : 0}
              status={importProgress.phase === 'error' ? 'exception' : importProgress.phase === 'done' ? 'success' : 'active'}
            />
          </Space>
        </Card>
      )}

      <Divider />

      {/* Поиск по справочникам */}
      <Title level={5}>Поиск по справочникам</Title>
      <Space>
        <Button
          type={searchType === 'resources' ? 'primary' : 'default'}
          size="small"
          onClick={() => setSearchType('resources')}
        >
          Ресурсы КСР
        </Button>
        <Button
          type={searchType === 'norms' ? 'primary' : 'default'}
          size="small"
          onClick={() => setSearchType('norms')}
        >
          Нормы ГЭСН
        </Button>
      </Space>

      <Search
        placeholder={searchType === 'resources' ? 'Поиск ресурса (название или код)...' : 'Поиск нормы (название или код)...'}
        enterButton={<><SearchOutlined /> Найти</>}
        loading={searchLoading}
        onSearch={handleSearch}
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        allowClear
      />

      {searchResults.length > 0 && (
        <Table
          size="small"
          dataSource={searchResults}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Код', dataIndex: 'code', width: 160, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Наименование', dataIndex: 'name' },
            { title: 'Ед.изм.', dataIndex: 'measure_unit', width: 100 },
            {
              title: 'Score',
              dataIndex: 'score',
              width: 80,
              render: (v: number | undefined) => v !== undefined ? v.toFixed(3) : '—',
            },
          ]}
        />
      )}
    </Space>
  );
}
