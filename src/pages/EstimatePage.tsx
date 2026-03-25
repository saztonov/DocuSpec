import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Tabs,
  Tag,
  Space,
  Spin,
  Alert,
  Card,
  Statistic,
  Row,
  Col,
  Table,
  Button,
  Progress,
  Badge,
  App,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  DashboardOutlined,
  ToolOutlined,
  LinkOutlined,
  DollarOutlined,
  FileTextOutlined,
  AuditOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useEstimateData } from '../hooks/useEstimateData.ts';
import { supabase } from '../lib/supabase.ts';
import EstimateProgress from '../components/estimate/EstimateProgress.tsx';
import ReviewQueue from '../components/estimate/ReviewQueue.tsx';
import type {
  DbEstimate,
  DbEstimateWorkItem,
  DbEstimateRateMatch,
  DbEstimateResourceMatch,
  DbEstimateLine,
  DbEstimateReviewItem,
  EstimateProgress as EstimateProgressType,
  EstimateStatus,
  RateMatchMethod,
  ResourceMatchMethod,
} from '../types/estimate.ts';
import type { DbDependencyFlag } from '../types/database.ts';

const { Title, Text } = Typography;

// ── Цвета и метки статусов ──

const STATUS_COLOR: Record<EstimateStatus, string> = {
  draft: 'default',
  preparing: 'processing',
  classifying: 'processing',
  pricing: 'processing',
  matching: 'processing',
  calculating: 'processing',
  validating: 'processing',
  done: 'success',
  error: 'error',
};

const STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: 'Черновик',
  preparing: 'Подготовка',
  classifying: 'Классификация',
  pricing: 'Подбор расценок',
  matching: 'Сопоставление ресурсов',
  calculating: 'Расчёт объёмов',
  validating: 'Валидация',
  done: 'Готово',
  error: 'Ошибка',
};

const METHOD_LABEL: Record<string, string> = {
  resource_index: 'Ресурсно-индексный',
  resource: 'Ресурсный',
  base_index: 'Базисно-индексный',
};

const MATCH_METHOD_COLOR: Record<RateMatchMethod | ResourceMatchMethod, string> = {
  semantic: 'blue',
  rule: 'green',
  llm: 'purple',
  manual: 'gold',
  gost: 'cyan',
  code: 'geekblue',
  tg_semantic: 'magenta',
};

const MATCH_METHOD_LABEL: Record<RateMatchMethod | ResourceMatchMethod, string> = {
  semantic: 'Семантика',
  rule: 'Правило',
  llm: 'LLM',
  manual: 'Ручной',
  gost: 'ГОСТ',
  code: 'Код',
  tg_semantic: 'ТГ-семантика',
};

const DEP_TYPE_LABEL: Record<string, string> = {
  material: 'Материал',
  geometry: 'Геометрия',
  volume: 'Объём',
  detail: 'Детализация',
  drawing: 'Чертёж',
};

// ── Вспомогательный: рендер уверенности ──

function ConfidenceTag({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red';
  return <Tag color={color}>{pct}%</Tag>;
}

// ── Вкладка: Обзор ──

function OverviewTab({
  estimate,
  workItems,
  rateMatches,
  lines,
  reviewQueue,
  dependencyFlags,
  depsLoading,
}: {
  estimate: DbEstimate;
  workItems: DbEstimateWorkItem[];
  rateMatches: DbEstimateRateMatch[];
  lines: DbEstimateLine[];
  reviewQueue: DbEstimateReviewItem[];
  dependencyFlags: DbDependencyFlag[];
  depsLoading: boolean;
}) {
  const unresolvedIssues = reviewQueue.filter((r) => !r.resolved);
  const errorCount = unresolvedIssues.filter((r) => r.severity === 'error').length;
  const warningCount = unresolvedIssues.filter((r) => r.severity === 'warning').length;

  const isActive =
    estimate.status !== 'draft' &&
    estimate.status !== 'done' &&
    estimate.status !== 'error';

  const progressData: EstimateProgressType = {
    status: estimate.status,
    phase: null,
    currentAgent: null,
    currentStep: 0,
    maxSteps: 6,
    agentThinking: null,
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {/* Прогресс пайплайна */}
      {isActive && <EstimateProgress progress={progressData} />}

      {/* Статус и метод */}
      <Card size="small">
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <Text type="secondary">Статус</Text>
            <div style={{ marginTop: 4 }}>
              <Tag color={STATUS_COLOR[estimate.status]}>
                {STATUS_LABEL[estimate.status] ?? estimate.status}
              </Tag>
            </div>
          </Col>
          <Col span={6}>
            <Text type="secondary">Метод</Text>
            <div style={{ marginTop: 4 }}>
              <Tag>{METHOD_LABEL[estimate.method] ?? estimate.method}</Tag>
            </div>
          </Col>
          {estimate.region_code && (
            <Col span={6}>
              <Text type="secondary">Регион</Text>
              <div style={{ marginTop: 4 }}>
                <Text>{estimate.region_code}</Text>
              </div>
            </Col>
          )}
          {estimate.price_period && (
            <Col span={6}>
              <Text type="secondary">Ценовой период</Text>
              <div style={{ marginTop: 4 }}>
                <Text>{estimate.price_period}</Text>
              </div>
            </Col>
          )}
        </Row>
      </Card>

      {/* Ошибка пайплайна */}
      {estimate.status === 'error' && estimate.error_message && (
        <Alert
          type="error"
          showIcon
          message="Ошибка пайплайна"
          description={estimate.error_message}
        />
      )}

      {/* Статистика */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Виды работ"
              value={workItems.length}
              prefix={<ToolOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Расценки"
              value={rateMatches.length}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Позиций сметы"
              value={lines.length}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Проблемы"
              value={unresolvedIssues.length}
              valueStyle={{
                color:
                  errorCount > 0
                    ? '#ff4d4f'
                    : warningCount > 0
                      ? '#faad14'
                      : '#52c41a',
              }}
              prefix={
                errorCount > 0 ? (
                  <CloseCircleOutlined />
                ) : warningCount > 0 ? (
                  <WarningOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Итоги стоимости */}
      {estimate.total_cost != null && (
        <Card title="Итоги стоимости" size="small">
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={6}>
              <Statistic
                title="Прямые затраты"
                value={estimate.total_direct_cost ?? 0}
                precision={2}
                suffix="руб."
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="Накладные"
                value={estimate.total_overhead ?? 0}
                precision={2}
                suffix="руб."
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="Сметная прибыль"
                value={estimate.total_profit ?? 0}
                precision={2}
                suffix="руб."
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="Всего"
                value={estimate.total_cost ?? 0}
                precision={2}
                suffix="руб."
                valueStyle={{ color: '#1677ff', fontWeight: 600 }}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* Токены */}
      {estimate.total_tokens > 0 && (
        <Card size="small">
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={6}>
              <Statistic title="Итераций" value={estimate.iteration_count} />
            </Col>
            <Col xs={12} sm={6}>
              <Text type="secondary">Модель</Text>
              <div style={{ marginTop: 4 }}>
                <Tag color="blue">{estimate.model_used ?? '---'}</Tag>
              </div>
            </Col>
            <Col xs={12} sm={12}>
              <Text type="secondary">Токены</Text>
              <div style={{ marginTop: 4 }}>
                <Text>
                  {estimate.prompt_tokens.toLocaleString('ru-RU')} вход +{' '}
                  {estimate.completion_tokens.toLocaleString('ru-RU')} выход ={' '}
                  <Text strong>
                    {estimate.total_tokens.toLocaleString('ru-RU')}
                  </Text>
                </Text>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* Межтомовые зависимости */}
      {depsLoading ? (
        <Spin size="small" />
      ) : (
        dependencyFlags.length > 0 && (
          <Card title="Межтомовые зависимости" size="small">
            <Table
              dataSource={dependencyFlags.map((d) => ({ ...d, key: d.id }))}
              columns={[
                {
                  title: 'Код документа',
                  dataIndex: 'referenced_doc_code',
                  key: 'referenced_doc_code',
                  width: 200,
                  render: (v: string) => <Text code>{v}</Text>,
                },
                {
                  title: 'Лист',
                  dataIndex: 'referenced_sheet',
                  key: 'referenced_sheet',
                  width: 100,
                  render: (v: string | null) => v ?? '--',
                },
                {
                  title: 'Тип',
                  dataIndex: 'dependency_type',
                  key: 'dependency_type',
                  width: 120,
                  render: (v: string | null) =>
                    v ? (
                      <Tag>{DEP_TYPE_LABEL[v] ?? v}</Tag>
                    ) : (
                      '--'
                    ),
                },
                {
                  title: 'Описание',
                  dataIndex: 'description',
                  key: 'description',
                },
                {
                  title: 'Статус',
                  dataIndex: 'resolved',
                  key: 'resolved',
                  width: 110,
                  render: (v: boolean) =>
                    v ? (
                      <Tag color="green" icon={<CheckCircleOutlined />}>
                        Разрешена
                      </Tag>
                    ) : (
                      <Tag color="orange" icon={<QuestionCircleOutlined />}>
                        Открыта
                      </Tag>
                    ),
                },
              ]}
              size="small"
              pagination={false}
              scroll={{ x: 700 }}
            />
          </Card>
        )
      )}
    </Space>
  );
}

// ── Вкладка: Работы ──

function WorkItemsTab({ workItems }: { workItems: DbEstimateWorkItem[] }) {
  const columns: ColumnsType<DbEstimateWorkItem> = [
    {
      title: '##',
      key: 'rowNum',
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: 'Описание работы',
      dataIndex: 'work_description',
      key: 'work_description',
    },
    {
      title: 'Категория',
      dataIndex: 'work_category',
      key: 'work_category',
      width: 150,
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : '--'),
    },
    {
      title: 'Конструкция',
      dataIndex: 'construction',
      key: 'construction',
      width: 140,
      render: (v: string | null) => v ?? '--',
    },
    {
      title: 'Уверенность',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 110,
      sorter: (a: DbEstimateWorkItem, b: DbEstimateWorkItem) =>
        a.confidence - b.confidence,
      render: (v: number) => <ConfidenceTag value={v} />,
    },
    {
      title: 'Проверка',
      dataIndex: 'needs_review',
      key: 'needs_review',
      width: 90,
      filters: [
        { text: 'Требует проверки', value: true },
        { text: 'OK', value: false },
      ],
      onFilter: (value, record) => record.needs_review === value,
      render: (v: boolean) =>
        v ? <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} /> : null,
    },
  ];

  if (workItems.length === 0) {
    return <Empty description="Виды работ ещё не определены" />;
  }

  return (
    <Table
      dataSource={workItems.map((w) => ({ ...w, key: w.id }))}
      columns={columns}
      size="small"
      pagination={{ defaultPageSize: 20 }}
      scroll={{ x: 800 }}
      expandable={{
        expandedRowRender: (record) =>
          record.agent_reasoning ? (
            <div style={{ padding: '8px 12px' }}>
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {record.agent_reasoning}
              </Text>
            </div>
          ) : null,
        rowExpandable: (record) => !!record.agent_reasoning,
      }}
    />
  );
}

// ── Вкладка: Ресурсы ──

function ResourceMatchesTab({
  resourceMatches,
}: {
  resourceMatches: DbEstimateResourceMatch[];
}) {
  const columns: ColumnsType<DbEstimateResourceMatch> = [
    {
      title: '##',
      key: 'rowNum',
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: 'Факт (ID)',
      dataIndex: 'material_fact_id',
      key: 'material_fact_id',
      width: 120,
      render: (v: string) => (
        <Text code style={{ fontSize: 11 }}>
          {v.slice(0, 8)}...
        </Text>
      ),
    },
    {
      title: 'Код ресурса ФСНБ',
      dataIndex: 'fsnb_resource_code',
      key: 'fsnb_resource_code',
      width: 170,
      render: (v: string | null) =>
        v ? <Text code>{v}</Text> : <Text type="secondary">--</Text>,
    },
    {
      title: 'Наименование ресурса',
      dataIndex: 'fsnb_resource_name',
      key: 'fsnb_resource_name',
    },
    {
      title: 'Ед. ФСНБ',
      dataIndex: 'fsnb_resource_unit',
      key: 'fsnb_resource_unit',
      width: 80,
      render: (v: string | null) => v ?? '--',
    },
    {
      title: 'Метод',
      dataIndex: 'match_method',
      key: 'match_method',
      width: 120,
      filters: [
        { text: 'ГОСТ', value: 'gost' },
        { text: 'Код', value: 'code' },
        { text: 'ТГ-семантика', value: 'tg_semantic' },
        { text: 'Семантика', value: 'semantic' },
        { text: 'LLM', value: 'llm' },
        { text: 'Ручной', value: 'manual' },
      ],
      onFilter: (value, record) => record.match_method === value,
      render: (v: ResourceMatchMethod | null) =>
        v ? (
          <Tag color={MATCH_METHOD_COLOR[v] ?? 'default'}>
            {MATCH_METHOD_LABEL[v] ?? v}
          </Tag>
        ) : (
          '--'
        ),
    },
    {
      title: 'Уверенность',
      dataIndex: 'match_confidence',
      key: 'match_confidence',
      width: 110,
      sorter: (a: DbEstimateResourceMatch, b: DbEstimateResourceMatch) =>
        a.match_confidence - b.match_confidence,
      render: (v: number) => <ConfidenceTag value={v} />,
    },
    {
      title: 'Единицы',
      dataIndex: 'unit_compatible',
      key: 'unit_compatible',
      width: 90,
      render: (v: boolean | null) => {
        if (v === true) return <Tag color="green">OK</Tag>;
        if (v === false) return <Tag color="red">Несовм.</Tag>;
        return <Tag>?</Tag>;
      },
    },
    {
      title: 'Проверка',
      dataIndex: 'needs_review',
      key: 'needs_review',
      width: 80,
      render: (v: boolean) =>
        v ? <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} /> : null,
    },
  ];

  if (resourceMatches.length === 0) {
    return <Empty description="Сопоставления ресурсов ещё не выполнены" />;
  }

  return (
    <Table
      dataSource={resourceMatches.map((r) => ({ ...r, key: r.id }))}
      columns={columns}
      size="small"
      pagination={{ defaultPageSize: 20 }}
      scroll={{ x: 1100 }}
      expandable={{
        expandedRowRender: (record) => {
          const parts: React.ReactNode[] = [];
          if (record.conversion_formula) {
            parts.push(
              <div key="formula">
                <Text strong>Формула пересчёта: </Text>
                <Text code>{record.conversion_formula}</Text>
              </div>,
            );
          }
          if (record.agent_reasoning) {
            parts.push(
              <div key="reasoning" style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                  {record.agent_reasoning}
                </Text>
              </div>,
            );
          }
          return parts.length > 0 ? (
            <div style={{ padding: '8px 12px' }}>{parts}</div>
          ) : null;
        },
        rowExpandable: (record) =>
          !!record.agent_reasoning || !!record.conversion_formula,
      }}
    />
  );
}

// ── Вкладка: Расценки ──

function RateMatchesTab({
  rateMatches,
  workItemsMap,
}: {
  rateMatches: DbEstimateRateMatch[];
  workItemsMap: Map<string, DbEstimateWorkItem>;
}) {
  const columns: ColumnsType<DbEstimateRateMatch> = [
    {
      title: '##',
      key: 'rowNum',
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: 'Работа',
      dataIndex: 'work_item_id',
      key: 'work_item_id',
      width: 250,
      render: (v: string) => {
        const wi = workItemsMap.get(v);
        return wi ? (
          <Text style={{ fontSize: 13 }}>{wi.work_description}</Text>
        ) : (
          <Text code style={{ fontSize: 11 }}>
            {v.slice(0, 8)}...
          </Text>
        );
      },
    },
    {
      title: 'Код нормы',
      dataIndex: 'norm_code',
      key: 'norm_code',
      width: 180,
      render: (v: string | null) =>
        v ? <Text code>{v}</Text> : <Text type="secondary">--</Text>,
    },
    {
      title: 'Наименование нормы',
      dataIndex: 'norm_name',
      key: 'norm_name',
    },
    {
      title: 'Ед.',
      dataIndex: 'norm_unit',
      key: 'norm_unit',
      width: 80,
      render: (v: string | null) => v ?? '--',
    },
    {
      title: 'Покрытие ресурсов',
      dataIndex: 'resource_coverage',
      key: 'resource_coverage',
      width: 150,
      sorter: (a: DbEstimateRateMatch, b: DbEstimateRateMatch) =>
        (a.resource_coverage ?? 0) - (b.resource_coverage ?? 0),
      render: (v: number | null) =>
        v != null ? (
          <Progress
            percent={Math.round(v * 100)}
            size="small"
            status={v >= 0.8 ? 'success' : v >= 0.5 ? 'normal' : 'exception'}
            style={{ minWidth: 100 }}
          />
        ) : (
          '--'
        ),
    },
    {
      title: 'Уверенность',
      dataIndex: 'match_confidence',
      key: 'match_confidence',
      width: 110,
      sorter: (a: DbEstimateRateMatch, b: DbEstimateRateMatch) =>
        a.match_confidence - b.match_confidence,
      render: (v: number) => <ConfidenceTag value={v} />,
    },
    {
      title: 'Метод',
      dataIndex: 'match_method',
      key: 'match_method',
      width: 110,
      render: (v: RateMatchMethod | null) =>
        v ? (
          <Tag color={MATCH_METHOD_COLOR[v] ?? 'default'}>
            {MATCH_METHOD_LABEL[v] ?? v}
          </Tag>
        ) : (
          '--'
        ),
    },
    {
      title: 'Альт.',
      dataIndex: 'alternatives',
      key: 'alternatives',
      width: 60,
      render: (v: unknown) => {
        const arr = Array.isArray(v) ? v : [];
        return arr.length > 0 ? (
          <Badge count={arr.length} color="blue" />
        ) : (
          '--'
        );
      },
    },
  ];

  if (rateMatches.length === 0) {
    return <Empty description="Расценки ещё не подобраны" />;
  }

  return (
    <Table
      dataSource={rateMatches.map((r) => ({ ...r, key: r.id }))}
      columns={columns}
      size="small"
      pagination={{ defaultPageSize: 20 }}
      scroll={{ x: 1200 }}
      expandable={{
        expandedRowRender: (record) => {
          const parts: React.ReactNode[] = [];
          if (record.agent_reasoning) {
            parts.push(
              <div key="reasoning">
                <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                  {record.agent_reasoning}
                </Text>
              </div>,
            );
          }
          const alts = Array.isArray(record.alternatives)
            ? (record.alternatives as Array<{
                norm_code: string;
                name: string;
                confidence: number;
                coverage?: number;
              }>)
            : [];
          if (alts.length > 0) {
            parts.push(
              <div key="alts" style={{ marginTop: 8 }}>
                <Text strong>Альтернативы:</Text>
                <Table
                  dataSource={alts.map((a, i) => ({ ...a, key: i }))}
                  columns={[
                    {
                      title: 'Код',
                      dataIndex: 'norm_code',
                      key: 'norm_code',
                      render: (v: string) => <Text code>{v}</Text>,
                    },
                    { title: 'Наименование', dataIndex: 'name', key: 'name' },
                    {
                      title: 'Уверенность',
                      dataIndex: 'confidence',
                      key: 'confidence',
                      render: (v: number) => <ConfidenceTag value={v} />,
                    },
                    {
                      title: 'Покрытие',
                      dataIndex: 'coverage',
                      key: 'coverage',
                      render: (v: number | undefined) =>
                        v != null ? `${Math.round(v * 100)}%` : '--',
                    },
                  ]}
                  size="small"
                  pagination={false}
                  style={{ marginTop: 4 }}
                />
              </div>,
            );
          }
          return parts.length > 0 ? (
            <div style={{ padding: '8px 12px' }}>{parts}</div>
          ) : null;
        },
        rowExpandable: (record) =>
          !!record.agent_reasoning ||
          (Array.isArray(record.alternatives) &&
            (record.alternatives as unknown[]).length > 0),
      }}
    />
  );
}

// ── Вкладка: Смета ──

function EstimateLinesTab({ lines }: { lines: DbEstimateLine[] }) {
  const columns: ColumnsType<DbEstimateLine> = [
    {
      title: '## п/п',
      dataIndex: 'line_number',
      key: 'line_number',
      width: 70,
      render: (v: string | null) => v ?? '--',
    },
    {
      title: 'Обоснование',
      dataIndex: 'justification',
      key: 'justification',
      width: 180,
      render: (v: string | null) =>
        v ? <Text code>{v}</Text> : <Text type="secondary">--</Text>,
    },
    {
      title: 'Наименование',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Ед. изм.',
      dataIndex: 'measure_unit',
      key: 'measure_unit',
      width: 80,
      render: (v: string | null) => v ?? '--',
    },
    {
      title: 'Объём',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
      render: (v: number | null) =>
        v != null ? <Text strong>{v}</Text> : '--',
    },
    {
      title: 'Расчёт объёма',
      dataIndex: 'volume_calc_note',
      key: 'volume_calc_note',
      width: 250,
      render: (v: string | null) =>
        v ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {v}
          </Text>
        ) : (
          '--'
        ),
    },
    {
      title: 'Ст-ть ед.',
      dataIndex: 'unit_cost',
      key: 'unit_cost',
      width: 100,
      render: (v: number | null) => (v != null ? v.toFixed(2) : '--'),
    },
    {
      title: 'Всего',
      dataIndex: 'total_cost',
      key: 'total_cost',
      width: 120,
      render: (v: number | null) =>
        v != null ? (
          <Text strong>{v.toFixed(2)}</Text>
        ) : (
          '--'
        ),
    },
  ];

  if (lines.length === 0) {
    return <Empty description="Позиции сметы ещё не сформированы" />;
  }

  return (
    <Table
      dataSource={lines.map((l) => ({ ...l, key: l.id }))}
      columns={columns}
      size="small"
      pagination={{ defaultPageSize: 30 }}
      scroll={{ x: 1100 }}
      summary={(pageData) => {
        const totalCost = pageData.reduce(
          (sum, row) => sum + (row.total_cost ?? 0),
          0,
        );
        if (totalCost === 0) return null;
        return (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={7} align="right">
              <Text strong>Итого по странице:</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7}>
              <Text strong>{totalCost.toFixed(2)}</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        );
      }}
    />
  );
}

// ── Главная страница сметы ──

export default function EstimatePage() {
  const { docId, estimateId } = useParams<{
    docId: string;
    estimateId: string;
  }>();
  const navigate = useNavigate();
  const { message: msg } = App.useApp();

  const {
    estimate,
    workItems,
    rateMatches,
    resourceMatches,
    lines,
    reviewQueue,
    loading,
    error,
    refetch,
  } = useEstimateData(estimateId ?? null);

  // Загрузка межтомовых зависимостей по doc_id
  const [dependencyFlags, setDependencyFlags] = useState<DbDependencyFlag[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    setDepsLoading(true);
    supabase
      .from('dependency_flags')
      .select('*')
      .eq('doc_id', docId)
      .order('created_at')
      .then(({ data }) => {
        if (!cancelled) {
          setDependencyFlags((data as DbDependencyFlag[]) ?? []);
          setDepsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // Маппинг workItems для вкладки расценок
  const workItemsMap = useMemo(
    () => new Map(workItems.map((wi) => [wi.id, wi])),
    [workItems],
  );

  // Обработчик "Решить" в review queue
  const handleResolve = useCallback(
    async (itemId: string) => {
      const { error: err } = await supabase
        .from('estimate_review_queue')
        .update({
          resolved: true,
          resolved_by: 'user',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (err) {
        msg.error('Ошибка при обновлении');
      } else {
        msg.success('Проблема отмечена как решённая');
        void refetch();
      }
    },
    [msg, refetch],
  );

  // Подсчёты для бейджей на вкладках
  const unresolvedReviewCount = reviewQueue.filter((r) => !r.resolved).length;
  const needsReviewWorkItems = workItems.filter((w) => w.needs_review).length;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Ошибка загрузки сметы"
        description={error}
        showIcon
      />
    );
  }

  if (!estimate) {
    return (
      <Alert
        type="warning"
        message="Смета не найдена"
        description={`Смета с ID ${estimateId ?? '?'} не найдена.`}
        showIcon
      />
    );
  }

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span>
          <DashboardOutlined /> Обзор
        </span>
      ),
      children: (
        <OverviewTab
          estimate={estimate}
          workItems={workItems}
          rateMatches={rateMatches}
          lines={lines}
          reviewQueue={reviewQueue}
          dependencyFlags={dependencyFlags}
          depsLoading={depsLoading}
        />
      ),
    },
    {
      key: 'work_items',
      label: (
        <span>
          <ToolOutlined /> Работы{' '}
          {needsReviewWorkItems > 0 && (
            <Badge count={needsReviewWorkItems} size="small" color="orange" />
          )}
        </span>
      ),
      children: <WorkItemsTab workItems={workItems} />,
    },
    {
      key: 'resources',
      label: (
        <span>
          <LinkOutlined /> Ресурсы
        </span>
      ),
      children: <ResourceMatchesTab resourceMatches={resourceMatches} />,
    },
    {
      key: 'rates',
      label: (
        <span>
          <DollarOutlined /> Расценки
        </span>
      ),
      children: (
        <RateMatchesTab
          rateMatches={rateMatches}
          workItemsMap={workItemsMap}
        />
      ),
    },
    {
      key: 'lines',
      label: (
        <span>
          <FileTextOutlined /> Смета
        </span>
      ),
      children: <EstimateLinesTab lines={lines} />,
    },
    {
      key: 'review',
      label: (
        <span>
          <AuditOutlined /> Проверка{' '}
          {unresolvedReviewCount > 0 && (
            <Badge
              count={unresolvedReviewCount}
              size="small"
              color={
                reviewQueue.some(
                  (r) => !r.resolved && r.severity === 'error',
                )
                  ? 'red'
                  : 'orange'
              }
            />
          )}
        </span>
      ),
      children: (
        <ReviewQueue items={reviewQueue} onResolve={handleResolve} />
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/doc/${docId}`)}
        >
          Назад к документу
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          {estimate.name}
        </Title>
        <Tag color={STATUS_COLOR[estimate.status]}>
          {STATUS_LABEL[estimate.status] ?? estimate.status}
        </Tag>
      </Space>

      <Tabs items={tabItems} defaultActiveKey="overview" />
    </Space>
  );
}
