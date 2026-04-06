import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Input,
  Radio,
  Switch,
  Space,
  Typography,
  List,
  Tag,
  Card,
  Empty,
  Spin,
  Button,
  Progress,
} from 'antd';
import { SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { searchNorms, searchResources } from '../../lib/ragSearch';
import { supabase } from '../../lib/supabase';
import FsnbCollectionsFilter from './FsnbCollectionsFilter';
import type { FsnbCollectionInfo } from '../../lib/fsnbExplorer';
import type { ScopeSelection } from './FsnbTreePanel';
import type {
  FsnbNormSearchResult,
  FsnbSearchResult,
} from '../../types/fsnb';

const LS_COLLECTIONS = 'fsnb.enabledCollections';
const LS_SHOW_RELATIONS = 'fsnb.showRelations';

interface Props {
  collections: FsnbCollectionInfo[];
  scope: ScopeSelection;
  onClearScope: () => void;
  onSelectNorm: (id: string) => void;
  onSelectResource: (id: string) => void;
}

type SearchMode = 'norms' | 'resources';

interface EnrichedNorm extends FsnbNormSearchResult {
  collection_code: string | null;
  collection_name: string | null;
  division_code: string | null;
  division_name: string | null;
  table_code: string | null;
}

interface EnrichedResource extends FsnbSearchResult {
  book_name: string | null;
  part_name: string | null;
  section_name: string | null;
  group_name: string | null;
  collection_code: string | null;
}

function loadEnabled(allCodes: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(LS_COLLECTIONS);
    if (!raw) return new Set(allCodes);
    const arr = JSON.parse(raw) as string[];
    const set = new Set(arr);
    // если в localStorage пусто — считаем «все»
    return set.size === 0 ? new Set(allCodes) : set;
  } catch {
    return new Set(allCodes);
  }
}

function saveEnabled(set: Set<string>) {
  try {
    localStorage.setItem(LS_COLLECTIONS, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function loadShowRelations(): boolean {
  try {
    const raw = localStorage.getItem(LS_SHOW_RELATIONS);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export default function FsnbSearchPanel({
  collections,
  scope,
  onClearScope,
  onSelectNorm,
  onSelectResource,
}: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('norms');
  const [enabledCodes, setEnabledCodes] = useState<Set<string>>(new Set());
  const [showRelations, setShowRelations] = useState<boolean>(loadShowRelations());

  const [normResults, setNormResults] = useState<EnrichedNorm[]>([]);
  const [resourceResults, setResourceResults] = useState<EnrichedResource[]>([]);
  const [loading, setLoading] = useState(false);

  // Инициализация набора сборников при загрузке списка
  useEffect(() => {
    if (collections.length === 0) return;
    setEnabledCodes(loadEnabled(collections.map(c => c.code)));
  }, [collections]);

  const handleCollectionsChange = (codes: Set<string>) => {
    setEnabledCodes(codes);
    saveEnabled(codes);
  };

  const handleShowRelationsChange = (v: boolean) => {
    setShowRelations(v);
    try {
      localStorage.setItem(LS_SHOW_RELATIONS, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // ── Поиск ──
  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(
    async (q: string, m: SearchMode) => {
      if (!q.trim() && scope.kind === null) {
        setNormResults([]);
        setResourceResults([]);
        return;
      }
      setLoading(true);
      try {
        if (m === 'norms') {
          // Если есть scope-фильтр по таблице/разделу — берём напрямую из БД
          if (scope.kind === 'table' || scope.kind === 'division' || scope.kind === 'collection') {
            const enriched = await fetchNormsByScope(scope, q);
            setNormResults(filterByCollection(enriched, enabledCodes));
          } else {
            const raw = await searchNorms(q, { limit: 30 });
            const enriched = await enrichNorms(raw);
            setNormResults(filterByCollection(enriched, enabledCodes));
          }
        } else {
          if (scope.kind === 'tg') {
            const enriched = await fetchResourcesByTg(scope.tg_id ?? '', q);
            setResourceResults(enriched);
          } else {
            const raw = await searchResources(q, { limit: 30 });
            const enriched = await enrichResources(raw);
            setResourceResults(enriched);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [enabledCodes, scope],
  );

  // Дебаунс при наборе текста
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query, mode);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, scope]);

  const allCollectionsSelected =
    collections.length > 0 && enabledCodes.size === collections.length;

  const scopeBadge = useMemo(() => {
    if (scope.kind === null) return null;
    return (
      <Tag
        color="geekblue"
        closable
        closeIcon={<CloseOutlined />}
        onClose={e => {
          e.preventDefault();
          onClearScope();
        }}
      >
        Скоуп: {scope.label ?? scope.kind}
      </Tag>
    );
  }, [scope, onClearScope]);

  return (
    <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space style={{ width: '100%' }} wrap>
          <Input
            placeholder={
              mode === 'norms'
                ? 'Поиск норм/расценок (название или код)…'
                : 'Поиск ресурсов (материалы, машины, труд)…'
            }
            prefix={<SearchOutlined />}
            value={query}
            onChange={e => setQuery(e.target.value)}
            allowClear
            style={{ minWidth: 320, flex: 1 }}
          />
          <FsnbCollectionsFilter
            collections={collections}
            enabledCodes={enabledCodes}
            onChange={handleCollectionsChange}
          />
        </Space>
        <Space wrap>
          <Radio.Group value={mode} onChange={e => setMode(e.target.value)} size="small">
            <Radio.Button value="norms">Нормы / расценки</Radio.Button>
            <Radio.Button value="resources">Ресурсы</Radio.Button>
          </Radio.Group>
          <Space>
            <Typography.Text type="secondary">Показывать связи</Typography.Text>
            <Switch checked={showRelations} onChange={handleShowRelationsChange} size="small" />
          </Space>
          {!allCollectionsSelected && collections.length > 0 && (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              Фильтр по сборникам активен ({enabledCodes.size}/{collections.length})
            </Typography.Text>
          )}
          {scopeBadge}
        </Space>
      </Space>

      <div style={{ marginTop: 12, flex: 1, overflow: 'auto' }}>
        {loading && <Spin />}
        {!loading && mode === 'norms' && (
          <NormsList
            items={normResults}
            showRelations={showRelations}
            onSelect={onSelectNorm}
          />
        )}
        {!loading && mode === 'resources' && (
          <ResourcesList
            items={resourceResults}
            showRelations={showRelations}
            onSelect={onSelectResource}
          />
        )}
      </div>
    </div>
  );
}

// ── Списки результатов ─────────────────────────────────────────

function NormsList({
  items,
  showRelations,
  onSelect,
}: {
  items: EnrichedNorm[];
  showRelations: boolean;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <Empty description="Введите запрос или выберите ветку дерева" />;
  }
  return (
    <List
      dataSource={items}
      renderItem={item => (
        <List.Item
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{ cursor: 'pointer', padding: '8px 4px' }}
        >
          <Card size="small" hoverable style={{ width: '100%' }}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color="blue">{item.base_type}</Tag>
                <Typography.Text code>{item.norm_code}</Typography.Text>
                <Typography.Text type="secondary">{item.measure_unit}</Typography.Text>
                <ScoreBar score={item.score} />
              </Space>
              <Typography.Text strong>{item.name}</Typography.Text>
              {showRelations && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {[item.collection_code, item.division_code, item.table_code]
                    .filter(Boolean)
                    .join(' › ')}
                  {item.collection_name ? ` — ${item.collection_name}` : ''}
                </Typography.Text>
              )}
            </Space>
          </Card>
        </List.Item>
      )}
    />
  );
}

function ResourcesList({
  items,
  showRelations,
  onSelect,
}: {
  items: EnrichedResource[];
  showRelations: boolean;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <Empty description="Введите запрос или выберите ветку дерева" />;
  }
  return (
    <List
      dataSource={items}
      renderItem={item => (
        <List.Item
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{ cursor: 'pointer', padding: '8px 4px' }}
        >
          <Card size="small" hoverable style={{ width: '100%' }}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color="green">{item.resource_type}</Tag>
                <Typography.Text code>{item.code}</Typography.Text>
                <Typography.Text type="secondary">{item.measure_unit ?? '—'}</Typography.Text>
                <ScoreBar score={item.score} />
              </Space>
              <Typography.Text strong>{item.name}</Typography.Text>
              {showRelations && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {[item.book_name, item.part_name, item.section_name, item.group_name]
                    .filter(Boolean)
                    .join(' › ') || '—'}
                </Typography.Text>
              )}
            </Space>
          </Card>
        </List.Item>
      )}
    />
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  return (
    <Progress
      percent={pct}
      showInfo={false}
      size="small"
      style={{ width: 60 }}
      strokeColor={pct > 60 ? '#52c41a' : pct > 30 ? '#1677ff' : '#bfbfbf'}
    />
  );
}

// ── Обогащение результатов метаданными ────────────────────────

async function enrichNorms(items: FsnbNormSearchResult[]): Promise<EnrichedNorm[]> {
  if (items.length === 0) return [];
  const ids = items.map(i => i.id);
  const { data } = await supabase
    .from('fsnb_norms')
    .select('id, collection_code, collection_name, division_code, division_name, table_code')
    .in('id', ids);
  const meta = new Map<string, Partial<EnrichedNorm>>();
  for (const row of data ?? []) {
    meta.set(row.id as string, {
      collection_code: row.collection_code as string | null,
      collection_name: row.collection_name as string | null,
      division_code: row.division_code as string | null,
      division_name: row.division_name as string | null,
      table_code: row.table_code as string | null,
    });
  }
  return items.map(i => ({
    ...i,
    collection_code: null,
    collection_name: null,
    division_code: null,
    division_name: null,
    table_code: null,
    ...(meta.get(i.id) ?? {}),
  }));
}

async function enrichResources(
  items: FsnbSearchResult[],
): Promise<EnrichedResource[]> {
  if (items.length === 0) return [];
  const ids = items.map(i => i.id);
  const { data } = await supabase
    .from('fsnb_resources')
    .select('id, book_name, part_name, section_name, group_name, collection_id')
    .in('id', ids);
  const meta = new Map<string, Partial<EnrichedResource>>();
  for (const row of data ?? []) {
    meta.set(row.id as string, {
      book_name: row.book_name as string | null,
      part_name: row.part_name as string | null,
      section_name: row.section_name as string | null,
      group_name: row.group_name as string | null,
      collection_code: null,
    });
  }
  return items.map(i => ({
    ...i,
    book_name: null,
    part_name: null,
    section_name: null,
    group_name: null,
    collection_code: null,
    ...(meta.get(i.id) ?? {}),
  }));
}

function filterByCollection(items: EnrichedNorm[], enabled: Set<string>): EnrichedNorm[] {
  if (enabled.size === 0) return items;
  return items.filter(
    i => i.collection_code === null || enabled.has(i.collection_code),
  );
}

// ── Запросы по скоупу из дерева ───────────────────────────────

async function fetchNormsByScope(
  scope: ScopeSelection,
  q: string,
): Promise<EnrichedNorm[]> {
  let query = supabase
    .from('fsnb_norms')
    .select(
      'id, norm_code, name, measure_unit, base_type, work_category, collection_code, collection_name, division_code, division_name, table_code',
    )
    .limit(100);

  if (scope.collection_code) query = query.eq('collection_code', scope.collection_code);
  if (scope.division_code) query = query.eq('division_code', scope.division_code);
  if (scope.table_code) query = query.eq('table_code', scope.table_code);
  if (q.trim()) {
    query = query.or(`name.ilike.%${q}%,norm_code.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[FsnbSearchPanel] fetchNormsByScope:', error.message);
    return [];
  }
  return (data ?? []).map((r, i) => ({
    id: r.id as string,
    norm_code: r.norm_code as string,
    name: r.name as string,
    measure_unit: r.measure_unit as string,
    base_type: r.base_type as EnrichedNorm['base_type'],
    work_category: r.work_category as string | null,
    score: 1 / (1 + i),
    collection_code: r.collection_code as string | null,
    collection_name: r.collection_name as string | null,
    division_code: r.division_code as string | null,
    division_name: r.division_name as string | null,
    table_code: r.table_code as string | null,
  }));
}

async function fetchResourcesByTg(
  tgId: string,
  q: string,
): Promise<EnrichedResource[]> {
  if (!tgId) return [];
  const { data: tgr } = await supabase
    .from('fsnb_tg_resources')
    .select('resource_id')
    .eq('tg_id', tgId);
  const ids = (tgr ?? [])
    .map(r => r.resource_id as string | null)
    .filter((id): id is string => !!id);
  if (ids.length === 0) return [];

  let query = supabase
    .from('fsnb_resources')
    .select(
      'id, code, name, measure_unit, resource_type, book_name, part_name, section_name, group_name',
    )
    .in('id', ids)
    .limit(200);
  if (q.trim()) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);

  const { data } = await query;
  return (data ?? []).map((r, i) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    measure_unit: r.measure_unit as string | null,
    resource_type: r.resource_type as EnrichedResource['resource_type'],
    score: 1 / (1 + i),
    book_name: r.book_name as string | null,
    part_name: r.part_name as string | null,
    section_name: r.section_name as string | null,
    group_name: r.group_name as string | null,
    collection_code: null,
  }));
}
