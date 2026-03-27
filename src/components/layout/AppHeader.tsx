import { Button, Typography } from 'antd';
import { MenuOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

interface AppHeaderProps {
  onMenuClick: () => void;
  docName?: string;
}

export default function AppHeader({ onMenuClick, docName }: AppHeaderProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        gap: 12,
      }}
    >
      <Button
        type="text"
        icon={<MenuOutlined />}
        onClick={onMenuClick}
        style={{ fontSize: 18, width: 40, height: 40 }}
      />

      <Text
        strong
        style={{ fontSize: 18, cursor: 'pointer', whiteSpace: 'nowrap' }}
        onClick={() => navigate('/')}
      >
        DocuSpec
      </Text>

      {docName && (
        <>
          <div style={{ width: 1, height: 20, background: '#e8e8e8', flexShrink: 0 }} />
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            size="small"
            onClick={() => navigate('/')}
            style={{ color: '#8c8c8c' }}
          />
          <Text
            type="secondary"
            ellipsis
            style={{ fontSize: 14, minWidth: 0 }}
          >
            {docName}
          </Text>
        </>
      )}
    </div>
  );
}
