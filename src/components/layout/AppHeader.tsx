import { useMemo, useState } from 'react';
import { Typography, Drawer, Menu, Button, Modal, Form, Input, App, Space, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  MenuOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  SettingOutlined,
  FileTextOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const { Text } = Typography;

interface ChangePasswordValues {
  password: string;
  password2: string;
}

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut, updateOwnPassword } = useAuth();
  const { message } = App.useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdForm] = Form.useForm<ChangePasswordValues>();

  async function handleChangePassword() {
    try {
      const v = await pwdForm.validateFields();
      if (v.password !== v.password2) {
        message.error('Пароли не совпадают');
        return;
      }
      setPwdSaving(true);
      await updateOwnPassword(v.password);
      message.success('Пароль обновлён');
      pwdForm.resetFields();
      setPwdOpen(false);
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  const isAdmin = profile?.role === 'admin';

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith('/admin')) return '/admin';
    if (location.pathname.startsWith('/references')) return '/references';
    return '/';
  }, [location.pathname]);

  const navItems: MenuProps['items'] = [
    { key: '/', label: 'Расценки', icon: <FileTextOutlined /> },
    { key: '/references', label: 'Справочники', icon: <DatabaseOutlined /> },
    ...(isAdmin
      ? [{ key: '/admin', label: 'Администрирование', icon: <SettingOutlined /> }]
      : []),
  ];

  const actionItems: MenuProps['items'] = [
    { key: 'pwd', label: 'Сменить пароль', icon: <KeyOutlined /> },
    { key: 'logout', label: 'Выйти', icon: <LogoutOutlined /> },
  ];

  function handleNavClick({ key }: { key: string }) {
    setDrawerOpen(false);
    navigate(key);
  }

  function handleActionClick({ key }: { key: string }) {
    setDrawerOpen(false);
    if (key === 'pwd') {
      setPwdOpen(true);
    } else if (key === 'logout') {
      void handleSignOut();
    }
  }

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
        onClick={() => setDrawerOpen(true)}
        aria-label="Открыть меню"
      />

      <Text
        strong
        style={{ fontSize: 18, cursor: 'pointer', whiteSpace: 'nowrap' }}
        onClick={() => navigate('/')}
      >
        DocuSpec
      </Text>

      <div style={{ flex: 1 }} />

      <Drawer
        placement="left"
        width={280}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
        title="DocuSpec"
      >
        {profile && (
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <UserOutlined style={{ fontSize: 16, color: '#888' }} />
            <Space size={6} style={{ flex: 1, minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.full_name || profile.email}
              </span>
              {isAdmin && <Tag color="gold" style={{ margin: 0 }}>admin</Tag>}
            </Space>
          </div>
        )}

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={navItems}
          onClick={handleNavClick}
          style={{ borderInlineEnd: 'none' }}
        />

        {profile && (
          <>
            <div style={{ borderTop: '1px solid #f0f0f0' }} />
            <Menu
              mode="inline"
              selectable={false}
              items={actionItems}
              onClick={handleActionClick}
              style={{ borderInlineEnd: 'none' }}
            />
          </>
        )}
      </Drawer>

      <Modal
        title="Смена пароля"
        open={pwdOpen}
        onOk={() => void handleChangePassword()}
        onCancel={() => setPwdOpen(false)}
        confirmLoading={pwdSaving}
        okText="Сохранить"
        cancelText="Отмена"
        destroyOnHidden
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item
            name="password"
            label="Новый пароль"
            rules={[
              { required: true, message: 'Введите пароль' },
              { min: 6, message: 'Минимум 6 символов' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="password2"
            label="Повторите пароль"
            rules={[{ required: true, message: 'Повторите пароль' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
