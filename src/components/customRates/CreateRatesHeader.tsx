import { Button, Popconfirm, Space, Typography } from 'antd';
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';

interface Props {
  draftCount: number;
  savedCount: number;
  onClose: () => void;
  onClearDraft: () => void;
}

export default function CreateRatesHeader({
  draftCount,
  savedCount,
  onClose,
  onClearDraft,
}: Props) {
  return (
    <div
      style={{
        height: 56,
        flexShrink: 0,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
      }}
    >
      <div>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Создание расценок
        </Typography.Title>
        {savedCount > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Сохранено за сессию: {savedCount}
          </Typography.Text>
        )}
      </div>
      <Space>
        {draftCount > 0 && (
          <Popconfirm
            title="Очистить черновик?"
            description="Все несохранённые расценки в корзине будут потеряны."
            okText="Очистить"
            okButtonProps={{ danger: true }}
            cancelText="Отмена"
            onConfirm={onClearDraft}
          >
            <Button icon={<ReloadOutlined />} size="small">
              Очистить черновик
            </Button>
          </Popconfirm>
        )}
        <Button icon={<CloseOutlined />} type="text" onClick={onClose} />
      </Space>
    </div>
  );
}
