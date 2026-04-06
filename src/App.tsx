import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Layout, App as AntApp } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import HomePage from './pages/HomePage.tsx';
import DocumentPage from './pages/DocumentPage.tsx';
import StatementsPage from './pages/StatementsPage.tsx';
import StatementViewPage from './pages/StatementViewPage.tsx';
import AdminPage from './pages/AdminPage.tsx';
import PricesPage from './pages/PricesPage.tsx';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

const EstimatePage = lazy(() => import('./pages/EstimatePage.tsx'));

// ── Lite-режим ──
// При LITE_MODE = true показывается только страница «Расценки» (/), все остальные пути редиректят на /.
// Чтобы вернуть полный набор страниц — поменять на false.
const LITE_MODE = true;

const { Content } = Layout;

function AppLayout() {
  if (LITE_MODE) {
    return (
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Content>
          <Routes>
            <Route path="/" element={<PricesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Content>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/doc/:id" element={<DocumentPage />} />
          <Route path="/doc/:docId/estimate/:estimateId" element={
            <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '100px auto' }} />}>
              <EstimatePage />
            </Suspense>
          } />
          <Route path="/statements" element={<StatementsPage />} />
          <Route path="/statements/:id" element={<StatementViewPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/prices" element={<PricesPage />} />
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
