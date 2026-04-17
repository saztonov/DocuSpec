import { useEffect, useState } from 'react';
import { Tabs, Form, Input, Button, Typography, App, Card } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const { Title, Text } = Typography;

interface LoginValues {
  email: string;
  password: string;
}

interface RegisterValues {
  email: string;
  password: string;
  password2: string;
}

export default function LoginPage() {
  const { signIn, signUp, session, profile, loading, profileLoading } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [loginForm] = Form.useForm<LoginValues>();
  const [registerForm] = Form.useForm<RegisterValues>();

  const fromPath = (location.state as { from?: string } | null)?.from ?? '/';

  // Если сессия уже восстановлена (например, после hard-reload нас не туда закинуло) —
  // уходим на целевую страницу сами.
  useEffect(() => {
    if (!loading && !profileLoading && session && profile) {
      navigate(fromPath, { replace: true });
    }
  }, [loading, profileLoading, session, profile, fromPath, navigate]);

  async function handleLogin(values: LoginValues) {
    setLoginLoading(true);
    try {
      await signIn(values.email.trim(), values.password);
      message.success('Вход выполнен');
      navigate(fromPath, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка входа';
      message.error(translateAuthError(msg));
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(values: RegisterValues) {
    if (values.password !== values.password2) {
      message.error('Пароли не совпадают');
      return;
    }
    setRegisterLoading(true);
    try {
      await signUp(values.email.trim(), values.password);
      message.success('Заявка на регистрацию принята. Ожидайте активации администратором.');
      registerForm.resetFields();
      setActiveTab('login');
      loginForm.setFieldValue('email', values.email.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка регистрации';
      message.error(translateAuthError(msg));
    } finally {
      setRegisterLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        padding: 16,
      }}
    >
      <Card style={{ width: 420, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ marginBottom: 4 }}>DocuSpec</Title>
          <Text type="secondary">Авторизация</Text>
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'login' | 'register')}
          centered
          items={[
            {
              key: 'login',
              label: 'Вход',
              children: (
                <Form form={loginForm} layout="vertical" onFinish={(v) => void handleLogin(v)}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Введите email' },
                      { type: 'email', message: 'Некорректный email' },
                    ]}
                  >
                    <Input autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="Пароль"
                    rules={[{ required: true, message: 'Введите пароль' }]}
                  >
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loginLoading}>
                    Войти
                  </Button>
                </Form>
              ),
            },
            {
              key: 'register',
              label: 'Регистрация',
              children: (
                <Form form={registerForm} layout="vertical" onFinish={(v) => void handleRegister(v)}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Введите email' },
                      { type: 'email', message: 'Некорректный email' },
                    ]}
                  >
                    <Input autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="Пароль"
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
                  <Button type="primary" htmlType="submit" block loading={registerLoading}>
                    Зарегистрироваться
                  </Button>
                  <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
                    После регистрации учётная запись ожидает активации администратором.
                  </Text>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function translateAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Неверный email или пароль';
  if (m.includes('user already registered')) return 'Пользователь с таким email уже зарегистрирован';
  if (m.includes('email rate limit')) return 'Слишком много попыток. Попробуйте позже';
  if (m.includes('password should be at least')) return 'Пароль слишком короткий';
  return raw;
}
