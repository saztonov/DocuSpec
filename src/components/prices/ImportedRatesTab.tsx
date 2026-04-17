import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Upload,
  Typography,
  message,
} from 'antd';
import {
  InboxOutlined,
  InfoCircleOutlined,
  UploadOutlined,
  ReloadOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  createCategory,
  createImportedRate,
  createType,
  deleteCategory,
  deleteImportedRate,
  deleteType,
  importRates,
  loadCategories,
  loadCategoriesWithCounts,
  loadRates,
  loadRatesByType,
  loadTypes,
  loadTypesWithCounts,
  parseRatesXlsx,
  updateCategoryName,
  updateImportedRate,
  updateTypeName,
  type ParsedRate,
  type RateCategory,
  type RateCategoryNode,
  type RateKind,
  type RateRow,
  type RateType,
  type RateTypeNode,
} from '../../lib/importedRates';
import { useMaterialsCatalog } from '../../hooks/useMaterialsCatalog';
import RateMaterialsPanel from './RateMaterialsPanel';
import CategoryTypeManagerModal from './CategoryTypeManagerModal';

type CategoryRow = {
  rowKind: 'category';
  key: string;
  id: string;
  name: string;
  types_count: number;
  isDraft?: boolean;
};

type TypeRow = {
  rowKind: 'type';
  key: string;
  id: string;
  category_id: string;
  name: string;
  rates_count: number;
  isDraft?: boolean;
};

type RateLeafRow = {
  rowKind: 'rate';
  key: string;
  id: string;
  type_id: string;
  work_name: string;
  unit: string | null;
  price_contract: number | null;
  price_own: number | null;
  rate_type: RateKind;
  materials_count: number;
  isDraft?: boolean;
};

type EditBuffer = {
  work_name: string;
  unit: string | null;
  price_contract: number | null;
  price_own: number | null;
  rate_type: RateKind;
};

const priceFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPrice(v: number | null): string {
  return v === null || v === undefined ? '—' : priceFmt.format(v);
}

function genDraftId(): string {
  return `draft-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export default function ImportedRatesTab() {
  const [msg, msgCtx] = message.useMessage();

  // Импорт
  const [parsed, setParsed] = useState<ParsedRate[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [importing, setImporting] = useState(false);

  // Фильтры
  const [categories, setCategories] = useState<RateCategory[]>([]);
  const [types, setTypes] = useState<RateType[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Дерево: верхний уровень (категории) + кэш видов и расценок
  const [treeCategories, setTreeCategories] = useState<RateCategoryNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [typesByCategory, setTypesByCategory] = useState<Record<string, RateTypeNode[]>>({});
  const [ratesByType, setRatesByType] = useState<Record<string, RateLeafRow[]>>({});
  const [loadingCategoryIds, setLoadingCategoryIds] = useState<Set<string>>(new Set());
  const [loadingTypeIds, setLoadingTypeIds] = useState<Set<string>>(new Set());

  // Плоский режим (активен при непустом тексте поиска)
  const [flatRows, setFlatRows] = useState<RateRow[]>([]);
  const [flatLoading, setFlatLoading] = useState(false);

  // Редактирование расценок
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<EditBuffer | null>(null);
  const [savingRateId, setSavingRateId] = useState<string | null>(null);
  const [deletingRateId, setDeletingRateId] = useState<string | null>(null);

  // Редактирование категорий
  const [draftCategories, setDraftCategories] = useState<CategoryRow[]>([]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState<string>('');
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);

  // Редактирование видов
  const [draftTypesByCategory, setDraftTypesByCategory] = useState<Record<string, TypeRow[]>>({});
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState<string>('');
  const [savingTypeId, setSavingTypeId] = useState<string | null>(null);

  // Раскрытие расценок + сигнал на добавление материала
  const [expandedRateKeys, setExpandedRateKeys] = useState<string[]>([]);
  const [addMaterialForRateId, setAddMaterialForRateId] = useState<string | null>(null);

  // Менеджер категорий/видов
  const [managerOpen, setManagerOpen] = useState(false);

  const flatMode = appliedSearch.trim().length > 0;

  const materialsCatalog = useMaterialsCatalog();

  const refreshCategories = useCallback(async () => {
    try {
      setCategories(await loadCategories());
    } catch (e: any) {
      msg.error(`Ошибка загрузки категорий: ${e.message ?? e}`);
    }
  }, [msg]);

  const refreshTypes = useCallback(
    async (catId: string | null) => {
      try {
        setTypes(await loadTypes(catId));
      } catch (e: any) {
        msg.error(`Ошибка загрузки видов затрат: ${e.message ?? e}`);
      }
    },
    [msg],
  );

  const refreshTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      setTreeCategories(await loadCategoriesWithCounts());
      setTypesByCategory({});
      setRatesByType({});
    } catch (e: any) {
      msg.error(`Ошибка загрузки дерева: ${e.message ?? e}`);
    } finally {
      setTreeLoading(false);
    }
  }, [msg]);

  const refreshFlat = useCallback(async () => {
    setFlatLoading(true);
    try {
      const res = await loadRates({ categoryId, typeId, search: appliedSearch });
      setFlatRows(res.rows);
    } catch (e: any) {
      msg.error(`Ошибка загрузки расценок: ${e.message ?? e}`);
    } finally {
      setFlatLoading(false);
    }
  }, [categoryId, typeId, appliedSearch, msg]);

  useEffect(() => {
    refreshCategories();
    refreshTypes(null);
    refreshTree();
  }, [refreshCategories, refreshTypes, refreshTree]);

  useEffect(() => {
    if (flatMode) refreshFlat();
  }, [flatMode, refreshFlat]);

  const handleFile: UploadProps['beforeUpload'] = async (file) => {
    try {
      const data = await parseRatesXlsx(file as File);
      setParsed(data);
      setFileName(file.name);
      msg.success(`Распознано строк: ${data.length}`);
    } catch (e: any) {
      msg.error(`Ошибка парсинга: ${e.message ?? e}`);
    }
    return false;
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await importRates(parsed);
      msg.success(
        `Импортировано: категорий ${res.categories}, видов ${res.types}, расценок ${res.rates}`,
      );
      setParsed(null);
      setFileName('');
      await refreshCategories();
      await refreshTypes(categoryId);
      await refreshTree();
      if (flatMode) await refreshFlat();
    } catch (e: any) {
      msg.error(`Ошибка импорта: ${e.message ?? e}`);
    } finally {
      setImporting(false);
    }
  };

  const handleCategoryChange = async (value: string | null) => {
    setCategoryId(value ?? null);
    setTypeId(null);
    await refreshTypes(value ?? null);
  };

  const handleTypeChange = (value: string | null) => {
    setTypeId(value ?? null);
  };

  const handleReset = async () => {
    setCategoryId(null);
    setTypeId(null);
    setSearch('');
    setAppliedSearch('');
    await refreshTypes(null);
  };

  const ensureTypesLoaded = useCallback(
    async (catId: string) => {
      if (typesByCategory[catId]) return;
      setLoadingCategoryIds((s) => new Set(s).add(catId));
      try {
        const list = await loadTypesWithCounts(catId);
        setTypesByCategory((m) => ({ ...m, [catId]: list }));
      } catch (e: any) {
        msg.error(`Ошибка загрузки видов: ${e.message ?? e}`);
      } finally {
        setLoadingCategoryIds((s) => {
          const next = new Set(s);
          next.delete(catId);
          return next;
        });
      }
    },
    [typesByCategory, msg],
  );

  const ensureRatesLoaded = useCallback(
    async (tId: string) => {
      if (ratesByType[tId]) return;
      setLoadingTypeIds((s) => new Set(s).add(tId));
      try {
        const list = await loadRatesByType(tId);
        const leafRows: RateLeafRow[] = list.map((r) => ({
          rowKind: 'rate',
          key: `rate-${r.id}`,
          id: r.id,
          type_id: r.type_id,
          work_name: r.work_name,
          unit: r.unit,
          price_contract: r.price_contract,
          price_own: r.price_own,
          rate_type: r.rate_type,
          materials_count: r.materials_count ?? 0,
        }));
        setRatesByType((m) => ({ ...m, [tId]: leafRows }));
      } catch (e: any) {
        msg.error(`Ошибка загрузки расценок: ${e.message ?? e}`);
      } finally {
        setLoadingTypeIds((s) => {
          const next = new Set(s);
          next.delete(tId);
          return next;
        });
      }
    },
    [ratesByType, msg],
  );

  const startEdit = (row: RateLeafRow) => {
    setEditingRateId(row.id);
    setEditBuffer({
      work_name: row.work_name,
      unit: row.unit,
      price_contract: row.price_contract,
      price_own: row.price_own,
      rate_type: row.rate_type,
    });
  };

  const cancelEdit = (row: RateLeafRow) => {
    if (row.isDraft) {
      setRatesByType((m) => {
        const list = m[row.type_id];
        if (!list) return m;
        return { ...m, [row.type_id]: list.filter((r) => r.id !== row.id) };
      });
    }
    setEditingRateId(null);
    setEditBuffer(null);
  };

  const saveEdit = async (row: RateLeafRow) => {
    if (!editBuffer) return;
    const workName = editBuffer.work_name.trim();
    if (!workName) {
      msg.error('Наименование работ обязательно');
      return;
    }
    const unit = editBuffer.unit && editBuffer.unit.trim() ? editBuffer.unit.trim() : null;

    setSavingRateId(row.id);
    try {
      if (row.isDraft) {
        const created = await createImportedRate({
          type_id: row.type_id,
          work_name: workName,
          unit,
          price_contract: editBuffer.price_contract,
          price_own: editBuffer.price_own,
          rate_type: editBuffer.rate_type,
        });
        setRatesByType((m) => {
          const list = m[row.type_id];
          if (!list) return m;
          const next = list.map((r) =>
            r.id === row.id
              ? ({
                  rowKind: 'rate',
                  key: `rate-${created.id}`,
                  id: created.id,
                  type_id: created.type_id,
                  work_name: created.work_name,
                  unit: created.unit,
                  price_contract: created.price_contract,
                  price_own: created.price_own,
                  rate_type: created.rate_type,
                  materials_count: 0,
                } as RateLeafRow)
              : r,
          );
          return { ...m, [row.type_id]: next };
        });
        setTypesByCategory((m) => {
          const next: Record<string, RateTypeNode[]> = {};
          for (const [catId, list] of Object.entries(m)) {
            next[catId] = list.map((t) =>
              t.id === row.type_id ? { ...t, rates_count: t.rates_count + 1 } : t,
            );
          }
          return next;
        });
        msg.success('Расценка добавлена');
      } else {
        const updated = await updateImportedRate(row.id, {
          work_name: workName,
          unit,
          price_contract: editBuffer.price_contract,
          price_own: editBuffer.price_own,
          rate_type: editBuffer.rate_type,
        });
        setRatesByType((m) => {
          const list = m[row.type_id];
          if (!list) return m;
          const next = list.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  work_name: updated.work_name,
                  unit: updated.unit,
                  price_contract: updated.price_contract,
                  price_own: updated.price_own,
                  rate_type: updated.rate_type,
                }
              : r,
          );
          return { ...m, [row.type_id]: next };
        });
        msg.success('Изменения сохранены');
      }
      setEditingRateId(null);
      setEditBuffer(null);
    } catch (e: any) {
      msg.error(e?.message ?? String(e));
    } finally {
      setSavingRateId(null);
    }
  };

  const addDraftRate = (tId: string) => {
    const draftId = genDraftId();
    const draftRow: RateLeafRow = {
      rowKind: 'rate',
      key: `rate-${draftId}`,
      id: draftId,
      type_id: tId,
      work_name: '',
      unit: null,
      price_contract: null,
      price_own: null,
      rate_type: 'base',
      materials_count: 0,
      isDraft: true,
    };
    setRatesByType((m) => {
      const list = m[tId] ?? [];
      return { ...m, [tId]: [...list, draftRow] };
    });
    setEditingRateId(draftId);
    setEditBuffer({
      work_name: '',
      unit: null,
      price_contract: null,
      price_own: null,
      rate_type: 'base',
    });
  };

  const handleDeleteRate = async (row: RateLeafRow) => {
    setDeletingRateId(row.id);
    try {
      await deleteImportedRate(row.id);
      setRatesByType((m) => {
        const list = m[row.type_id];
        if (!list) return m;
        return { ...m, [row.type_id]: list.filter((r) => r.id !== row.id) };
      });
      setTypesByCategory((m) => {
        const next: Record<string, RateTypeNode[]> = {};
        for (const [catId, list] of Object.entries(m)) {
          next[catId] = list.map((t) =>
            t.id === row.type_id
              ? { ...t, rates_count: Math.max(0, t.rates_count - 1) }
              : t,
          );
        }
        return next;
      });
      msg.success('Расценка удалена');
    } catch (e: any) {
      msg.error(e?.message ?? String(e));
    } finally {
      setDeletingRateId(null);
    }
  };

  // ── Категории: CRUD ──────────────────────────────────────────────────────
  const startEditCategory = (row: CategoryRow) => {
    setEditingCategoryId(row.id);
    setEditingCategoryName(row.name);
  };

  const cancelEditCategory = (row: CategoryRow) => {
    if (row.isDraft) {
      setDraftCategories((d) => d.filter((r) => r.id !== row.id));
    }
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const saveEditCategory = async (row: CategoryRow) => {
    const name = editingCategoryName.trim();
    if (!name) {
      msg.error('Название категории обязательно');
      return;
    }
    setSavingCategoryId(row.id);
    try {
      if (row.isDraft) {
        const created = await createCategory(name);
        setDraftCategories((d) => d.filter((r) => r.id !== row.id));
        setTreeCategories((list) => {
          const next = [
            ...list,
            {
              id: created.id,
              name: created.name,
              sort_order: created.sort_order,
              types_count: 0,
            },
          ];
          next.sort((a, b) => a.sort_order - b.sort_order);
          return next;
        });
        setCategories((list) => {
          const next = [
            ...list,
            { id: created.id, name: created.name, sort_order: created.sort_order },
          ];
          next.sort((a, b) => a.sort_order - b.sort_order);
          return next;
        });
        msg.success('Категория добавлена');
      } else {
        const updated = await updateCategoryName(row.id, name);
        setTreeCategories((list) =>
          list
            .map((c) => (c.id === row.id ? { ...c, name: updated.name } : c))
            .sort((a, b) => a.sort_order - b.sort_order),
        );
        setCategories((list) =>
          list
            .map((c) => (c.id === row.id ? { ...c, name: updated.name } : c))
            .sort((a, b) => a.sort_order - b.sort_order),
        );
        msg.success('Категория переименована');
      }
      setEditingCategoryId(null);
      setEditingCategoryName('');
    } catch (e: any) {
      msg.error(e?.message ?? String(e));
    } finally {
      setSavingCategoryId(null);
    }
  };

  const handleDeleteCategory = async (row: CategoryRow) => {
    setSavingCategoryId(row.id);
    try {
      await deleteCategory(row.id);
      setTreeCategories((list) => list.filter((c) => c.id !== row.id));
      setCategories((list) => list.filter((c) => c.id !== row.id));
      setTypesByCategory((m) => {
        const next = { ...m };
        delete next[row.id];
        return next;
      });
      if (categoryId === row.id) {
        setCategoryId(null);
        setTypeId(null);
        await refreshTypes(null);
      }
      msg.success('Категория удалена');
    } catch (e: any) {
      msg.error(e?.message ?? String(e));
    } finally {
      setSavingCategoryId(null);
    }
  };

  const addDraftCategory = () => {
    const draftId = genDraftId();
    const draftRow: CategoryRow = {
      rowKind: 'category',
      key: `cat-${draftId}`,
      id: draftId,
      name: '',
      types_count: 0,
      isDraft: true,
    };
    setDraftCategories((d) => [...d, draftRow]);
    setEditingCategoryId(draftId);
    setEditingCategoryName('');
  };

  // ── Виды затрат: CRUD ────────────────────────────────────────────────────
  const startEditType = (row: TypeRow) => {
    setEditingTypeId(row.id);
    setEditingTypeName(row.name);
  };

  const cancelEditType = (row: TypeRow) => {
    if (row.isDraft) {
      setDraftTypesByCategory((m) => {
        const list = m[row.category_id];
        if (!list) return m;
        return { ...m, [row.category_id]: list.filter((r) => r.id !== row.id) };
      });
    }
    setEditingTypeId(null);
    setEditingTypeName('');
  };

  const saveEditType = async (row: TypeRow) => {
    const name = editingTypeName.trim();
    if (!name) {
      msg.error('Название вида затрат обязательно');
      return;
    }
    setSavingTypeId(row.id);
    try {
      if (row.isDraft) {
        const created = await createType(row.category_id, name);
        setDraftTypesByCategory((m) => {
          const list = m[row.category_id];
          if (!list) return m;
          return { ...m, [row.category_id]: list.filter((r) => r.id !== row.id) };
        });
        setTypesByCategory((m) => {
          const list = m[row.category_id] ?? [];
          const next = [
            ...list,
            {
              id: created.id,
              category_id: created.category_id,
              name: created.name,
              sort_order: created.sort_order,
              rates_count: 0,
            },
          ];
          next.sort((a, b) => a.sort_order - b.sort_order);
          return { ...m, [row.category_id]: next };
        });
        setTreeCategories((list) =>
          list.map((c) =>
            c.id === row.category_id ? { ...c, types_count: c.types_count + 1 } : c,
          ),
        );
        if (categoryId === row.category_id) {
          await refreshTypes(categoryId);
        }
        msg.success('Вид затрат добавлен');
      } else {
        const updated = await updateTypeName(row.id, name);
        setTypesByCategory((m) => {
          const list = m[row.category_id];
          if (!list) return m;
          const next = list
            .map((t) => (t.id === row.id ? { ...t, name: updated.name } : t))
            .sort((a, b) => a.sort_order - b.sort_order);
          return { ...m, [row.category_id]: next };
        });
        if (categoryId === row.category_id) {
          await refreshTypes(categoryId);
        }
        msg.success('Вид затрат переименован');
      }
      setEditingTypeId(null);
      setEditingTypeName('');
    } catch (e: any) {
      msg.error(e?.message ?? String(e));
    } finally {
      setSavingTypeId(null);
    }
  };

  const handleDeleteType = async (row: TypeRow) => {
    setSavingTypeId(row.id);
    try {
      await deleteType(row.id);
      setTypesByCategory((m) => {
        const list = m[row.category_id];
        if (!list) return m;
        return { ...m, [row.category_id]: list.filter((t) => t.id !== row.id) };
      });
      setRatesByType((m) => {
        const next = { ...m };
        delete next[row.id];
        return next;
      });
      setTreeCategories((list) =>
        list.map((c) =>
          c.id === row.category_id
            ? { ...c, types_count: Math.max(0, c.types_count - 1) }
            : c,
        ),
      );
      if (typeId === row.id) {
        setTypeId(null);
      }
      if (categoryId === row.category_id) {
        await refreshTypes(categoryId);
      }
      msg.success('Вид затрат удалён');
    } catch (e: any) {
      msg.error(e?.message ?? String(e));
    } finally {
      setSavingTypeId(null);
    }
  };

  const addDraftType = (catId: string) => {
    const draftId = genDraftId();
    const draftRow: TypeRow = {
      rowKind: 'type',
      key: `type-${draftId}`,
      id: draftId,
      category_id: catId,
      name: '',
      rates_count: 0,
      isDraft: true,
    };
    setDraftTypesByCategory((m) => {
      const list = m[catId] ?? [];
      return { ...m, [catId]: [...list, draftRow] };
    });
    setEditingTypeId(draftId);
    setEditingTypeName('');
  };

  // Дерево, отфильтрованное селектами
  const visibleCategories = useMemo(() => {
    if (!categoryId) return treeCategories;
    return treeCategories.filter((c) => c.id === categoryId);
  }, [treeCategories, categoryId]);

  const treeData: CategoryRow[] = useMemo(() => {
    const rows: CategoryRow[] = visibleCategories.map((c) => ({
      rowKind: 'category',
      key: `cat-${c.id}`,
      id: c.id,
      name: c.name,
      types_count: c.types_count,
    }));
    if (!categoryId) {
      rows.push(...draftCategories);
    }
    return rows;
  }, [visibleCategories, draftCategories, categoryId]);

  const categoryColumns: ColumnsType<CategoryRow> = useMemo(
    () => [
      {
        title: 'Категория затрат',
        dataIndex: 'name',
        render: (_: unknown, row) => {
          if (editingCategoryId === row.id) {
            return (
              <Input
                value={editingCategoryName}
                onChange={(e) => setEditingCategoryName(e.target.value)}
                placeholder="Название категории"
                onPressEnter={() => saveEditCategory(row)}
                autoFocus
              />
            );
          }
          return (
            <Space size={8} wrap>
              <Typography.Text strong>
                {row.name || <Typography.Text type="secondary">— без названия —</Typography.Text>}
              </Typography.Text>
              {row.isDraft && <Tag color="gold">Новая</Tag>}
            </Space>
          );
        },
      },
      {
        title: 'Видов',
        dataIndex: 'types_count',
        width: 120,
        align: 'right',
        render: (n: number) => <Badge count={n} color="blue" showZero overflowCount={9999} />,
      },
      {
        title: '',
        key: 'actions',
        width: 130,
        render: (_: unknown, row) => {
          const isEditing = editingCategoryId === row.id;
          const isSaving = savingCategoryId === row.id;
          if (isEditing) {
            return (
              <Space size={4} onClick={(e) => e.stopPropagation()}>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={isSaving}
                  onClick={() => saveEditCategory(row)}
                />
                <Button
                  size="small"
                  icon={<CloseOutlined />}
                  disabled={isSaving}
                  onClick={() => cancelEditCategory(row)}
                />
              </Space>
            );
          }
          return (
            <Space size={4} onClick={(e) => e.stopPropagation()}>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={editingCategoryId !== null}
                onClick={() => startEditCategory(row)}
              />
              <Popconfirm
                title="Удалить категорию?"
                description="Удалятся только пустые категории (без видов затрат)."
                okText="Да"
                cancelText="Нет"
                onConfirm={() => handleDeleteCategory(row)}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={isSaving}
                  disabled={editingCategoryId !== null}
                />
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingCategoryId, editingCategoryName, savingCategoryId],
  );

  const typeColumns: ColumnsType<TypeRow> = useMemo(
    () => [
      {
        title: 'Вид затрат',
        dataIndex: 'name',
        render: (_: unknown, row) => {
          if (editingTypeId === row.id) {
            return (
              <Input
                value={editingTypeName}
                onChange={(e) => setEditingTypeName(e.target.value)}
                placeholder="Название вида затрат"
                onPressEnter={() => saveEditType(row)}
                autoFocus
              />
            );
          }
          return (
            <Space size={8} wrap>
              <Typography.Text>
                {row.name || <Typography.Text type="secondary">— без названия —</Typography.Text>}
              </Typography.Text>
              {row.isDraft && <Tag color="gold">Новый</Tag>}
            </Space>
          );
        },
      },
      {
        title: 'Расценок',
        dataIndex: 'rates_count',
        width: 120,
        align: 'right',
        render: (n: number) => <Badge count={n} color="geekblue" showZero overflowCount={99999} />,
      },
      {
        title: '',
        key: 'actions',
        width: 130,
        render: (_: unknown, row) => {
          const isEditing = editingTypeId === row.id;
          const isSaving = savingTypeId === row.id;
          if (isEditing) {
            return (
              <Space size={4} onClick={(e) => e.stopPropagation()}>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={isSaving}
                  onClick={() => saveEditType(row)}
                />
                <Button
                  size="small"
                  icon={<CloseOutlined />}
                  disabled={isSaving}
                  onClick={() => cancelEditType(row)}
                />
              </Space>
            );
          }
          return (
            <Space size={4} onClick={(e) => e.stopPropagation()}>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={editingTypeId !== null}
                onClick={() => startEditType(row)}
              />
              <Popconfirm
                title="Удалить вид затрат?"
                description="Удалятся только пустые виды (без расценок)."
                okText="Да"
                cancelText="Нет"
                onConfirm={() => handleDeleteType(row)}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={isSaving}
                  disabled={editingTypeId !== null}
                />
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingTypeId, editingTypeName, savingTypeId],
  );

  const rateColumns: ColumnsType<RateLeafRow> = useMemo(
    () => [
      {
        title: 'Наименование работ',
        dataIndex: 'work_name',
        render: (_: unknown, row) => {
          if (editingRateId === row.id && editBuffer) {
            return (
              <Input.TextArea
                autoSize={{ minRows: 1, maxRows: 4 }}
                value={editBuffer.work_name}
                onChange={(e) =>
                  setEditBuffer((b) => (b ? { ...b, work_name: e.target.value } : b))
                }
                placeholder="Наименование работ"
              />
            );
          }
          return (
            <Space size={8} wrap>
              <Typography.Text>{row.work_name || <Typography.Text type="secondary">— без названия —</Typography.Text>}</Typography.Text>
              {row.isDraft && <Tag color="gold">Новая</Tag>}
            </Space>
          );
        },
      },
      {
        title: 'Единица',
        dataIndex: 'unit',
        width: 110,
        render: (_: unknown, row) => {
          if (editingRateId === row.id && editBuffer) {
            return (
              <Input
                value={editBuffer.unit ?? ''}
                onChange={(e) =>
                  setEditBuffer((b) => (b ? { ...b, unit: e.target.value } : b))
                }
                placeholder="шт/м2/…"
              />
            );
          }
          return <Typography.Text>{row.unit ?? '—'}</Typography.Text>;
        },
      },
      {
        title: 'Цена Подряд',
        dataIndex: 'price_contract',
        width: 150,
        align: 'right',
        render: (_: unknown, row) => {
          if (editingRateId === row.id && editBuffer) {
            return (
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={0.01}
                precision={2}
                decimalSeparator=","
                value={editBuffer.price_contract}
                onChange={(v) =>
                  setEditBuffer((b) =>
                    b ? { ...b, price_contract: v === null ? null : Number(v) } : b,
                  )
                }
              />
            );
          }
          return <Typography.Text>{formatPrice(row.price_contract)}</Typography.Text>;
        },
      },
      {
        title: 'Цена собственные',
        dataIndex: 'price_own',
        width: 150,
        align: 'right',
        render: (_: unknown, row) => {
          if (editingRateId === row.id && editBuffer) {
            return (
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={0.01}
                precision={2}
                decimalSeparator=","
                value={editBuffer.price_own}
                onChange={(v) =>
                  setEditBuffer((b) =>
                    b ? { ...b, price_own: v === null ? null : Number(v) } : b,
                  )
                }
              />
            );
          }
          return <Typography.Text>{formatPrice(row.price_own)}</Typography.Text>;
        },
      },
      {
        title: 'Тип',
        dataIndex: 'rate_type',
        width: 110,
        render: (_: unknown, row) => {
          if (editingRateId === row.id && editBuffer) {
            return (
              <Select<RateKind>
                style={{ width: '100%' }}
                value={editBuffer.rate_type}
                onChange={(v) =>
                  setEditBuffer((b) => (b ? { ...b, rate_type: v } : b))
                }
                options={[
                  { value: 'base', label: 'Баз' },
                  { value: 'optional', label: 'Опц' },
                ]}
              />
            );
          }
          return row.rate_type === 'optional' ? (
            <Tag color="blue">Опц</Tag>
          ) : (
            <Tag>Баз</Tag>
          );
        },
      },
      {
        title: '',
        dataIndex: 'actions',
        width: 160,
        render: (_: unknown, row) => {
          const isEditing = editingRateId === row.id;
          const isSaving = savingRateId === row.id;
          const isDeleting = deletingRateId === row.id;
          if (isEditing) {
            return (
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={isSaving}
                  onClick={() => saveEdit(row)}
                />
                <Button
                  size="small"
                  icon={<CloseOutlined />}
                  disabled={isSaving}
                  onClick={() => cancelEdit(row)}
                />
              </Space>
            );
          }
          return (
            <Space size={4}>
              <Tooltip title="Добавить материал">
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={editingRateId !== null || row.isDraft}
                  onClick={() => {
                    setExpandedRateKeys((prev) =>
                      prev.includes(row.key) ? prev : [...prev, row.key],
                    );
                    setAddMaterialForRateId(row.id);
                  }}
                />
              </Tooltip>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={editingRateId !== null}
                onClick={() => startEdit(row)}
              />
              <Popconfirm
                title="Удалить расценку?"
                okText="Да"
                cancelText="Нет"
                onConfirm={() => handleDeleteRate(row)}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={isDeleting}
                  disabled={editingRateId !== null}
                />
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingRateId, editBuffer, savingRateId, deletingRateId],
  );

  const flatColumns: ColumnsType<RateRow> = useMemo(
    () => [
      { title: 'Категория затрат', dataIndex: 'category_name', width: 220 },
      { title: 'Вид затрат', dataIndex: 'type_name', width: 220 },
      { title: 'Наименование работ', dataIndex: 'work_name' },
      { title: 'Единица', dataIndex: 'unit', width: 100 },
      {
        title: 'Цена Подряд',
        dataIndex: 'price_contract',
        width: 140,
        align: 'right',
        render: (v: number | null) => formatPrice(v),
      },
      {
        title: 'Цена собственные',
        dataIndex: 'price_own',
        width: 150,
        align: 'right',
        render: (v: number | null) => formatPrice(v),
      },
      {
        title: 'Тип',
        dataIndex: 'rate_type',
        width: 90,
        render: (v: RateKind) =>
          v === 'optional' ? <Tag color="blue">Опц</Tag> : <Tag>Баз</Tag>,
      },
    ],
    [],
  );

  // Раскрытие категории → таблица видов
  const renderTypesForCategory = (catRow: CategoryRow) => {
    if (catRow.isDraft) return null;
    const list = typesByCategory[catRow.id];
    if (loadingCategoryIds.has(catRow.id) && !list) {
      return (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      );
    }
    const savedRows: TypeRow[] = (list ?? [])
      .filter((t) => !typeId || t.id === typeId)
      .map((t) => ({
        rowKind: 'type',
        key: `type-${t.id}`,
        id: t.id,
        category_id: t.category_id,
        name: t.name,
        rates_count: t.rates_count,
      }));
    const drafts = typeId ? [] : (draftTypesByCategory[catRow.id] ?? []);
    const data = [...savedRows, ...drafts];
    return (
      <div>
        <Table<TypeRow>
          size="small"
          rowKey="key"
          showHeader={false}
          columns={typeColumns}
          dataSource={data}
          pagination={false}
          rowClassName={(row) =>
            row.isDraft ? 'imported-rates-draft-row' : 'imported-rates-type-row'
          }
          expandable={{
            expandedRowRender: renderRatesForType,
            rowExpandable: (row) => !row.isDraft,
            onExpand: (expanded, row) => {
              if (expanded) ensureRatesLoaded(row.id);
            },
          }}
        />
        <div style={{ padding: '8px 0 4px' }}>
          <Button
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            disabled={editingTypeId !== null}
            onClick={() => addDraftType(catRow.id)}
          >
            Добавить вид затрат
          </Button>
        </div>
      </div>
    );
  };

  // Раскрытие вида → таблица расценок + зелёная кнопка в шапке колонки
  const renderRatesForType = (typeRow: TypeRow) => {
    const list = ratesByType[typeRow.id];
    if (loadingTypeIds.has(typeRow.id) && !list) {
      return (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      );
    }
    const data = list ?? [];
    const columnsForType = rateColumns.map((col) => {
      if ('dataIndex' in col && col.dataIndex === 'work_name') {
        return {
          ...col,
          title: (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>Наименование работ</span>
              <Button
                size="small"
                icon={<PlusOutlined />}
                disabled={editingRateId !== null}
                onClick={() => addDraftRate(typeRow.id)}
                style={{ borderColor: '#52c41a', color: '#52c41a' }}
              >
                Добавить расценку
              </Button>
            </div>
          ),
        };
      }
      return col;
    });
    return (
      <div>
        <Table<RateLeafRow>
          size="small"
          rowKey="key"
          columns={columnsForType}
          dataSource={data}
          pagination={false}
          rowClassName={(row) => (row.isDraft ? 'imported-rates-draft-row' : '')}
          locale={{ emptyText: 'Нет расценок' }}
          expandable={{
            expandedRowKeys: expandedRateKeys,
            onExpand: (expanded, row) => {
              setExpandedRateKeys((prev) =>
                expanded
                  ? prev.includes(row.key)
                    ? prev
                    : [...prev, row.key]
                  : prev.filter((k) => k !== row.key),
              );
            },
            expandedRowRender: (row) => (
              <RateMaterialsPanel
                rateId={row.id}
                catalog={materialsCatalog}
                autoOpenDraft={addMaterialForRateId === row.id}
                onDraftOpened={() => setAddMaterialForRateId(null)}
                onMaterialsCountChange={(count) =>
                  setRatesByType((m) => {
                    const lst = m[row.type_id];
                    if (!lst) return m;
                    return {
                      ...m,
                      [row.type_id]: lst.map((r) =>
                        r.id === row.id ? { ...r, materials_count: count } : r,
                      ),
                    };
                  })
                }
              />
            ),
            rowExpandable: (row) => !row.isDraft,
            expandIcon: ({ expanded, onExpand, record }) => {
              if (record.isDraft) return null;
              if (!expanded && record.materials_count === 0) return null;
              return (
                <Button
                  type="text"
                  size="small"
                  onClick={(e) => onExpand(record, e)}
                  style={{ padding: 0, width: 16, height: 16, lineHeight: 1 }}
                >
                  {expanded ? '−' : '+'}
                </Button>
              );
            },
          }}
        />
      </div>
    );
  };

  const importHint = (
    <span>
      Обязательные столбцы: «Категория затрат», «Вид затрат», «Наименование работ»,
      «Единица измерения». Опциональные: «Цена Подряд», «Цена собственные» — если заданы,
      заменят текущие цены при повторном импорте.
    </span>
  );

  return (
    <div>
      {msgCtx}
      <style>{`
        .imported-rates-category-row > td { background-color: #e6f4ff !important; }
        .imported-rates-type-row > td { background-color: #f6ffed !important; }
        .imported-rates-draft-row > td { background-color: #fffbe6 !important; }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Select
          style={{ minWidth: 260 }}
          placeholder="Категория затрат"
          allowClear
          showSearch
          optionFilterProp="label"
          value={categoryId}
          onChange={(v) => handleCategoryChange(v ?? null)}
          options={categories.map((c, idx) => ({
            label: `${idx + 1}. ${c.name}`,
            value: c.id,
          }))}
        />
        <Select
          style={{ minWidth: 260 }}
          placeholder="Вид затрат"
          allowClear
          showSearch
          optionFilterProp="label"
          value={typeId}
          onChange={(v) => handleTypeChange(v ?? null)}
          options={types.map((t) => ({ label: t.name, value: t.id }))}
        />
        <Input.Search
          style={{ width: 320 }}
          placeholder="Поиск по наименованию работ"
          allowClear
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            if (v.trim() === '') setAppliedSearch('');
          }}
          onSearch={(v) => setAppliedSearch(v)}
        />
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          Сбросить
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => setManagerOpen(true)}>
          Категория
        </Button>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {parsed && (
            <>
              <Typography.Text type="secondary">
                {fileName}: {parsed.length} строк
              </Typography.Text>
              <Button
                type="primary"
                icon={<InboxOutlined />}
                loading={importing}
                onClick={handleImport}
              >
                Импортировать в БД
              </Button>
              <Button
                onClick={() => {
                  setParsed(null);
                  setFileName('');
                }}
              >
                Отменить
              </Button>
            </>
          )}
          <Upload
            accept=".xlsx,.xls"
            beforeUpload={handleFile}
            showUploadList={false}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />}>Импорт Excel</Button>
          </Upload>
          <Tooltip title={importHint}>
            <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
          </Tooltip>
        </div>
      </div>

      {flatMode ? (
        <Table<RateRow>
          size="small"
          rowKey="id"
          loading={flatLoading}
          columns={flatColumns}
          dataSource={flatRows}
          pagination={false}
        />
      ) : (
        <>
          <Table<CategoryRow>
            size="small"
            rowKey="key"
            loading={treeLoading}
            columns={categoryColumns}
            dataSource={treeData}
            pagination={false}
            rowClassName={(row) =>
              row.isDraft ? 'imported-rates-draft-row' : 'imported-rates-category-row'
            }
            expandable={{
              expandedRowRender: renderTypesForCategory,
              rowExpandable: (row) => !row.isDraft,
              onExpand: (expanded, row) => {
                if (expanded) ensureTypesLoaded(row.id);
              },
            }}
          />
          {!categoryId && (
            <div style={{ padding: '8px 0 4px' }}>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                disabled={editingCategoryId !== null}
                onClick={addDraftCategory}
              >
                Добавить категорию
              </Button>
            </div>
          )}
        </>
      )}

      <CategoryTypeManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={() => {
          void refreshCategories();
          void refreshTypes(categoryId);
          void refreshTree();
          if (flatMode) void refreshFlat();
        }}
      />
    </div>
  );
}
