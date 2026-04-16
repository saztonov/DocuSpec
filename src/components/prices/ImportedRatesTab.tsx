import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Upload,
  Typography,
  message,
} from 'antd';
import {
  InboxOutlined,
  UploadOutlined,
  ReloadOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  createImportedRate,
  importRates,
  loadCategories,
  loadCategoriesWithCounts,
  loadRates,
  loadRatesByType,
  loadTypes,
  loadTypesWithCounts,
  parseRatesXlsx,
  updateImportedRate,
  type ParsedRate,
  type RateCategory,
  type RateCategoryNode,
  type RateRow,
  type RateType,
  type RateTypeNode,
} from '../../lib/importedRates';

type CategoryRow = {
  rowKind: 'category';
  key: string;
  id: string;
  name: string;
  types_count: number;
};

type TypeRow = {
  rowKind: 'type';
  key: string;
  id: string;
  category_id: string;
  name: string;
  rates_count: number;
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
  isDraft?: boolean;
};

type EditBuffer = {
  work_name: string;
  unit: string | null;
  price_contract: number | null;
  price_own: number | null;
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

  // Редактирование
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<EditBuffer | null>(null);
  const [savingRateId, setSavingRateId] = useState<string | null>(null);

  const flatMode = appliedSearch.trim().length > 0;

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
    });
  };

  // Дерево, отфильтрованное селектами
  const visibleCategories = useMemo(() => {
    if (!categoryId) return treeCategories;
    return treeCategories.filter((c) => c.id === categoryId);
  }, [treeCategories, categoryId]);

  const treeData: CategoryRow[] = useMemo(
    () =>
      visibleCategories.map((c) => ({
        rowKind: 'category',
        key: `cat-${c.id}`,
        id: c.id,
        name: c.name,
        types_count: c.types_count,
      })),
    [visibleCategories],
  );

  const categoryColumns: ColumnsType<CategoryRow> = useMemo(
    () => [
      {
        title: 'Категория затрат',
        dataIndex: 'name',
        render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
      },
      {
        title: 'Видов',
        dataIndex: 'types_count',
        width: 120,
        align: 'right',
        render: (n: number) => <Badge count={n} color="blue" showZero overflowCount={9999} />,
      },
    ],
    [],
  );

  const typeColumns: ColumnsType<TypeRow> = useMemo(
    () => [
      {
        title: 'Вид затрат',
        dataIndex: 'name',
        render: (name: string) => <Typography.Text>{name}</Typography.Text>,
      },
      {
        title: 'Расценок',
        dataIndex: 'rates_count',
        width: 120,
        align: 'right',
        render: (n: number) => <Badge count={n} color="geekblue" showZero overflowCount={99999} />,
      },
    ],
    [],
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
        title: '',
        dataIndex: 'actions',
        width: 110,
        render: (_: unknown, row) => {
          const isEditing = editingRateId === row.id;
          const isSaving = savingRateId === row.id;
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
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={editingRateId !== null}
              onClick={() => startEdit(row)}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingRateId, editBuffer, savingRateId],
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
    ],
    [],
  );

  // Раскрытие категории → таблица видов
  const renderTypesForCategory = (catRow: CategoryRow) => {
    const list = typesByCategory[catRow.id];
    if (loadingCategoryIds.has(catRow.id) && !list) {
      return (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      );
    }
    const data: TypeRow[] = (list ?? [])
      .filter((t) => !typeId || t.id === typeId)
      .map((t) => ({
        rowKind: 'type',
        key: `type-${t.id}`,
        id: t.id,
        category_id: t.category_id,
        name: t.name,
        rates_count: t.rates_count,
      }));
    return (
      <Table<TypeRow>
        size="small"
        rowKey="key"
        showHeader={false}
        columns={typeColumns}
        dataSource={data}
        pagination={false}
        expandable={{
          expandedRowRender: renderRatesForType,
          rowExpandable: () => true,
          onExpand: (expanded, row) => {
            if (expanded) ensureRatesLoaded(row.id);
          },
        }}
      />
    );
  };

  // Раскрытие вида → таблица расценок + кнопка добавления
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
    return (
      <div>
        <Table<RateLeafRow>
          size="small"
          rowKey="key"
          columns={rateColumns}
          dataSource={data}
          pagination={false}
          rowClassName={(row) => (row.isDraft ? 'imported-rates-draft-row' : '')}
          locale={{ emptyText: 'Нет расценок' }}
        />
        <div style={{ padding: '8px 0 4px' }}>
          <Button
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            disabled={editingRateId !== null}
            onClick={() => addDraftRate(typeRow.id)}
          >
            Добавить расценку
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {msgCtx}
      <style>{`.imported-rates-draft-row > td { background-color: #fffbe6 !important; }`}</style>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Typography.Text strong>Импорт расценок из Excel</Typography.Text>
          <Space wrap>
            <Upload
              accept=".xlsx,.xls"
              beforeUpload={handleFile}
              showUploadList={false}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>Выбрать файл</Button>
            </Upload>
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
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Обязательные столбцы: «Категория затрат», «Вид затрат», «Наименование работ»,
            «Единица измерения». Опциональные: «Цена Подряд», «Цена собственные» — если заданы,
            заменят текущие цены при повторном импорте.
          </Typography.Text>
        </Space>
      </Card>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            style={{ minWidth: 260 }}
            placeholder="Категория затрат"
            allowClear
            showSearch
            optionFilterProp="label"
            value={categoryId}
            onChange={(v) => handleCategoryChange(v ?? null)}
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
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
        </Space>
      </Card>

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
        <Table<CategoryRow>
          size="small"
          rowKey="key"
          loading={treeLoading}
          columns={categoryColumns}
          dataSource={treeData}
          pagination={false}
          expandable={{
            expandedRowRender: renderTypesForCategory,
            rowExpandable: (row) => row.types_count > 0,
            onExpand: (expanded, row) => {
              if (expanded) ensureTypesLoaded(row.id);
            },
          }}
        />
      )}
    </div>
  );
}
