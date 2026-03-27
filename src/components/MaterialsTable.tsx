import { useState, useEffect } from 'react';
import { Typography, Tag, Space, Spin, Table, Button, Select, Divider, Empty, App } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import { generateCanonicalKey } from '../lib/canonical.ts';
import BlockLink from './BlockLink.tsx';
import type { DbMaterialFact } from '../types/database.ts';

const { Title, Text } = Typography;

const KIND_LABEL: Record<string, string> = { material: 'Материал', equipment: 'Оборудование' };
const KIND_COLOR: Record<string, string> = { material: 'blue', equipment: 'volcano' };
const SCOPE_LABEL: Record<string, string> = { per_unit: 'На 1 изд.', total: 'Итого', unknown: '?' };
const SCOPE_COLOR: Record<string, string> = { per_unit: 'orange', total: 'green', unknown: 'default' };

export default function MaterialsTable({ docId }: { docId: string }) {
  const [facts, setFacts] = useState<DbMaterialFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [showReviewOnly, setShowReviewOnly] = useState(false);
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

  async function saveEdit(id: string) {
    const newKey = generateCanonicalKey(editValue);
    const { error } = await supabase
      .from('material_facts')
      .update({ canonical_name: editValue, canonical_key: newKey, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { msg.error('Ошибка сохранения'); }
    else {
      msg.success('Сохранено');
      setFacts(prev => prev.map(f => f.id === id ? { ...f, canonical_name: editValue, canonical_key: newKey } : f));
    }
    setEditingKey(null);
  }

  const columns = [
    { title: 'Конструкция', dataIndex: 'construction', key: 'construction', width: 150, render: (v: string | null) => v ?? '—' },
    {
      title: 'Материал',
      dataIndex: 'canonical_name',
      key: 'canonical_name',
      width: 285,
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
              <Button size="small" onClick={() => setEditingKey(null)}>&#x2715;</Button>
            </Space.Compact>
          );
        }
        return (
          <Space size={4}>
            {record.needs_review && <WarningOutlined style={{ color: '#faad14' }} title="Требует проверки" />}
            <Text style={{ cursor: 'pointer' }} onClick={() => { setEditingKey(record.id); setEditValue(val || record.raw_name); }} title="Нажмите для редактирования">
              {val || <Text type="secondary" italic>—</Text>}
            </Text>
          </Space>
        );
      },
    },
    { title: 'Доп. пар.', dataIndex: 'extra_params', key: 'extra_params', width: 110, render: (v: string | null) => v ?? '—' },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 55 },
    {
      title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 90,
      render: (v: number | null, r: DbMaterialFact) => {
        if (v == null) return '—';
        const scopeTag = r.qty_scope ? <Tag color={SCOPE_COLOR[r.qty_scope]} style={{ fontSize: 10, marginLeft: 2 }}>{SCOPE_LABEL[r.qty_scope]}</Tag> : null;
        return <span>{v}{scopeTag}</span>;
      },
    },
    { title: 'Марка / ГОСТ', key: 'mark_gost', width: 130, render: (_: unknown, r: DbMaterialFact) => [r.mark, r.gost].filter(Boolean).join(' / ') || '—' },
    {
      title: 'Тип', dataIndex: 'kind', key: 'kind', width: 90,
      render: (v: string) => <Tag color={KIND_COLOR[v] ?? 'default'}>{KIND_LABEL[v] ?? v}</Tag>,
    },
    { title: 'Блок', dataIndex: 'block_id', key: 'block_id', width: 85, render: (v: string) => v ? <BlockLink blockId={v} /> : '—' },
    { title: 'Примечание', dataIndex: 'note', key: 'note', width: 140, render: (v: string | null) => v ?? '—' },
    {
      title: 'Увер.', dataIndex: 'confidence', key: 'confidence', width: 70,
      render: (v: number) => { const pct = Math.round(v * 100); return <Tag color={pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red'}>{pct}%</Tag>; },
    },
  ];

  if (loading) return <Spin />;
  if (facts.length === 0) return <Empty description="Материалы ещё не извлечены. Нажмите «Собрать материалы»." />;

  const reviewCount = facts.filter(f => f.needs_review).length;
  const equipmentCount = facts.filter(f => f.kind === 'equipment').length;
  const derivedCount = facts.filter(f => f.source_section === 'assembly_total').length;

  let filteredFacts = facts;
  if (filterKind) filteredFacts = filteredFacts.filter(f => f.kind === filterKind);
  if (showReviewOnly) filteredFacts = filteredFacts.filter(f => f.needs_review);

  const vedomostFacts = filteredFacts.filter(f => f.source_section === 'vedomost_materialov');
  const specFacts = filteredFacts.filter(f => f.source_section === 'spetsifikatsiya' || f.source_section === 'assembly_spec');
  const derivedFacts = filteredFacts.filter(f => f.source_section === 'assembly_total');
  const pirogFacts = filteredFacts.filter(f => f.source_section === 'pirog');
  const otherFacts = filteredFacts.filter(f => !f.source_section || !['vedomost_materialov', 'spetsifikatsiya', 'assembly_spec', 'assembly_total', 'pirog'].includes(f.source_section));

  function renderSection(title: string, sectionFacts: DbMaterialFact[]) {
    if (sectionFacts.length === 0) return null;
    const groups = new Map<string, DbMaterialFact[]>();
    for (const f of sectionFacts) {
      const key = f.block_id ?? 'derived';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    return (
      <div style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 4 }}>{title} <Tag>{sectionFacts.length} поз.</Tag></Title>
        {[...groups.entries()].map(([blockId, groupFacts]) => {
          const firstFact = groupFacts[0];
          const headerLabel = firstFact?.calc_note
            ? <Text type="secondary" style={{ fontSize: 11 }}>Расчёт</Text>
            : firstFact?.construction
              ? firstFact.construction
              : <Text type="secondary" code style={{ fontSize: 11 }}>{blockId.slice(0, 12)}...</Text>;
          return (
            <div key={blockId}>
              <Divider style={{ margin: '6px 0 4px', fontSize: 12, color: '#8c8c8c' }}>
                <Space size={4}>
                  {headerLabel}
                  <Tag color="default" style={{ fontSize: 11 }}>{groupFacts.length} поз.</Tag>
                  {blockId !== 'derived' && <BlockLink blockId={blockId} />}
                </Space>
              </Divider>
              <Table dataSource={groupFacts.map(f => ({ ...f, key: f.id }))} columns={columns} size="small" pagination={false} scroll={{ x: 1200 }} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          value={filterKind}
          onChange={setFilterKind}
          allowClear
          placeholder="Все типы"
          style={{ width: 160 }}
          options={[
            { value: 'material', label: `Материалы (${facts.filter(f => f.kind === 'material').length})` },
            { value: 'equipment', label: `Оборудование (${equipmentCount})` },
          ]}
        />
        <Button
          type={showReviewOnly ? 'primary' : 'default'}
          danger={showReviewOnly}
          icon={<WarningOutlined />}
          onClick={() => setShowReviewOnly(!showReviewOnly)}
        >
          Требуют проверки ({reviewCount})
        </Button>
        {derivedCount > 0 && (
          <Tag color="purple">Расчётных: {derivedCount}</Tag>
        )}
      </Space>

      {renderSection('Ведомости материалов', vedomostFacts)}
      {renderSection('Спецификации', specFacts)}
      {renderSection('Расчёт (assembly x ведомость)', derivedFacts)}
      {renderSection('Пироги конструкций', pirogFacts)}
      {renderSection('Прочее', otherFacts)}
    </div>
  );
}
