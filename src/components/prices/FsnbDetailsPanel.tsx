import { useEffect, useState } from 'react';
import {
  Typography,
  Tag,
  Table,
  Space,
  Button,
  Descriptions,
  Divider,
  Empty,
  Spin,
  Card,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import {
  getNormBreadcrumbs,
  getResourceBreadcrumbs,
  getResourceUsage,
  getResourceTechGroups,
  type NormBreadcrumbs,
  type ResourceBreadcrumbs,
  type ResourceUsageRow,
  type ResourceTgRow,
} from '../../lib/fsnbExplorer';
import {
  getNormComposition,
  getAllowedResources,
  type NormCompositionRow,
  type AllowedTgGroup,
} from '../../lib/ragSearch';

export type DetailsTarget =
  | { kind: 'norm'; id: string }
  | { kind: 'resource'; id: string }
  | null;

interface Props {
  target: DetailsTarget;
  onTargetChange: (t: DetailsTarget) => void;
}

export default function FsnbDetailsPanel({ target, onTargetChange }: Props) {
  const [history, setHistory] = useState<DetailsTarget[]>([]);

  // Когда target меняется снаружи — пушим в историю
  useEffect(() => {
    if (!target) return;
    setHistory(prev => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.kind === target.kind &&
        last.id === target.id
      ) {
        return prev;
      }
      return [...prev, target];
    });
  }, [target]);

  const goBack = () => {
    if (history.length < 2) return;
    const next = history.slice(0, -1);
    setHistory(next);
    onTargetChange(next[next.length - 1] ?? null);
  };

  if (!target) {
    return (
      <div style={{ padding: 16 }}>
        <Empty description="Выберите норму или ресурс для просмотра деталей" />
      </div>
    );
  }

  return (
    <div style={{ padding: 12, height: '100%', overflow: 'auto' }}>
      <Space style={{ marginBottom: 8 }}>
        <Button
          size="small"
          icon={<ArrowLeftOutlined />}
          disabled={history.length < 2}
          onClick={goBack}
        >
          Назад
        </Button>
      </Space>
      {target.kind === 'norm' ? (
        <NormDetails normId={target.id} onOpenResource={id => onTargetChange({ kind: 'resource', id })} />
      ) : (
        <ResourceDetails
          resourceId={target.id}
          onOpenNorm={id => onTargetChange({ kind: 'norm', id })}
        />
      )}
    </div>
  );
}

// ── Детали нормы ───────────────────────────────────────────────

function NormDetails({
  normId,
  onOpenResource,
}: {
  normId: string;
  onOpenResource: (id: string) => void;
}) {
  const [meta, setMeta] = useState<NormBreadcrumbs | null>(null);
  const [composition, setComposition] = useState<NormCompositionRow[]>([]);
  const [tgs, setTgs] = useState<AllowedTgGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getNormBreadcrumbs(normId),
      getNormComposition(normId),
      getAllowedResources(normId),
    ])
      .then(([m, c, t]) => {
        if (cancelled) return;
        setMeta(m);
        setComposition(c);
        setTgs(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [normId]);

  if (loading) return <Spin />;
  if (!meta) return <Empty description="Норма не найдена" />;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Tag color="blue">{meta.base_type}</Tag>
        <Typography.Text code>{meta.norm_code}</Typography.Text>
        <Typography.Title level={5} style={{ marginTop: 4 }}>
          {meta.name}
        </Typography.Title>
        <Typography.Text type="secondary">Ед. изм.: {meta.measure_unit}</Typography.Text>
      </div>

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Сборник">
          {meta.collection_code} — {meta.collection_name ?? '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Раздел">
          {meta.division_code} — {meta.division_name ?? '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Таблица">
          {meta.table_code} — {meta.table_name ?? '—'}
        </Descriptions.Item>
        {meta.work_category && (
          <Descriptions.Item label="Категория работ">
            {meta.work_category}
          </Descriptions.Item>
        )}
      </Descriptions>

      <Divider style={{ margin: '8px 0' }}>Ресурсный состав</Divider>
      <Table
        size="small"
        dataSource={composition}
        rowKey={(r, i) => `${r.resource_code}-${i}`}
        pagination={false}
        locale={{ emptyText: 'Нет данных о ресурсном составе' }}
        columns={[
          {
            title: 'Код',
            dataIndex: 'resource_code',
            width: 140,
            render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
          },
          { title: 'Наименование', dataIndex: 'resource_name' },
          { title: 'Тип', dataIndex: 'resource_type', width: 100 },
          {
            title: 'Расход',
            dataIndex: 'consumption',
            width: 100,
            align: 'right',
          },
          { title: 'Ед.изм.', dataIndex: 'measure_unit', width: 80 },
        ]}
      />

      <Divider style={{ margin: '8px 0' }}>Технологические группы</Divider>
      {tgs.length === 0 && (
        <Typography.Text type="secondary">Норма не привязана к техгруппам</Typography.Text>
      )}
      {tgs.map(tg => (
        <Card
          key={tg.tg_id}
          size="small"
          title={
            <Space>
              <Tag color="purple">ТГ</Tag>
              <Typography.Text code>{tg.tg_code}</Typography.Text>
              <Typography.Text type="secondary">
                ({tg.resources.length} ресурсов)
              </Typography.Text>
            </Space>
          }
        >
          {tg.resources.length === 0 ? (
            <Typography.Text type="secondary">Нет ресурсов в группе</Typography.Text>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {tg.resources.slice(0, 30).map(r => (
                <li key={r.id}>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0 }}
                    onClick={() => onOpenResource(r.id)}
                  >
                    <Typography.Text code>{r.code}</Typography.Text> {r.name}
                  </Button>
                </li>
              ))}
              {tg.resources.length > 30 && (
                <li>
                  <Typography.Text type="secondary">
                    …и ещё {tg.resources.length - 30}
                  </Typography.Text>
                </li>
              )}
            </ul>
          )}
        </Card>
      ))}
    </Space>
  );
}

// ── Детали ресурса ─────────────────────────────────────────────

function ResourceDetails({
  resourceId,
  onOpenNorm,
}: {
  resourceId: string;
  onOpenNorm: (id: string) => void;
}) {
  const [meta, setMeta] = useState<ResourceBreadcrumbs | null>(null);
  const [usage, setUsage] = useState<ResourceUsageRow[]>([]);
  const [tgs, setTgs] = useState<ResourceTgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getResourceBreadcrumbs(resourceId),
      getResourceUsage(resourceId),
      getResourceTechGroups(resourceId),
    ])
      .then(([m, u, t]) => {
        if (cancelled) return;
        setMeta(m);
        setUsage(u);
        setTgs(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  if (loading) return <Spin />;
  if (!meta) return <Empty description="Ресурс не найден" />;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Tag color="green">{meta.resource_type}</Tag>
        <Typography.Text code>{meta.code}</Typography.Text>
        <Typography.Title level={5} style={{ marginTop: 4 }}>
          {meta.name}
        </Typography.Title>
        <Typography.Text type="secondary">
          Ед. изм.: {meta.measure_unit ?? '—'}
        </Typography.Text>
      </div>

      <Descriptions size="small" column={1} bordered>
        {meta.book_code && (
          <Descriptions.Item label="Книга">
            {meta.book_code} — {meta.book_name ?? ''}
          </Descriptions.Item>
        )}
        {meta.part_code && (
          <Descriptions.Item label="Часть">
            {meta.part_code} — {meta.part_name ?? ''}
          </Descriptions.Item>
        )}
        {meta.section_code && (
          <Descriptions.Item label="Раздел">
            {meta.section_code} — {meta.section_name ?? ''}
          </Descriptions.Item>
        )}
        {meta.group_code && (
          <Descriptions.Item label="Группа">
            {meta.group_code} — {meta.group_name ?? ''}
          </Descriptions.Item>
        )}
        {meta.base_price != null && (
          <Descriptions.Item label="Базовая цена">{meta.base_price}</Descriptions.Item>
        )}
        {meta.opt_price != null && (
          <Descriptions.Item label="Опт. цена">{meta.opt_price}</Descriptions.Item>
        )}
        {meta.salary_mach != null && (
          <Descriptions.Item label="ЗП машиниста">{meta.salary_mach}</Descriptions.Item>
        )}
        {meta.gost_refs && meta.gost_refs.length > 0 && (
          <Descriptions.Item label="ГОСТ">
            {meta.gost_refs.map(g => (
              <Tag key={g}>{g}</Tag>
            ))}
          </Descriptions.Item>
        )}
      </Descriptions>

      <Divider style={{ margin: '8px 0' }}>Технологические группы</Divider>
      {tgs.length === 0 ? (
        <Typography.Text type="secondary">Не привязан к ТГ</Typography.Text>
      ) : (
        <Space wrap>
          {tgs.map(t => (
            <Tag color="purple" key={t.tg_id}>
              {t.tg_code} — {t.tg_name ?? ''}
            </Tag>
          ))}
        </Space>
      )}

      <Divider style={{ margin: '8px 0' }}>
        Используется в нормах ({usage.length})
      </Divider>
      <Table
        size="small"
        dataSource={usage}
        rowKey={(r, i) => `${r.norm_id}-${i}`}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: 'Не найдено норм' }}
        columns={[
          {
            title: 'Тип',
            dataIndex: 'base_type',
            width: 80,
            render: (v: string) => <Tag color="blue">{v}</Tag>,
          },
          {
            title: 'Код',
            dataIndex: 'norm_code',
            width: 140,
            render: (v: string, row) => (
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => onOpenNorm(row.norm_id)}
              >
                <Typography.Text code>{v}</Typography.Text>
              </Button>
            ),
          },
          { title: 'Наименование', dataIndex: 'norm_name' },
          {
            title: 'Расход',
            dataIndex: 'consumption',
            width: 100,
            align: 'right',
          },
        ]}
      />
    </Space>
  );
}
