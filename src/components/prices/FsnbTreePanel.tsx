import { useEffect, useState } from 'react';
import { Tree, Typography, Spin } from 'antd';
import {
  DatabaseOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import {
  getTreeChildren,
  type TreeLevel,
  type TreeNode,
} from '../../lib/fsnbExplorer';

export interface ScopeSelection {
  kind: 'norm' | 'tg' | 'tg-resource' | 'collection' | 'division' | 'table' | null;
  // Для фильтрации/контекста
  collection_id?: string | null;
  collection_code?: string | null;
  division_code?: string | null;
  table_code?: string | null;
  norm_id?: string;
  tg_id?: string;
  resource_id?: string;
  label?: string;
}

interface Props {
  onSelect: (scope: ScopeSelection) => void;
}

interface ExtNode extends DataNode {
  level: TreeLevel | 'norm' | 'tg-resource';
  ctx: {
    collection_id?: string | null;
    collection_code?: string | null;
    division_code?: string | null;
    table_code?: string | null;
    norm_id?: string;
    tg_id?: string;
    resource_id?: string;
  };
}

const ROOT_NODES: ExtNode[] = [
  {
    key: 'root:collections',
    title: 'Сборники',
    icon: <DatabaseOutlined />,
    level: 'collections-root',
    ctx: {},
  },
  {
    key: 'root:tg',
    title: 'Технологические группы',
    icon: <AppstoreOutlined />,
    level: 'tg-root',
    ctx: {},
  },
];

function toTreeNode(n: TreeNode): ExtNode {
  return {
    key: n.key,
    title: n.title,
    isLeaf: n.isLeaf,
    level: n.level,
    ctx: {
      collection_id: n.collection_id,
      collection_code: n.collection_code,
      division_code: n.division_code,
      table_code: n.table_code,
      norm_id: n.norm_id,
      tg_id: n.tg_id,
      resource_id: n.resource_id,
    },
  };
}

export default function FsnbTreePanel({ onSelect }: Props) {
  const [treeData, setTreeData] = useState<ExtNode[]>(ROOT_NODES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Сразу подгружаем корни (раскрываем оба)
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInitial() {
    setLoading(true);
    try {
      const [collections, tgGroups] = await Promise.all([
        getTreeChildren('collections-root'),
        getTreeChildren('tg-root'),
      ]);
      setTreeData([
        { ...ROOT_NODES[0], children: collections.map(toTreeNode) },
        { ...ROOT_NODES[1], children: tgGroups.map(toTreeNode) },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const onLoadData = async (node: ExtNode): Promise<void> => {
    if (node.children && node.children.length > 0) return;
    if (node.level === 'norm' || node.level === 'tg-resource') return;

    const children = await getTreeChildren(node.level as TreeLevel, node.ctx);
    const childNodes = children.map(toTreeNode);

    // Иммутабельно вставляем детей
    const insert = (nodes: ExtNode[]): ExtNode[] =>
      nodes.map(n => {
        if (n.key === node.key) {
          return { ...n, children: childNodes };
        }
        if (n.children && n.children.length > 0) {
          return { ...n, children: insert(n.children as ExtNode[]) };
        }
        return n;
      });

    setTreeData(prev => insert(prev));
  };

  const handleSelect = (_: unknown, info: { node: ExtNode }) => {
    const n = info.node;
    const label = String(n.title ?? '');
    switch (n.level) {
      case 'norm':
        onSelect({ kind: 'norm', norm_id: n.ctx.norm_id, label });
        break;
      case 'tg-resource':
        onSelect({
          kind: 'tg-resource',
          resource_id: n.ctx.resource_id,
          label,
        });
        break;
      case 'tg-group':
        onSelect({ kind: 'tg', tg_id: n.ctx.tg_id, label });
        break;
      case 'collection':
        onSelect({
          kind: 'collection',
          collection_id: n.ctx.collection_id,
          collection_code: n.ctx.collection_code,
          label,
        });
        break;
      case 'division':
        onSelect({
          kind: 'division',
          collection_id: n.ctx.collection_id,
          collection_code: n.ctx.collection_code,
          division_code: n.ctx.division_code,
          label,
        });
        break;
      case 'table':
        onSelect({
          kind: 'table',
          collection_id: n.ctx.collection_id,
          collection_code: n.ctx.collection_code,
          division_code: n.ctx.division_code,
          table_code: n.ctx.table_code,
          label,
        });
        break;
      default:
        onSelect({ kind: null });
    }
  };

  return (
    <div style={{ padding: 8, height: '100%', overflow: 'auto' }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Структура ФСНБ
      </Typography.Title>
      {loading && <Spin />}
      <Tree
        showIcon
        loadData={node => onLoadData(node as ExtNode)}
        treeData={treeData}
        onSelect={handleSelect}
        defaultExpandedKeys={['root:collections']}
      />
    </div>
  );
}
