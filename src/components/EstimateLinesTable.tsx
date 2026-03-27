import { useState, useEffect } from 'react';
import { Typography, Table, Tag, Space, Select, Empty, Spin, Button, Row, Col, Statistic, Card, Popconfirm, App } from 'antd';
import { CalculatorOutlined, ArrowRightOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useEstimatesList } from '../hooks/useEstimateData.ts';
import { supabase } from '../lib/supabase.ts';
import type { DbEstimateLine } from '../types/estimate.ts';

const { Text } = Typography;

export default function EstimateLinesTable({ docId }: { docId: string }) {
  const { estimates, loading: listLoading, refetch } = useEstimatesList(docId);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [lines, setLines] = useState<DbEstimateLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  // Auto-select latest estimate
  useEffect(() => {
    if (estimates.length > 0 && !selectedEstimateId) {
      const doneEstimates = estimates.filter(e => e.status === 'done');
      const pick = doneEstimates.length > 0 ? doneEstimates[0] : estimates[0];
      setSelectedEstimateId(pick.id);
    }
  }, [estimates, selectedEstimateId]);

  // Load lines for selected estimate
  useEffect(() => {
    if (!selectedEstimateId) return;
    async function load() {
      setLoadingLines(true);
      const { data } = await supabase
        .from('estimate_lines')
        .select('*')
        .eq('estimate_id', selectedEstimateId)
        .order('sort_order');
      setLines((data as DbEstimateLine[]) ?? []);
      setLoadingLines(false);
    }
    void load();
  }, [selectedEstimateId]);

  if (listLoading) return <Spin />;

  if (estimates.length === 0) {
    return (
      <Empty
        image={<CalculatorOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
        description="Смета ещё не сформирована"
      >
        <Text type="secondary">Нажмите «Составить смету» для формирования</Text>
      </Empty>
    );
  }

  async function handleDelete(estId: string) {
    const { error } = await supabase.from('estimates').delete().eq('id', estId);
    if (error) {
      message.error('Ошибка удаления сметы');
    } else {
      message.success('Смета удалена');
      if (selectedEstimateId === estId) {
        setSelectedEstimateId(null);
        setLines([]);
      }
      refetch();
    }
  }

  const selectedEstimate = estimates.find(e => e.id === selectedEstimateId);
  const totalCost = lines.reduce((sum, l) => sum + (l.total_cost ?? 0), 0);
  const materialCost = lines.reduce((sum, l) => sum + (l.material_cost ?? 0), 0);
  const laborCost = lines.reduce((sum, l) => sum + (l.labor_cost ?? 0), 0);

  const columns = [
    { title: '№', dataIndex: 'line_number', key: 'line_number', width: 60 },
    { title: 'Обоснование', dataIndex: 'justification', key: 'justification', width: 120, render: (v: string | null) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—' },
    { title: 'Наименование', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Ед. изм.', dataIndex: 'measure_unit', key: 'measure_unit', width: 70 },
    { title: 'Объём', dataIndex: 'volume', key: 'volume', width: 90, render: (v: number | null) => v?.toLocaleString('ru-RU') ?? '—' },
    { title: 'Цена за ед.', dataIndex: 'unit_cost', key: 'unit_cost', width: 110, render: (v: number | null) => v != null ? `${v.toLocaleString('ru-RU')} ₽` : '—' },
    { title: 'Всего', dataIndex: 'total_cost', key: 'total_cost', width: 120, render: (v: number | null) => v != null ? <Text strong>{v.toLocaleString('ru-RU')} ₽</Text> : '—' },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Итого" value={totalCost} precision={2} suffix="₽" valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Материалы" value={materialCost} precision={2} suffix="₽" valueStyle={{ fontSize: 16, color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Работа" value={laborCost} precision={2} suffix="₽" valueStyle={{ fontSize: 16, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Позиций" value={lines.length} valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          value={selectedEstimateId}
          onChange={setSelectedEstimateId}
          style={{ minWidth: 300 }}
          popupMatchSelectWidth={false}
          options={estimates.map(e => ({
            value: e.id,
            label: `${e.name ?? 'Смета'} — ${new Date(e.created_at).toLocaleString('ru-RU')}`,
          }))}
        />
        {selectedEstimate && (
          <Tag color={selectedEstimate.status === 'done' ? 'green' : selectedEstimate.status === 'error' ? 'red' : 'processing'}>
            {selectedEstimate.status}
          </Tag>
        )}
        {selectedEstimateId && (
          <Button
            type="link"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(`/doc/${docId}/estimate/${selectedEstimateId}`)}
          >
            Подробнее
          </Button>
        )}
        {selectedEstimateId && (
          <Popconfirm
            title="Удалить смету?"
            description="Будут удалены все данные этой сметы."
            onConfirm={() => void handleDelete(selectedEstimateId)}
            okText="Да"
            cancelText="Нет"
          >
            <Button danger size="small" icon={<DeleteOutlined />}>Удалить</Button>
          </Popconfirm>
        )}
      </Space>

      <Table
        dataSource={lines.map(l => ({ ...l, key: l.id }))}
        columns={columns}
        size="small"
        loading={loadingLines}
        pagination={{ defaultPageSize: 30 }}
        scroll={{ x: 800 }}
      />
    </div>
  );
}
