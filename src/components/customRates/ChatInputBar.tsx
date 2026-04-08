import { useState } from 'react';
import { Input, Button, Space, Popconfirm } from 'antd';
import { SendOutlined, ReloadOutlined } from '@ant-design/icons';

interface Props {
  onSend: (text: string) => void | Promise<void>;
  onReset: () => void;
  disabled: boolean;
}

export default function ChatInputBar({ onSend, onReset, disabled }: Props) {
  const [text, setText] = useState('');

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    await onSend(trimmed);
  };

  return (
    <div
      style={{
        padding: '12px 24px',
        borderTop: '1px solid #f0f0f0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Input.TextArea
          placeholder="Опишите работы или задайте уточнение... (Enter — отправить, Shift+Enter — перенос строки)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoSize={{ minRows: 1, maxRows: 5 }}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={disabled || !text.trim()}
        >
          Отправить
        </Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Popconfirm
          title="Очистить чат?"
          description="История сообщений будет удалена. Расценки в корзине останутся."
          okText="Очистить"
          cancelText="Отмена"
          onConfirm={onReset}
        >
          <Button size="small" type="text" icon={<ReloadOutlined />}>
            Сбросить чат
          </Button>
        </Popconfirm>
        <Space>
          <span style={{ fontSize: 11, color: '#8c8c8c' }}>
            Модель: {import.meta.env.VITE_OPENROUTER_MODEL || 'anthropic/claude-sonnet-4'}
          </span>
        </Space>
      </div>
    </div>
  );
}
