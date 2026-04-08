import { useMemo } from 'react';
import { Table, Tag, Popconfirm, Button, Space } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { CustomRateRow, RateSourceKind } from '../../types/customRates';
import { RATE_SOURCE_COLOR, RATE_SOURCE_LABEL } from '../../types/customRates';

interface Props {
  rows: CustomRateRow[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onDelete: (id: string) => void | Promise<void>;
}

export default function CustomRatesTable({
  rows,
  total,
  loading,
  page,
  pageSize,
  onPageChange,
  onDelete,
}: Props) {
  const columns: ColumnsType<CustomRateRow> = useMemo(
    () => [
      { title: 'Категория', dataIndex: 'category_name', width: 220, ellipsis: true },
      { title: 'Вид затрат', dataIndex: 'type_name', width: 220, ellipsis: true },
      { title: 'Наименование', dataIndex: 'work_name' },
      { title: 'Единица', dataIndex: 'unit', width: 100 },
      {
        title: 'Источник',
        dataIndex: 'source_kind',
        width: 110,
        render: (kind: RateSourceKind) => (
          <Tag color={RATE_SOURCE_COLOR[kind]}>{RATE_SOURCE_LABEL[kind]}</Tag>
        ),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 100,
        align: 'center',
        render: (_, row) => (
          <Space size={4}>
            <Popconfirm
              title="Удалить расценку?"
              description="Действие нельзя отменить."
              okText="Удалить"
              okButtonProps={{ danger: true }}
              cancelText="Отмена"
              onConfirm={() => onDelete(row.id)}
            >
              <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [onDelete],
  );

  return (
    <Table<CustomRateRow>
      size="small"
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={rows}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: false,
        onChange: onPageChange,
      }}
    />
  );
}
