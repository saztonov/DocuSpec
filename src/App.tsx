import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Layout, App as AntApp } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import AdminPage from './pages/AdminPage.tsx';
import PricesPage from './pages/PricesPage.tsx';

const { Content } = Layout;

function AppLayout() {
  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Content>
        <Routes>
          <Route path="/" element={<PricesPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        token: {
          borderRadius: 8,
          fontSize: 14,
        },
        components: {
          Table: {
            headerBg: '#fafafa',
            borderRadius: 8,
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
