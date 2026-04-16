import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Typography, Tabs, Table, Button, Space, Modal, Form, Input, Popconfirm, App } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useProjects } from '../hooks/useProjects.ts';
import type { DbProject } from '../types/database.ts';
import FsnbTab from '../components/admin/FsnbTab.tsx';
import UsersTab from '../components/admin/UsersTab.tsx';
import AppHeader from '../components/layout/AppHeader.tsx';

const { Title } = Typography;

function ProjectsTab() {
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DbProject | null>(null);
  const [form] = Form.useForm();

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: DbProject) {
    setEditing(record);
    form.setFieldsValue({ name: record.name, code: record.code, description: record.description });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateProject(editing.id, values);
        message.success('Объект обновлён');
      } else {
        await createProject(values);
        message.success('Объект создан');
      }
      setModalOpen(false);
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      message.success('Объект удалён');
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  const columns = [
    { title: '№', key: 'rowNum', width: 50, render: (_: unknown, __: unknown, i: number) => i + 1 },
    { title: 'Название', dataIndex: 'name', key: 'name' },
    { title: 'Код', dataIndex: 'code', key: 'code', width: 120, render: (v: string | null) => v || '—' },
    { title: 'Описание', dataIndex: 'description', key: 'description', render: (v: string | null) => v || '—' },
    {
      title: 'Дата', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => new Date(v).toLocaleString('ru-RU'),
    },
    {
      title: 'Действия', key: 'actions', width: 120,
      render: (_: unknown, record: DbProject) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Удалить объект?" onConfirm={() => void handleDelete(record.id)} okText="Да" cancelText="Нет">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить объект</Button>
      </Space>
      <Table
        dataSource={projects.map(p => ({ ...p, key: p.id }))}
        columns={columns}
        size="small"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'Объекты не созданы' }}
      />
      <Modal
        title={editing ? 'Редактировать объект' : 'Новый объект'}
        open={modalOpen}
        onOk={() => void handleSave()}
        onCancel={() => setModalOpen(false)}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Код (краткий)">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'projects';

  const items = [
    { key: 'projects', label: 'Объекты', children: <ProjectsTab /> },
    { key: 'fsnb', label: 'Справочники ФСНБ', children: <FsnbTab /> },
    { key: 'users', label: 'Пользователи', children: <UsersTab /> },
  ];

  return (
    <>
      <AppHeader />
      <div style={{ padding: 24 }}>
        <Title level={3} style={{ marginBottom: 16 }}>Администрирование</Title>
        <Tabs items={items} activeKey={activeTab} onChange={(key) => setSearchParams({ tab: key })} />
      </div>
    </>
  );
}
