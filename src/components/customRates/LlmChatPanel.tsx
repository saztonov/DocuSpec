import { useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Typography, Alert, Button } from 'antd';
import { PlusCircleOutlined } from '@ant-design/icons';
import ChatMessageList from './ChatMessageList';
import ChatInputBar from './ChatInputBar';
import { useRateRecommenderChat } from '../../hooks/useRateRecommenderChat';
import { getAvailableModels } from '../../lib/models';
import {
  LLM_CHAT_SCOPE_LS_KEY,
  type Candidate,
  type RateSearchScope,
} from '../../types/customRates';

function loadChatScope(): RateSearchScope {
  try {
    const v = localStorage.getItem(LLM_CHAT_SCOPE_LS_KEY);
    if (v === 'fsnb' || v === 'imported' || v === 'both') return v;
  } catch {
    /* ignore */
  }
  return 'both';
}

interface Props {
  inDraftKeys: Set<string>;
  existingKeys: Set<string>;
  onAddToDraft: (c: Candidate) => void;
}

const LS_SELECTED_MODEL = 'customRates.llmChat.selectedModel';

export default function LlmChatPanel({ inDraftKeys, existingKeys, onAddToDraft }: Props) {
  const models = useMemo(() => getAvailableModels(), []);

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const stored = localStorage.getItem(LS_SELECTED_MODEL);
    if (stored && models.some((m) => m.value === stored)) return stored;
    return models[0]?.value ?? '';
  });

  const handleModelChange = (next: string) => {
    setSelectedModel(next);
    try {
      localStorage.setItem(LS_SELECTED_MODEL, next);
    } catch {
      /* ignore quota / unavailable */
    }
  };

  const [scope, setScope] = useState<RateSearchScope>(() => loadChatScope());

  const handleScopeChange = (next: RateSearchScope) => {
    setScope(next);
    try {
      localStorage.setItem(LLM_CHAT_SCOPE_LS_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const chat = useRateRecommenderChat(selectedModel || undefined, scope);
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

            {/* Кнопка «Найти ещё подходящие» — видна только после первого
                propose_rate_set, чтобы пользователь мог одним кликом запросить
                расширение списка с явным исключением уже найденных id. */}
            {!chat.loading && chat.proposedCount > 0 && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <Button
                  icon={<PlusCircleOutlined />}
                  onClick={() => chat.findMore()}
                  type="dashed"
                >
                  Найти ещё подходящие ({chat.proposedCount} уже предложено)
                </Button>
              </div>
            )}
          </div>

          <ChatInputBar
            onSend={(text) => chat.sendMessage(text)}
            onReset={chat.reset}
            disabled={chat.loading}
            models={models}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            scope={scope}
            onScopeChange={handleScopeChange}
          />
        </>
      )}
    </div>
  );
}
