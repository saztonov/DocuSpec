import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Typography, Menu, App as AntApp } from 'antd';
import { FileSearchOutlined, ProfileOutlined, SettingOutlined } from '@ant-design/icons';
import ruRU from 'antd/locale/ru_RU';
import HomePage from './pages/HomePage.tsx';
import DocumentPage from './pages/DocumentPage.tsx';
import StatementsPage from './pages/StatementsPage.tsx';
import StatementViewPage from './pages/StatementViewPage.tsx';
import AdminPage from './pages/AdminPage.tsx';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = location.pathname.startsWith('/statements')
    ? '/statements'
    : location.pathname.startsWith('/admin')
      ? '/admin'
      : '/';

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
    {
      key: '/admin',
      icon: <SettingOutlined />,
      label: 'Администрирование',
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
        <Sider
          width={200}
          collapsible
          collapsedWidth={60}
          theme="light"
          style={{ borderRight: '1px solid #f0f0f0' }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: '24px', width: '100%' }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/doc/:id" element={<DocumentPage />} />
            <Route path="/statements" element={<StatementsPage />} />
            <Route path="/statements/:id" element={<StatementViewPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Content>
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
