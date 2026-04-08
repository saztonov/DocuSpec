import { Button, Empty, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import DraftRateRow from './DraftRateRow';
import type { DraftRow } from '../../types/customRates';
import type { RateCategory, RateType } from '../../lib/importedRates';

interface Props {
  rows: DraftRow[];
  categories: RateCategory[];
  types: RateType[];
  saving: boolean;
  validCount: number;
  onUpdate: (rowId: string, patch: Partial<DraftRow>) => void;
  onRemove: (rowId: string) => void;
  onSaveAll: () => void;
}

export default function DraftBasketPanel({
  rows,
  categories,
  types,
  saving,
  validCount,
  onUpdate,
  onRemove,
  onSaveAll,
}: Props) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, minHeight: 0 }}>
        {rows.length === 0 ? (
          <div style={{ paddingTop: 32 }}>
            <Empty
              description={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Здесь будут расценки, которые вы добавите.<br />
                  Используйте быстрый поиск или чат с LLM.
                </Typography.Text>
              }
            />
          </div>
        ) : (
          rows.map((row) => (
            <DraftRateRow
              key={row.rowId}
              row={row}
              categories={categories}
              types={types}
              onUpdate={(patch) => onUpdate(row.rowId, patch)}
              onRemove={() => onRemove(row.rowId)}
            />
          ))
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: 12,
          borderTop: '1px solid #e8e8e8',
          background: '#fff',
        }}
      >
        <Button
          type="primary"
          icon={<SaveOutlined />}
          block
          size="large"
          loading={saving}
          disabled={rows.length === 0 || validCount === 0}
          onClick={onSaveAll}
        >
          Сохранить все в каталог{validCount > 0 ? ` (${validCount})` : ''}
        </Button>
        {rows.length > validCount && (
          <Typography.Text
            type="warning"
            style={{ display: 'block', textAlign: 'center', marginTop: 6, fontSize: 11 }}
          >
            {rows.length - validCount} строк с незаполненными полями
          </Typography.Text>
        )}
      </div>
    </div>
  );
}
