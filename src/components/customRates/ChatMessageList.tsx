import { Typography, Tag, Space } from 'antd';
import { SearchOutlined, ToolOutlined } from '@ant-design/icons';
import CandidateCard from './CandidateCard';
import type { Candidate, ChatMessage } from '../../types/customRates';

interface Props {
  messages: ChatMessage[];
  inDraftKeys: Set<string>;
  existingKeys: Set<string>;
  onAddToDraft: (c: Candidate) => void;
}

export default function ChatMessageList({
  messages,
  inDraftKeys,
  existingKeys,
  onAddToDraft,
}: Props) {
  return (
    <div>
      {messages.map((m) => {
        switch (m.kind) {
          case 'user':
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <div
                  style={{
                    maxWidth: '70%',
                    background: '#1677ff',
                    color: '#fff',
                    padding: '10px 14px',
                    borderRadius: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text}
                </div>
              </div>
            );

          case 'assistant_text':
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                <div
                  style={{
                    maxWidth: '85%',
                    background: '#fff',
                    border: '1px solid #f0f0f0',
                    padding: '10px 14px',
                    borderRadius: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text}
                </div>
              </div>
            );

          case 'assistant_tool':
            return (
              <div key={m.id} style={{ marginBottom: 8 }}>
                <Space size={6} wrap>
                  {m.tools.map((t) => (
                    <Tag
                      key={t.id}
                      icon={t.name === 'search_fsnb_fallback' ? <SearchOutlined /> : <ToolOutlined />}
                      color="default"
                    >
                      {t.name}
                    </Tag>
                  ))}
                </Space>
              </div>
            );

          case 'assistant_proposal':
            return (
              <div key={m.id} style={{ marginBottom: 16 }}>
                {m.summary && (
                  <div
                    style={{
                      background: '#f6ffed',
                      border: '1px solid #b7eb8f',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <Typography.Text>{m.summary}</Typography.Text>
                  </div>
                )}
                {m.candidates.map((c) => {
                  const sourceKey = c.sourceId ? `${c.source}:${c.sourceId}` : null;
                  let status: 'idle' | 'in_draft' | 'already_in_db' = 'idle';
                  if (inDraftKeys.has(c.key)) {
                    status = 'in_draft';
                  } else if (sourceKey && existingKeys.has(sourceKey)) {
                    status = 'already_in_db';
                  }
                  return (
                    <CandidateCard key={c.key} candidate={c} status={status} onAdd={onAddToDraft} />
                  );
                })}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
