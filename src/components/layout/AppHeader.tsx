import { Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

export default function AppHeader() {
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
      <Text
        strong
        style={{ fontSize: 18, cursor: 'pointer', whiteSpace: 'nowrap' }}
        onClick={() => navigate('/')}
      >
        DocuSpec
      </Text>
    </div>
  );
}
