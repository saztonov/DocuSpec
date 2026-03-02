import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Typography, Table, Space, Button, Tag, App, Popconfirm, Collapse } from 'antd';
import { DeleteOutlined, EyeOutlined, FolderOutlined, BookOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase.ts';
import type { DbStatement, DbProject, DbSection } from '../types/database.ts';

const { Title, Text } = Typography;

interface StatementWithRefs extends DbStatement {
  projects: DbProject | null;
  sections: DbSection | null;
}

interface SectionGroup {
  section: DbSection | null;
  statements: StatementWithRefs[];
}

interface ProjectGroup {
  project: DbProject | null;
  sectionGroups: SectionGroup[];
}

function groupStatements(data: StatementWithRefs[]): ProjectGroup[] {
  const projectMap = new Map<string, { project: DbProject | null; items: StatementWithRefs[] }>();

  for (const s of data) {
    const key = s.project_id ?? '__none__';
    if (!projectMap.has(key)) {
      projectMap.set(key, { project: s.projects, items: [] });
    }
    projectMap.get(key)!.items.push(s);
  }

  const groups: ProjectGroup[] = [];

  for (const [key, { project, items }] of projectMap) {
    const sectionMap = new Map<string, { section: DbSection | null; statements: StatementWithRefs[] }>();
    for (const s of items) {
      const sKey = s.section_id ?? '__none__';
      if (!sectionMap.has(sKey)) {
        sectionMap.set(sKey, { section: s.sections, statements: [] });
      }
      sectionMap.get(sKey)!.statements.push(s);
    }

    const sectionGroups: SectionGroup[] = [];
    for (const [, sg] of sectionMap) {
      sectionGroups.push(sg);
    }
    // Разделы с sort_order, «без раздела» в конец
    sectionGroups.sort((a, b) => {
      if (!a.section) return 1;
      if (!b.section) return -1;
      return a.section.sort_order - b.section.sort_order;
    });

    groups.push({ project, sectionGroups });
  }

  // «Без проекта» в конец
  groups.sort((a, b) => {
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.name.localeCompare(b.project.name);
  });

  return groups;
}

export default function StatementsPage() {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const { message } = App.useApp();

  async function loadStatements() {
    setLoading(true);
    const { data } = await supabase
      .from('statements')
      .select('*, projects(*), sections(*)')
      .order('created_at', { ascending: false });
    setGroups(groupStatements((data as StatementWithRefs[]) ?? []));
    setLoading(false);
  }

  useEffect(() => { void loadStatements(); }, []);

  async function handleDelete(id: string) {
    const { error } = await supabase.from('statements').delete().eq('id', id);
    if (error) {
      message.error('Ошибка удаления');
    } else {
      message.success('Ведомость удалена');
      void loadStatements();
    }
  }

  const stmtColumns = [
    {
      title: '№',
      key: 'rowNum',
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: StatementWithRefs) => (
        <Link to={`/statements/${record.id}`}>
          <Text strong>{name}</Text>
        </Link>
      ),
    },
    {
      title: 'Модель',
      dataIndex: 'model_used',
      key: 'model_used',
      width: 200,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: 'Позиций',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 90,
      render: (v: number | null) => v ?? '-',
    },
    {
      title: 'Дата',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('ru-RU'),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: StatementWithRefs) => (
        <Space>
          <Link to={`/statements/${record.id}`}>
            <Button size="small" icon={<EyeOutlined />} />
          </Link>
          <Popconfirm
            title="Удалить ведомость?"
            onConfirm={() => void handleDelete(record.id)}
            okText="Да"
            cancelText="Нет"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Title level={2}>Ведомости</Title>
        <Table loading columns={stmtColumns} dataSource={[]} size="small" />
      </Space>
    );
  }

  const totalStatements = groups.reduce((sum, g) => sum + g.sectionGroups.reduce((s2, sg) => s2 + sg.statements.length, 0), 0);

  if (totalStatements === 0) {
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Title level={2}>Ведомости</Title>
        <Table columns={stmtColumns} dataSource={[]} size="small" locale={{ emptyText: 'Ведомости ещё не созданы' }} />
      </Space>
    );
  }

  const projectItems = groups.map((pg, pi) => {
    const projectLabel = pg.project
      ? `${pg.project.code ? pg.project.code + ' — ' : ''}${pg.project.name}`
      : 'Без проекта';

    const stmtCount = pg.sectionGroups.reduce((s, sg) => s + sg.statements.length, 0);

    const sectionItems = pg.sectionGroups.map((sg, si) => {
      const sectionLabel = sg.section
        ? `${sg.section.code} — ${sg.section.name}`
        : 'Без раздела';

      return {
        key: `p${pi}-s${si}`,
        label: (
          <Space>
            <BookOutlined />
            <Text>{sectionLabel}</Text>
            <Tag>{sg.statements.length}</Tag>
          </Space>
        ),
        children: (
          <Table
            dataSource={sg.statements.map(s => ({ ...s, key: s.id }))}
            columns={stmtColumns}
            size="small"
            pagination={false}
          />
        ),
      };
    });

    return {
      key: `p${pi}`,
      label: (
        <Space>
          <FolderOutlined />
          <Text strong>{projectLabel}</Text>
          <Tag color="blue">{stmtCount}</Tag>
        </Space>
      ),
      children: (
        <Collapse
          items={sectionItems}
          defaultActiveKey={sectionItems.map(s => s.key)}
          ghost
        />
      ),
    };
  });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={2}>Ведомости</Title>
      <Collapse
        items={projectItems}
        defaultActiveKey={projectItems.map(p => p.key)}
      />
    </Space>
  );
}
