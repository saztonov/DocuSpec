import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Typography, Menu, App as AntApp } from 'antd';
import { FileSearchOutlined, ProfileOutlined } from '@ant-design/icons';
import ruRU from 'antd/locale/ru_RU';
import HomePage from './pages/HomePage.tsx';
import DocumentPage from './pages/DocumentPage.tsx';
import StatementsPage from './pages/StatementsPage.tsx';
import StatementViewPage from './pages/StatementViewPage.tsx';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = location.pathname.startsWith('/statements') ? '/statements' : '/';

  const menuItems = [
    {
      key: '/',
      icon: <FileSearchOutlined />,
      label: 'Распознавание',
    },
    {
      key: '/statements',
      icon: <ProfileOutlined />,
      label: 'Ведомости',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#001529',
          padding: '0 24px',
        }}
      >
        <Title level={3} style={{ color: '#fff', margin: 0, cursor: 'pointer' }} onClick={() => navigate('/')}>
          DocuSpec
        </Title>
      </Header>
      <Layout>
        <Content style={{ padding: '24px', width: '100%' }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/doc/:id" element={<DocumentPage />} />
            <Route path="/statements" element={<StatementsPage />} />
            <Route path="/statements/:id" element={<StatementViewPage />} />
          </Routes>
        </Content>
        <Sider
          width={200}
          collapsible
          collapsedWidth={60}
          theme="light"
          style={{ borderLeft: '1px solid #f0f0f0' }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={ruRU}>
      <AntApp>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
