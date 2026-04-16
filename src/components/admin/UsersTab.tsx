import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, Popconfirm, Tag, Switch, App, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UndoOutlined,
  CheckCircleOutlined, StopOutlined, KeyOutlined,
} from '@ant-design/icons';
import {
  loadUsers, updateUserProfile, setUserActive, softDeleteUser, restoreUser,
  createUserAsAdmin, sendPasswordReset,
} from '../../lib/users';
import type { UserProfile, UserRole } from '../../lib/users';
import { useAuth } from '../../hooks/useAuth';

interface CreateForm {
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
}

interface EditForm {
  full_name: string | null;
  role: UserRole;
}

export default function UsersTab() {
  const { profile: me } = useAuth();
  const { message, modal } = App.useApp();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm] = Form.useForm<CreateForm>();

  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm<EditForm>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadUsers(showDeleted);
      setUsers(list);
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [showDeleted, message]);

  useEffect(() => { void reload(); }, [reload]);

  function openCreate() {
    createForm.resetFields();
    createForm.setFieldsValue({ role: 'user' });
    setCreateOpen(true);
  }

  async function handleCreate() {
    try {
      const v = await createForm.validateFields();
      setCreateSaving(true);
      await createUserAsAdmin({
        email: v.email.trim(),
        password: v.password,
        full_name: v.full_name?.trim() || undefined,
        role: v.role,
      });
      message.success('Пользователь создан и активирован');
      setCreateOpen(false);
      await reload();
    } catch (err) {
      if (err instanceof Error) message.error(translateAuthError(err.message));
    } finally {
      setCreateSaving(false);
    }
  }

  function openEdit(u: UserProfile) {
    setEditing(u);
    editForm.setFieldsValue({ full_name: u.full_name, role: u.role });
  }

  async function handleEdit() {
    if (!editing) return;
    try {
      const v = await editForm.validateFields();
      setEditSaving(true);
      await updateUserProfile(editing.id, {
        full_name: v.full_name?.trim() || null,
        role: v.role,
      });
      message.success('Пользователь обновлён');
      setEditing(null);
      await reload();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(u: UserProfile) {
    try {
      await setUserActive(u.id, !u.is_active);
      message.success(u.is_active ? 'Деактивирован' : 'Активирован');
      await reload();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  async function handleDelete(u: UserProfile) {
    try {
      await softDeleteUser(u.id);
      message.success('Пользователь удалён');
      await reload();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  async function handleRestore(u: UserProfile) {
    try {
      await restoreUser(u.id);
      message.success('Пользователь восстановлен (не активирован)');
      await reload();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  function handleResetPassword(u: UserProfile) {
    modal.confirm({
      title: 'Отправить ссылку для сброса пароля?',
      content: `На адрес ${u.email} будет отправлено письмо со ссылкой для смены пароля.`,
      okText: 'Отправить',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await sendPasswordReset(u.email);
          message.success('Письмо отправлено');
        } catch (err) {
          if (err instanceof Error) message.error(err.message);
        }
      },
    });
  }

  const columns = useMemo(() => ([
    { title: '№', key: 'rowNum', width: 50, render: (_: unknown, __: unknown, i: number) => i + 1 },
    {
      title: 'Email', dataIndex: 'email', key: 'email',
      render: (v: string, r: UserProfile) => (
        <span>{v}{r.id === me?.id && <Tag color="blue" style={{ marginLeft: 8 }}>вы</Tag>}</span>
      ),
    },
    {
      title: 'ФИО', dataIndex: 'full_name', key: 'full_name',
      render: (v: string | null) => v || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Роль', dataIndex: 'role', key: 'role', width: 110,
      render: (v: UserRole) => v === 'admin'
        ? <Tag color="gold">admin</Tag>
        : <Tag>user</Tag>,
    },
    {
      title: 'Статус', key: 'status', width: 180,
      render: (_: unknown, r: UserProfile) => {
        if (r.is_deleted) return <Tag color="default">Удалён</Tag>;
        if (!r.is_active) return <Tag color="orange">Ожидает активации</Tag>;
        return <Tag color="green">Активен</Tag>;
      },
    },
    {
      title: 'Создан', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => new Date(v).toLocaleString('ru-RU'),
    },
    {
      title: 'Действия', key: 'actions', width: 240,
      render: (_: unknown, r: UserProfile) => {
        const isSelf = r.id === me?.id;
        if (r.is_deleted) {
          return (
            <Space>
              <Tooltip title="Восстановить">
                <Button size="small" icon={<UndoOutlined />} onClick={() => void handleRestore(r)} />
              </Tooltip>
            </Space>
          );
        }
        return (
          <Space>
            <Tooltip title={r.is_active ? 'Деактивировать' : 'Активировать'}>
              <Button
                size="small"
                icon={r.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
                onClick={() => void toggleActive(r)}
                disabled={isSelf}
              />
            </Tooltip>
            <Tooltip title="Редактировать">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
            </Tooltip>
            <Tooltip title="Сбросить пароль (письмо)">
              <Button size="small" icon={<KeyOutlined />} onClick={() => handleResetPassword(r)} />
            </Tooltip>
            <Popconfirm
              title="Удалить пользователя?"
              description="Учётка будет помечена удалённой. Запись в auth.users сохранится."
              onConfirm={() => void handleDelete(r)}
              okText="Да"
              cancelText="Нет"
              disabled={isSelf}
            >
              <Tooltip title={isSelf ? 'Нельзя удалить себя' : 'Удалить'}>
                <Button size="small" danger icon={<DeleteOutlined />} disabled={isSelf} />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ]), [me?.id]);

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Создать пользователя
        </Button>
        <Space style={{ marginLeft: 16 }}>
          <span>Показывать удалённых:</span>
          <Switch checked={showDeleted} onChange={setShowDeleted} />
        </Space>
      </Space>
      <Table
        dataSource={users.map(u => ({ ...u, key: u.id }))}
        columns={columns}
        size="small"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'Пользователей нет' }}
      />

      <Modal
        title="Новый пользователь"
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createSaving}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Введите email' },
              { type: 'email', message: 'Некорректный email' },
            ]}
          >
            <Input autoComplete="off" />
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
          <Form.Item name="full_name" label="ФИО">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'user', label: 'user' },
                { value: 'admin', label: 'admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? `Редактирование: ${editing.email}` : 'Редактирование'}
        open={!!editing}
        onOk={() => void handleEdit()}
        onCancel={() => setEditing(null)}
        confirmLoading={editSaving}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="full_name" label="ФИО">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'user', label: 'user' },
                { value: 'admin', label: 'admin' },
              ]}
              disabled={editing?.id === me?.id}
            />
          </Form.Item>
          {editing?.id === me?.id && (
            <span style={{ color: '#888', fontSize: 12 }}>
              Себе нельзя менять роль — попросите другого администратора.
            </span>
          )}
        </Form>
      </Modal>
    </>
  );
}

function translateAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('user already registered')) return 'Пользователь с таким email уже зарегистрирован';
  if (m.includes('password should be at least')) return 'Пароль слишком короткий';
  if (m.includes('email rate limit')) return 'Слишком много попыток. Попробуйте позже';
  return raw;
}
