import { useState } from 'react';
import { Typography, Dropdown, Button, Modal, Form, Input, App, Space, Tag } from 'antd';
import { UserOutlined, LogoutOutlined, KeyOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const { Text } = Typography;

interface ChangePasswordValues {
  password: string;
  password2: string;
}

export default function AppHeader() {
  const navigate = useNavigate();
  const { profile, signOut, updateOwnPassword } = useAuth();
  const { message } = App.useApp();
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

      <div style={{ flex: 1 }} />

      {isAdmin && (
        <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/admin')}>
          Администрирование
        </Button>
      )}

      {profile && (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'pwd', label: 'Сменить пароль', icon: <KeyOutlined />, onClick: () => setPwdOpen(true) },
              { type: 'divider' },
              { key: 'logout', label: 'Выйти', icon: <LogoutOutlined />, onClick: () => void handleSignOut() },
            ],
          }}
        >
          <Button type="text" icon={<UserOutlined />}>
            <Space size={6}>
              <span>{profile.full_name || profile.email}</span>
              {profile.role === 'admin' && <Tag color="gold" style={{ margin: 0 }}>admin</Tag>}
            </Space>
          </Button>
        </Dropdown>
      )}

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
