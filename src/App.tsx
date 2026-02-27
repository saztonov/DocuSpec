import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, Layout, Typography, App as AntApp } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import HomePage from './pages/HomePage.tsx';
import DocumentPage from './pages/DocumentPage.tsx';

const { Header, Content } = Layout;
const { Title } = Typography;

function AppLayout() {
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
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          DocuSpec
        </Title>
      </Header>
      <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/doc/:id" element={<DocumentPage />} />
        </Routes>
      </Content>
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
