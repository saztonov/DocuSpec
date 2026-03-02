import { useMemo } from 'react';
import { Modal, Table, Typography, Space } from 'antd';
import { parseTables } from '../lib/parser.ts';
import type { DbDocBlock } from '../types/database.ts';

const { Title, Text } = Typography;

export default function BlockTableModal({ block, onClose }: { block: DbDocBlock; onClose: () => void }) {
  const tables = useMemo(() => {
    const lines = block.content.split('\n');
    return parseTables(lines, block.section_title);
  }, [block]);

  return (
    <Modal
      open
      title={
        <Space>
          <Text code>{block.block_uid}</Text>
          {block.section_title && <Text type="secondary">{block.section_title}</Text>}
        </Space>
      }
      onCancel={onClose}
      footer={null}
      width="80%"
    >
      {tables.map((table, idx) => {
        const columns = table.headers.map((h, i) => ({
          title: h || `Колонка ${i + 1}`,
          dataIndex: `col_${i}`,
          key: `col_${i}`,
          ellipsis: true,
        }));

        const dataSource = table.rows.map((row, rowIdx) => {
          const record: Record<string, string> = { key: String(rowIdx) };
          table.headers.forEach((_, i) => {
            record[`col_${i}`] = row[i] ?? '';
          });
          return record;
        });

        return (
          <div key={idx} style={{ marginBottom: idx < tables.length - 1 ? 24 : 0 }}>
            {table.sectionContext && (
              <Title level={5} style={{ marginBottom: 8 }}>{table.sectionContext}</Title>
            )}
            <Table
              dataSource={dataSource}
              columns={columns}
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              bordered
            />
          </div>
        );
      })}
      {tables.length === 0 && (
        <Text type="secondary">Не удалось распарсить таблицу</Text>
      )}
    </Modal>
  );
}
