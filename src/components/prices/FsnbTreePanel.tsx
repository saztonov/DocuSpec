import { useEffect, useState } from 'react';
import { Tree, Typography, Spin, Dropdown, Modal, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  DatabaseOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import {
  getTreeChildren,
  softDeleteNorm,
  softDeleteTable,
  softDeleteDivision,
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

export interface DeletedInfo {
  kind: 'norm' | 'table' | 'division';
  norm_id?: string;
  collection_id?: string | null;
  division_code?: string | null;
  table_code?: string | null;
}

interface Props {
  onSelect: (scope: ScopeSelection) => void;
  onDeleted?: (info: DeletedInfo) => void;
  /** Если true — дерево показывает только нормы с is_selected=true,
   *  а ветки без отобранных норм скрываются полностью. */
  onlySelected?: boolean;
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

export default function FsnbTreePanel({ onSelect, onDeleted, onlySelected = false }: Props) {
  const [treeData, setTreeData] = useState<ExtNode[]>(ROOT_NODES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Перезагружаем дерево при первой отрисовке и при каждом переключении
    // фильтра «Только отобранные»: меняется сама структура веток.
    setTreeData(ROOT_NODES);
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlySelected]);

  async function loadInitial() {
    setLoading(true);
    try {
      const [collections, tgGroups] = await Promise.all([
        getTreeChildren('collections-root', {}, onlySelected),
        getTreeChildren('tg-root', {}, onlySelected),
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

    const children = await getTreeChildren(node.level as TreeLevel, node.ctx, onlySelected);
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

  // Иммутабельно удаляет узел по ключу со всем поддеревом
  const removeNodeByKey = (nodes: ExtNode[], key: React.Key): ExtNode[] =>
    nodes
      .filter(n => n.key !== key)
      .map(n =>
        n.children && n.children.length > 0
          ? { ...n, children: removeNodeByKey(n.children as ExtNode[], key) }
          : n,
      );

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

  // ── Удаление ───────────────────────────────────────────────────
  const confirmDelete = (node: ExtNode) => {
    const label = String(node.title ?? '');
    if (node.level === 'norm') {
      Modal.confirm({
        title: 'Удалить расценку?',
        content: label,
        okText: 'Удалить',
        okButtonProps: { danger: true },
        cancelText: 'Отмена',
        onOk: async () => {
          try {
            if (!node.ctx.norm_id) return;
            const n = await softDeleteNorm(node.ctx.norm_id);
            setTreeData(prev => removeNodeByKey(prev, node.key));
            message.success(`Расценка удалена (${n})`);
            onDeleted?.({ kind: 'norm', norm_id: node.ctx.norm_id });
          } catch (e) {
            message.error(`Не удалось удалить: ${(e as Error).message}`);
          }
        },
      });
      return;
    }
    if (node.level === 'table') {
      Modal.confirm({
        title: 'Удалить подраздел со всеми расценками?',
        content: label,
        okText: 'Удалить',
        okButtonProps: { danger: true },
        cancelText: 'Отмена',
        onOk: async () => {
          try {
            const { collection_id, division_code, table_code } = node.ctx;
            if (!collection_id || !division_code || !table_code) return;
            const n = await softDeleteTable(collection_id, division_code, table_code);
            setTreeData(prev => removeNodeByKey(prev, node.key));
            message.success(`Удалено расценок: ${n}`);
            onDeleted?.({
              kind: 'table',
              collection_id,
              division_code,
              table_code,
            });
          } catch (e) {
            message.error(`Не удалось удалить: ${(e as Error).message}`);
          }
        },
      });
      return;
    }
    if (node.level === 'division') {
      Modal.confirm({
        title: 'Удалить раздел со всеми подразделами и расценками?',
        content: label,
        okText: 'Удалить',
        okButtonProps: { danger: true },
        cancelText: 'Отмена',
        onOk: async () => {
          try {
            const { collection_id, division_code } = node.ctx;
            if (!collection_id || !division_code) return;
            const n = await softDeleteDivision(collection_id, division_code);
            setTreeData(prev => removeNodeByKey(prev, node.key));
            message.success(`Удалено расценок: ${n}`);
            onDeleted?.({ kind: 'division', collection_id, division_code });
          } catch (e) {
            message.error(`Не удалось удалить: ${(e as Error).message}`);
          }
        },
      });
    }
  };

  const menuItemsFor = (node: ExtNode): MenuProps['items'] => {
    if (node.level === 'norm') {
      return [{ key: 'del', danger: true, label: 'Удалить расценку' }];
    }
    if (node.level === 'table') {
      return [{ key: 'del', danger: true, label: 'Удалить подраздел' }];
    }
    if (node.level === 'division') {
      return [{ key: 'del', danger: true, label: 'Удалить раздел' }];
    }
    return [];
  };

  const titleRender = (nodeData: DataNode) => {
    const node = nodeData as ExtNode;
    const items = menuItemsFor(node);
    const title = <span>{node.title as React.ReactNode}</span>;
    if (!items || items.length === 0) {
      return title;
    }
    return (
      <Dropdown
        menu={{
          items,
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation();
            if (key === 'del') confirmDelete(node);
          },
        }}
        trigger={['contextMenu']}
      >
        {title}
      </Dropdown>
    );
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
        titleRender={titleRender}
        defaultExpandedKeys={['root:collections']}
      />
    </div>
  );
}
