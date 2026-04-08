import { useCallback, useMemo, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Select,
  Popconfirm,
  App,
  Typography,
} from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import {
  getLlmLogs,
  clearLlmLogs,
  downloadLlmLogs,
  type LlmLogEntry,
  type LlmLogPhase,
} from '../../lib/llmLogger.ts';

const { Text, Paragraph } = Typography;

type PhaseFilter = 'all' | LlmLogPhase;

function phaseColor(phase: LlmLogPhase): string {
  switch (phase) {
    case 'request':
      return 'blue';
    case 'response':
      return 'green';
    case 'error':
      return 'red';
    default:
      return 'default';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function previewText(entry: LlmLogEntry): string {
  if (entry.phase === 'error') {
    return entry.error?.message ?? '';
  }
  if (entry.phase === 'request') {
    const req = entry.request as { messages?: unknown[]; tools?: unknown[]; inputCount?: number } | undefined;
    if (!req) return '';
    if (typeof req.inputCount === 'number') {
      return `embeddings · inputs=${req.inputCount}`;
    }
    const msgs = Array.isArray(req.messages) ? req.messages.length : 0;
    const tools = Array.isArray(req.tools) ? req.tools.length : 0;
    return `messages=${msgs}${tools ? `, tools=${tools}` : ''}`;
  }
  // response
  const resp = entry.response as {
    choices?: Array<{ finish_reason?: string; message?: { tool_calls?: unknown[] } }>;
    usage?: { total_tokens?: number };
    embeddingsCount?: number;
  } | undefined;
  if (!resp) return '';
  if (typeof resp.embeddingsCount === 'number') {
    return `embeddings=${resp.embeddingsCount}`;
  }
  const choice = resp.choices?.[0];
  const fr = choice?.finish_reason ?? '?';
  const tc = choice?.message?.tool_calls?.length ?? 0;
  const tokens = resp.usage?.total_tokens ?? '?';
  return `finish=${fr}${tc ? `, tool_calls=${tc}` : ''}, tokens=${tokens}`;
}

export default function LlmLogsTab() {
  const { message } = App.useApp();
  const [tick, setTick] = useState(0);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const logs = useMemo(() => {
    // tick заставляет useMemo перечитать данные
    void tick;
    const all = getLlmLogs();
    // Новые сверху
    return all.slice().reverse();
  }, [tick]);

  const filtered = useMemo(() => {
    if (phaseFilter === 'all') return logs;
    return logs.filter((e) => e.phase === phaseFilter);
  }, [logs, phaseFilter]);

  const handleClear = useCallback(() => {
    clearLlmLogs();
    reload();
    message.success('Логи очищены');
  }, [reload, message]);

  const handleDownload = useCallback(() => {
    if (logs.length === 0) {
      message.info('Нет логов для скачивания');
      return;
    }
    downloadLlmLogs();
  }, [logs.length, message]);

  const handleCopyJson = useCallback(
    async (data: unknown) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        message.success('Скопировано в буфер');
      } catch {
        message.error('Не удалось скопировать');
      }
    },
    [message],
  );

  const columns = [
    {
      title: '№',
      key: 'pairNum',
      width: 60,
      render: (_: unknown, r: LlmLogEntry) => r.pairNum,
    },
    {
      title: 'Время',
      key: 'timestamp',
      width: 130,
      render: (_: unknown, r: LlmLogEntry) => formatTime(r.timestamp),
    },
    {
      title: 'Тип',
      dataIndex: 'kind',
      key: 'kind',
      width: 100,
      render: (v: LlmLogEntry['kind']) => <Tag>{v}</Tag>,
    },
    {
      title: 'Фаза',
      dataIndex: 'phase',
      key: 'phase',
      width: 100,
      render: (v: LlmLogPhase) => <Tag color={phaseColor(v)}>{v}</Tag>,
    },
    {
      title: 'Модель',
      dataIndex: 'model',
      key: 'model',
      width: 220,
      ellipsis: true,
      render: (v: string | undefined) => v ?? '—',
    },
    {
      title: 'Длит., мс',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 100,
      render: (v: number | undefined) => (v != null ? v : '—'),
    },
    {
      title: 'Краткое описание',
      key: 'preview',
      ellipsis: true,
      render: (_: unknown, r: LlmLogEntry) => <Text type="secondary">{previewText(r)}</Text>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button icon={<ReloadOutlined />} onClick={reload}>
          Обновить
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleDownload}>
          Скачать JSON
        </Button>
        <Popconfirm
          title="Очистить все логи LLM?"
          okText="Да"
          cancelText="Нет"
          onConfirm={handleClear}
        >
          <Button danger icon={<DeleteOutlined />}>
            Очистить
          </Button>
        </Popconfirm>
        <Select
          value={phaseFilter}
          onChange={setPhaseFilter}
          style={{ width: 180 }}
          options={[
            { value: 'all', label: 'Все фазы' },
            { value: 'request', label: 'Только request' },
            { value: 'response', label: 'Только response' },
            { value: 'error', label: 'Только error' },
          ]}
        />
        <Text type="secondary">
          Всего записей: {logs.length} (ring buffer до 50)
        </Text>
      </Space>

      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        expandable={{
          expandedRowRender: (record: LlmLogEntry) => (
            <div style={{ padding: 12, background: '#fafafa' }}>
              {record.phase === 'error' && record.error && (
                <div style={{ marginBottom: 12 }}>
                  <Paragraph strong style={{ color: '#d4380d', marginBottom: 4 }}>
                    Ошибка
                  </Paragraph>
                  <Paragraph style={{ margin: 0 }}>{record.error.message}</Paragraph>
                  {record.error.status != null && (
                    <Paragraph style={{ margin: 0 }}>
                      <Text type="secondary">HTTP status:</Text> {record.error.status}
                    </Paragraph>
                  )}
                  {record.error.rawData !== undefined && (
                    <>
                      <Space style={{ marginTop: 8, marginBottom: 4 }}>
                        <Text strong>rawData (ответ провайдера):</Text>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => void handleCopyJson(record.error?.rawData)}
                        >
                          Копировать
                        </Button>
                      </Space>
                      <pre
                        style={{
                          maxHeight: 400,
                          overflow: 'auto',
                          background: '#fff',
                          padding: 8,
                          border: '1px solid #f0f0f0',
                          fontSize: 12,
                          margin: 0,
                        }}
                      >
                        {JSON.stringify(record.error.rawData, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}

              {record.request !== undefined && (
                <div style={{ marginBottom: 12 }}>
                  <Space style={{ marginBottom: 4 }}>
                    <Text strong>Request</Text>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => void handleCopyJson(record.request)}
                    >
                      Копировать
                    </Button>
                  </Space>
                  <pre
                    style={{
                      maxHeight: 400,
                      overflow: 'auto',
                      background: '#fff',
                      padding: 8,
                      border: '1px solid #f0f0f0',
                      fontSize: 12,
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(record.request, null, 2)}
                  </pre>
                </div>
              )}

              {record.response !== undefined && (
                <div>
                  <Space style={{ marginBottom: 4 }}>
                    <Text strong>Response</Text>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => void handleCopyJson(record.response)}
                    >
                      Копировать
                    </Button>
                  </Space>
                  <pre
                    style={{
                      maxHeight: 400,
                      overflow: 'auto',
                      background: '#fff',
                      padding: 8,
                      border: '1px solid #f0f0f0',
                      fontSize: 12,
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(record.response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ),
        }}
      />
    </div>
  );
}
