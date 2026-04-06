import { useEffect, useState } from 'react';
import { Button, Checkbox, Popover, Space, Tag, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { FsnbCollectionInfo } from '../../lib/fsnbExplorer';

interface Props {
  collections: FsnbCollectionInfo[];
  enabledCodes: Set<string>;
  onChange: (codes: Set<string>) => void;
}

export default function FsnbCollectionsFilter({
  collections,
  enabledCodes,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [localCodes, setLocalCodes] = useState<Set<string>>(enabledCodes);

  useEffect(() => {
    setLocalCodes(enabledCodes);
  }, [enabledCodes]);

  const total = collections.length;
  const selected = localCodes.size;
  const allSelected = selected === total && total > 0;

  const toggle = (code: string) => {
    const next = new Set(localCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setLocalCodes(next);
    onChange(next);
  };

  const selectAll = () => {
    const next = new Set(collections.map(c => c.code));
    setLocalCodes(next);
    onChange(next);
  };

  const clearAll = () => {
    const next = new Set<string>();
    setLocalCodes(next);
    onChange(next);
  };

  const content = (
    <div style={{ maxWidth: 360, maxHeight: 420, overflow: 'auto' }}>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" onClick={selectAll}>
          Все
        </Button>
        <Button size="small" onClick={clearAll}>
          Снять
        </Button>
        <Typography.Text type="secondary">
          {selected} / {total}
        </Typography.Text>
      </Space>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {collections.map(c => (
          <Checkbox
            key={c.code}
            checked={localCodes.has(c.code)}
            onChange={() => toggle(c.code)}
          >
            <Typography.Text code style={{ marginRight: 4 }}>
              {c.code}
            </Typography.Text>
            {c.name}{' '}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ({c.record_count})
            </Typography.Text>
          </Checkbox>
        ))}
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      title="Сборники для поиска"
      content={content}
    >
      <Button icon={<SettingOutlined />}>
        Сборники{' '}
        {!allSelected && (
          <Tag color="blue" style={{ marginLeft: 6 }}>
            {selected}
          </Tag>
        )}
      </Button>
    </Popover>
  );
}
