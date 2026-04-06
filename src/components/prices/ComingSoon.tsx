import { Empty, Typography } from 'antd';

interface ComingSoonProps {
  title?: string;
  description?: string;
}

export default function ComingSoon({
  title = 'Раздел в разработке',
  description = 'Этот раздел появится позже.',
}: ComingSoonProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 320,
      }}
    >
      <Empty
        description={
          <div>
            <Typography.Title level={5} style={{ marginBottom: 4 }}>
              {title}
            </Typography.Title>
            <Typography.Text type="secondary">{description}</Typography.Text>
          </div>
        }
      />
    </div>
  );
}
