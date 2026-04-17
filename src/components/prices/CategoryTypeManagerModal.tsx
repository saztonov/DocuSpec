import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Breadcrumb,
  Button,
  Empty,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  categoryDeleteImpact,
  createCategory,
  createType,
  deleteCategory,
  deleteType,
  loadCategoriesWithCounts,
  loadTypesWithCounts,
  reorderCategories,
  reorderTypes,
  typeDeleteImpact,
  updateCategoryName,
  updateTypeName,
  type RateCategoryNode,
  type RateTypeNode,
} from '../../lib/importedRates';

type Mode =
  | { kind: 'categories' }
  | { kind: 'types'; category: RateCategoryNode };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Вызывается при любом изменении (создание/переименование/удаление/сортировка). */
  onChanged?: () => void;
}

interface RowProps {
  id: string;
  name: string;
  badge?: string;
  isEditing: boolean;
  editBuffer: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (v: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEnter?: () => void;
  saving?: boolean;
}

function SortableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid #f0f0f0',
    background: '#fff',
    marginBottom: 6,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: '#999', display: 'flex', alignItems: 'center' }}
        aria-label="Перетащить"
      >
        <HolderOutlined />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {props.isEditing ? (
          <Input
            value={props.editBuffer}
            autoFocus
            onChange={(e) => props.onChangeEdit(e.target.value)}
            onPressEnter={() => props.onSaveEdit()}
            disabled={props.saving}
          />
        ) : (
          <Space size={8}>
            <Typography.Text>{props.name}</Typography.Text>
            {props.badge && <Typography.Text type="secondary">{props.badge}</Typography.Text>}
          </Space>
        )}
      </div>

      {props.isEditing ? (
        <Space size={4}>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            loading={props.saving}
            onClick={() => props.onSaveEdit()}
          />
          <Button
            size="small"
            icon={<CloseOutlined />}
            onClick={() => props.onCancelEdit()}
            disabled={props.saving}
          />
        </Space>
      ) : (
        <Space size={4}>
          <Tooltip title="Переименовать">
            <Button size="small" icon={<EditOutlined />} onClick={() => props.onStartEdit()} />
          </Tooltip>
          <Popconfirm
            title="Удалить?"
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => props.onDelete()}
          >
            <Tooltip title="Удалить">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
          {props.onEnter && (
            <>
              <span style={{ width: 12 }} />
              <Tooltip title="Виды затрат">
                <Button
                  size="small"
                  type="text"
                  icon={<ArrowRightOutlined />}
                  onClick={() => props.onEnter?.()}
                />
              </Tooltip>
            </>
          )}
        </Space>
      )}
    </div>
  );
}

export default function CategoryTypeManagerModal({ open, onClose, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'categories' });
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<RateCategoryNode[]>([]);
  const [types, setTypes] = useState<RateTypeNode[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resetLocalUi = useCallback(() => {
    setEditingId(null);
    setEditBuffer('');
    setDraftOpen(false);
    setDraftName('');
  }, []);

  const refreshCategories = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadCategoriesWithCounts();
      setCategories(list);
    } catch (e: any) {
      message.error(e?.message ?? 'Не удалось загрузить категории');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTypes = useCallback(async (categoryId: string) => {
    setLoading(true);
    try {
      const list = await loadTypesWithCounts(categoryId);
      setTypes(list);
    } catch (e: any) {
      message.error(e?.message ?? 'Не удалось загрузить виды');
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка при открытии и при смене режима
  useEffect(() => {
    if (!open) return;
    resetLocalUi();
    if (mode.kind === 'categories') {
      void refreshCategories();
    } else {
      void refreshTypes(mode.category.id);
    }
  }, [open, mode, refreshCategories, refreshTypes, resetLocalUi]);

  const handleClose = useCallback(() => {
    setMode({ kind: 'categories' });
    onClose();
  }, [onClose]);

  // ── Drag end ─────────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(
    async (ev: DragEndEvent) => {
      const { active, over } = ev;
      if (!over || active.id === over.id) return;

      if (mode.kind === 'categories') {
        const oldIndex = categories.findIndex((c) => c.id === active.id);
        const newIndex = categories.findIndex((c) => c.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const prev = categories;
        const next = arrayMove(categories, oldIndex, newIndex).map((c, idx) => ({
          ...c,
          sort_order: idx + 1,
        }));
        setCategories(next);
        try {
          await reorderCategories(next.map((c) => c.id));
          onChanged?.();
        } catch (e: any) {
          setCategories(prev);
          message.error(e?.message ?? 'Не удалось сохранить порядок');
        }
      } else {
        const oldIndex = types.findIndex((t) => t.id === active.id);
        const newIndex = types.findIndex((t) => t.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const prev = types;
        const next = arrayMove(types, oldIndex, newIndex).map((t, idx) => ({
          ...t,
          sort_order: idx + 1,
        }));
        setTypes(next);
        try {
          await reorderTypes(mode.category.id, next.map((t) => t.id));
          onChanged?.();
        } catch (e: any) {
          setTypes(prev);
          message.error(e?.message ?? 'Не удалось сохранить порядок');
        }
      }
    },
    [mode, categories, types, onChanged],
  );

  // ── Создание ─────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const name = draftName.trim();
    if (!name) {
      message.warning('Введите название');
      return;
    }
    setSavingDraft(true);
    try {
      if (mode.kind === 'categories') {
        const created = await createCategory(name);
        setCategories((prev) => [...prev, { ...created, types_count: 0 }]);
      } else {
        const created = await createType(mode.category.id, name);
        setTypes((prev) => [...prev, { ...created, rates_count: 0 }]);
      }
      setDraftOpen(false);
      setDraftName('');
      onChanged?.();
    } catch (e: any) {
      message.error(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSavingDraft(false);
    }
  }, [mode, draftName, onChanged]);

  // ── Редактирование ───────────────────────────────────────────────────────
  const startEdit = useCallback((id: string, current: string) => {
    setEditingId(id);
    setEditBuffer(current);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditBuffer('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const name = editBuffer.trim();
    if (!name) {
      message.warning('Введите название');
      return;
    }
    setSavingEdit(true);
    try {
      if (mode.kind === 'categories') {
        const upd = await updateCategoryName(editingId, name);
        setCategories((prev) => prev.map((c) => (c.id === upd.id ? { ...c, name: upd.name } : c)));
      } else {
        const upd = await updateTypeName(editingId, name);
        setTypes((prev) => prev.map((t) => (t.id === upd.id ? { ...t, name: upd.name } : t)));
      }
      setEditingId(null);
      setEditBuffer('');
      onChanged?.();
    } catch (e: any) {
      message.error(e?.message ?? 'Не удалось сохранить');
    } finally {
      setSavingEdit(false);
    }
  }, [editingId, editBuffer, mode, onChanged]);

  // ── Удаление ─────────────────────────────────────────────────────────────
  const confirmAndDeleteCategory = useCallback(
    async (row: RateCategoryNode) => {
      let impact = { types: 0, rates: 0 };
      try {
        impact = await categoryDeleteImpact(row.id);
      } catch (e: any) {
        message.error(e?.message ?? 'Не удалось оценить удаление');
        return;
      }
      const hasChildren = impact.types > 0 || impact.rates > 0;
      const doDelete = async () => {
        try {
          await deleteCategory(row.id);
          setCategories((prev) => prev.filter((c) => c.id !== row.id));
          message.success(
            hasChildren
              ? `Удалено: категория, видов — ${impact.types}, расценок — ${impact.rates}`
              : 'Категория удалена',
          );
          onChanged?.();
        } catch (e: any) {
          message.error(e?.message ?? 'Не удалось удалить');
        }
      };
      if (hasChildren) {
        Modal.confirm({
          title: `Удалить категорию «${row.name}»?`,
          content: `Вместе с ней будет удалено видов — ${impact.types}, расценок — ${impact.rates}. Действие нельзя отменить.`,
          okText: 'Удалить',
          okButtonProps: { danger: true },
          cancelText: 'Отмена',
          onOk: doDelete,
        });
      } else {
        await doDelete();
      }
    },
    [onChanged],
  );

  const confirmAndDeleteType = useCallback(
    async (row: RateTypeNode) => {
      let impact = { rates: 0 };
      try {
        impact = await typeDeleteImpact(row.id);
      } catch (e: any) {
        message.error(e?.message ?? 'Не удалось оценить удаление');
        return;
      }
      const hasChildren = impact.rates > 0;
      const doDelete = async () => {
        try {
          await deleteType(row.id);
          setTypes((prev) => prev.filter((t) => t.id !== row.id));
          message.success(
            hasChildren ? `Удалено: вид, расценок — ${impact.rates}` : 'Вид удалён',
          );
          onChanged?.();
        } catch (e: any) {
          message.error(e?.message ?? 'Не удалось удалить');
        }
      };
      if (hasChildren) {
        Modal.confirm({
          title: `Удалить вид «${row.name}»?`,
          content: `Вместе с ним будет удалено расценок — ${impact.rates}. Действие нельзя отменить.`,
          okText: 'Удалить',
          okButtonProps: { danger: true },
          cancelText: 'Отмена',
          onOk: doDelete,
        });
      } else {
        await doDelete();
      }
    },
    [onChanged],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  const title = useMemo(() => {
    if (mode.kind === 'categories') return 'Категории затрат';
    return (
      <Space size={8}>
        <Button
          size="small"
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => setMode({ kind: 'categories' })}
        >
          Назад
        </Button>
        <Breadcrumb
          items={[{ title: 'Категории' }, { title: mode.category.name }]}
        />
      </Space>
    );
  }, [mode]);

  const addButtonLabel =
    mode.kind === 'categories' ? '+ Добавить категорию' : '+ Добавить вид';

  const ids = mode.kind === 'categories' ? categories.map((c) => c.id) : types.map((t) => t.id);

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {!draftOpen ? (
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setDraftOpen(true);
              setDraftName('');
            }}
          >
            {addButtonLabel}
          </Button>
        ) : (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={draftName}
              autoFocus
              placeholder={mode.kind === 'categories' ? 'Название категории' : 'Название вида'}
              onChange={(e) => setDraftName(e.target.value)}
              onPressEnter={() => void handleCreate()}
              disabled={savingDraft}
            />
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={savingDraft}
              onClick={() => void handleCreate()}
            >
              Сохранить
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={() => {
                setDraftOpen(false);
                setDraftName('');
              }}
              disabled={savingDraft}
            />
          </Space.Compact>
        )}

        <Spin spinning={loading}>
          {mode.kind === 'categories' ? (
            categories.length === 0 && !loading ? (
              <Empty description="Нет категорий" />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <div>
                    {categories.map((c) => (
                      <SortableRow
                        key={c.id}
                        id={c.id}
                        name={c.name}
                        badge={`видов: ${c.types_count}`}
                        isEditing={editingId === c.id}
                        editBuffer={editBuffer}
                        saving={savingEdit && editingId === c.id}
                        onStartEdit={() => startEdit(c.id, c.name)}
                        onCancelEdit={cancelEdit}
                        onChangeEdit={setEditBuffer}
                        onSaveEdit={() => void saveEdit()}
                        onDelete={() => void confirmAndDeleteCategory(c)}
                        onEnter={() => setMode({ kind: 'types', category: c })}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )
          ) : types.length === 0 && !loading ? (
            <Empty description="Нет видов затрат" />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div>
                  {types.map((t) => (
                    <SortableRow
                      key={t.id}
                      id={t.id}
                      name={t.name}
                      badge={`расценок: ${t.rates_count}`}
                      isEditing={editingId === t.id}
                      editBuffer={editBuffer}
                      saving={savingEdit && editingId === t.id}
                      onStartEdit={() => startEdit(t.id, t.name)}
                      onCancelEdit={cancelEdit}
                      onChangeEdit={setEditBuffer}
                      onSaveEdit={() => void saveEdit()}
                      onDelete={() => void confirmAndDeleteType(t)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Spin>
      </Space>
    </Modal>
  );
}
