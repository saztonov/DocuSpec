import { useState, useMemo } from 'react';
import { Table, Tag, Button, Switch, Space, Typography, Empty } from 'antd';
import {
  CheckOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DbEstimateReviewItem, ReviewSeverity } from '../../types/estimate.ts';

const { Text } = Typography;

const SEVERITY_CONFIG: Record<
  ReviewSeverity,
  { color: string; label: string; icon: React.ReactNode; order: number }
> = {
  error: {
    color: 'red',
    label: 'Ошибка',
    icon: <ExclamationCircleOutlined />,
    order: 0,
  },
  warning: {
    color: 'orange',
    label: 'Предупреждение',
    icon: <WarningOutlined />,
    order: 1,
  },
  info: {
    color: 'blue',
    label: 'Информация',
    icon: <InfoCircleOutlined />,
    order: 2,
  },
};

const ISSUE_TYPE_LABEL: Record<string, string> = {
  uncovered_material: 'Материал без работы',
  unit_mismatch: 'Несовместимые единицы',
  double_count: 'Двойной счёт',
  cross_volume_dep: 'Межтомовая зависимость',
  no_geometry: 'Нет геометрии',
  low_coverage: 'Низкое покрытие',
  tg_mismatch: 'Ресурс вне ТГ',
  low_confidence: 'Низкая уверенность',
};

interface Props {
  items: DbEstimateReviewItem[];
  onResolve: (itemId: string) => void;
}

export default function ReviewQueue({ items, onResolve }: Props) {
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const list = showAll ? items : items.filter((i) => !i.resolved);
    return [...list].sort((a, b) => {
      const aOrder = SEVERITY_CONFIG[a.severity]?.order ?? 9;
      const bOrder = SEVERITY_CONFIG[b.severity]?.order ?? 9;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [items, showAll]);

  const unresolvedCount = items.filter((i) => !i.resolved).length;

  const columns: ColumnsType<DbEstimateReviewItem> = [
    {
      title: 'Критичность',
      dataIndex: 'severity',
      key: 'severity',
      width: 140,
      render: (severity: ReviewSeverity) => {
        const cfg = SEVERITY_CONFIG[severity];
        return cfg ? (
          <Tag color={cfg.color} icon={cfg.icon}>
            {cfg.label}
          </Tag>
        ) : (
          <Tag>{severity}</Tag>
        );
      },
    },
    {
      title: 'Тип проблемы',
      dataIndex: 'issue_type',
      key: 'issue_type',
      width: 200,
      render: (type: string) => (
        <Text>{ISSUE_TYPE_LABEL[type] ?? type}</Text>
      ),
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Рекомендация',
      dataIndex: 'suggested_action',
      key: 'suggested_action',
      width: 280,
      render: (v: string | null) =>
        v ? <Text type="secondary">{v}</Text> : <Text type="secondary">--</Text>,
    },
    {
      title: 'Действие',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record: DbEstimateReviewItem) => {
        if (record.resolved) {
          return (
            <Tag color="green" icon={<CheckOutlined />}>
              Решено
            </Tag>
          );
        }
        return (
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => onResolve(record.id)}
          >
            Решить
          </Button>
        );
      },
    },
  ];

  if (items.length === 0) {
    return <Empty description="Очередь проверки пуста" />;
  }

  return (
    <div>
      <Space style={{ marginBottom: 12 }} align="center">
        <Switch
          checked={showAll}
          onChange={setShowAll}
          checkedChildren="Все"
          unCheckedChildren="Открытые"
        />
        <Text type="secondary">
          Нерешённых: <Text strong>{unresolvedCount}</Text> из {items.length}
        </Text>
      </Space>

      <Table
        dataSource={filtered.map((item) => ({ ...item, key: item.id }))}
        columns={columns}
        size="small"
        pagination={{ defaultPageSize: 20 }}
        scroll={{ x: 900 }}
      />
    </div>
  );
}
