import { useEffect, useRef } from 'react';
import { Spin, Typography, Alert } from 'antd';
import ChatMessageList from './ChatMessageList';
import ChatInputBar from './ChatInputBar';
import { useRateRecommenderChat } from '../../hooks/useRateRecommenderChat';
import type { Candidate } from '../../types/customRates';

interface Props {
  inDraftKeys: Set<string>;
  existingKeys: Set<string>;
  onAddToDraft: (c: Candidate) => void;
}

export default function LlmChatPanel({ inDraftKeys, existingKeys, onAddToDraft }: Props) {
  const chat = useRateRecommenderChat();
  const listRef = useRef<HTMLDivElement>(null);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chat.messages.length, chat.loading]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {chat.initializing && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">
              Загружаю стартовый контекст для LLM-агента...
            </Typography.Text>
          </div>
        </div>
      )}

      {chat.error && !chat.initializing && (
        <div style={{ padding: 16 }}>
          <Alert type="error" message="Ошибка чата" description={chat.error} showIcon />
        </div>
      )}

      {!chat.initializing && (
        <>
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 24px',
              minHeight: 0,
              background: '#fafafa',
            }}
          >
            {chat.messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <Typography.Text type="secondary">
                  Опишите работы, которые нужно осметить. Например:<br />
                  «Устройство фасада — алюминиевые витражи, стоечно-ригельная система»
                </Typography.Text>
              </div>
            ) : (
              <ChatMessageList
                messages={chat.messages}
                inDraftKeys={inDraftKeys}
                existingKeys={existingKeys}
                onAddToDraft={onAddToDraft}
              />
            )}

            {chat.loading && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spin size="small" />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  LLM думает…
                </Typography.Text>
              </div>
            )}
          </div>

          <ChatInputBar
            onSend={(text) => chat.sendMessage(text)}
            onReset={chat.reset}
            disabled={chat.loading}
          />
        </>
      )}
    </div>
  );
}
