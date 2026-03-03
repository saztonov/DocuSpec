import { useState } from 'react';
import { Typography, Tabs, Table, Button, Space, Modal, Form, Input, InputNumber, Popconfirm, App, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UndoOutlined } from '@ant-design/icons';
import { useProjects } from '../hooks/useProjects.ts';
import { useSections } from '../hooks/useSections.ts';
import { usePrompts } from '../hooks/usePrompts.ts';
import type { DbProject, DbSection, DbLlmPrompt } from '../types/database.ts';

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

function SectionsTab() {
  const { sections, loading, createSection, updateSection, deleteSection } = useSections();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DbSection | null>(null);
  const [form] = Form.useForm();

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: DbSection) {
    setEditing(record);
    form.setFieldsValue({ code: record.code, name: record.name, sort_order: record.sort_order });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateSection(editing.id, values);
        message.success('Раздел обновлён');
      } else {
        await createSection(values);
        message.success('Раздел создан');
      }
      setModalOpen(false);
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSection(id);
      message.success('Раздел удалён');
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  const columns = [
    { title: '№', key: 'rowNum', width: 50, render: (_: unknown, __: unknown, i: number) => i + 1 },
    { title: 'Код', dataIndex: 'code', key: 'code', width: 100 },
    { title: 'Название', dataIndex: 'name', key: 'name' },
    { title: 'Порядок', dataIndex: 'sort_order', key: 'sort_order', width: 100 },
    {
      title: 'Действия', key: 'actions', width: 120,
      render: (_: unknown, record: DbSection) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Удалить раздел?" onConfirm={() => void handleDelete(record.id)} okText="Да" cancelText="Нет">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить раздел</Button>
      </Space>
      <Table
        dataSource={sections.map(s => ({ ...s, key: s.id }))}
        columns={columns}
        size="small"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'Разделы не созданы' }}
      />
      <Modal
        title={editing ? 'Редактировать раздел' : 'Новый раздел'}
        open={modalOpen}
        onOk={() => void handleSave()}
        onCancel={() => setModalOpen(false)}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Код" rules={[{ required: true, message: 'Введите код' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Полное название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sort_order" label="Порядок сортировки">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── PromptsTab ──
function PromptsTab() {
  const { prompts, loading, updatePrompt, resetPrompt } = usePrompts();
  const { message } = App.useApp();
  const [editingPrompt, setEditingPrompt] = useState<DbLlmPrompt | null>(null);
  const [form] = Form.useForm();

  function openEdit(record: DbLlmPrompt) {
    setEditingPrompt(record);
    form.setFieldsValue({ name: record.name, description: record.description, system_prompt: record.system_prompt });
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      if (!editingPrompt) return;
      const { error } = await updatePrompt(editingPrompt.id, values);
      if (error) throw error;
      message.success('Промпт обновлён');
      setEditingPrompt(null);
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    }
  }

  async function handleReset(id: string) {
    const { error } = await resetPrompt(id);
    if (error) { message.error('Нет дефолтного промпта'); }
    else { message.success('Промпт сброшен к дефолту'); }
  }

  const columns = [
    { title: 'Ключ', dataIndex: 'key', key: 'key', width: 200, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'Название', dataIndex: 'name', key: 'name', width: 220 },
    { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string | null) => v ?? '—' },
    {
      title: 'Обновлён', dataIndex: 'updated_at', key: 'updated_at', width: 160,
      render: (v: string) => new Date(v).toLocaleString('ru-RU'),
    },
    {
      title: 'Действия', key: 'actions', width: 130,
      render: (_: unknown, record: DbLlmPrompt) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="Сбросить промпт к дефолту?"
            description="Все ваши правки будут потеряны."
            onConfirm={() => void handleReset(record.id)}
            okText="Да"
            cancelText="Нет"
            disabled={!record.default_system_prompt}
          >
            <Button size="small" icon={<UndoOutlined />} disabled={!record.default_system_prompt} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        dataSource={prompts.map(p => ({ ...p, key: p.id }))}
        columns={columns}
        size="small"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'Промпты не загружены' }}
      />
      <Modal
        title={`Редактировать промпт: ${editingPrompt?.name}`}
        open={!!editingPrompt}
        onOk={() => void handleSave()}
        onCancel={() => setEditingPrompt(null)}
        okText="Сохранить"
        cancelText="Отмена"
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Название">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="system_prompt" label="Системный промпт" rules={[{ required: true, message: 'Введите промпт' }]}>
            <Input.TextArea rows={22} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default function AdminPage() {
  const items = [
    { key: 'projects', label: 'Объекты', children: <ProjectsTab /> },
    { key: 'sections', label: 'Разделы', children: <SectionsTab /> },
    { key: 'prompts', label: 'Промпты LLM', children: <PromptsTab /> },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={2}>Администрирование</Title>
      <Tabs items={items} />
    </Space>
  );
}
