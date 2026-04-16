import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Layout, App as AntApp } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import AdminPage from './pages/AdminPage.tsx';
import PricesPage from './pages/PricesPage.tsx';
import LoginPage from './pages/LoginPage.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import RequireAuth from './components/auth/RequireAuth.tsx';

const { Content } = Layout;

function AppLayout() {
  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Content>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <PricesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth requireAdmin>
                <AdminPage />
              </RequireAuth>
            }
          />
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
          <AuthProvider>
            <AppLayout />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
