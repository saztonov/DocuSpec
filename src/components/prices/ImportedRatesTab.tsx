import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Upload,
  Typography,
  message,
} from 'antd';
import { InboxOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  importRates,
  loadCategories,
  loadCategoriesWithCounts,
  loadRates,
  loadRatesByType,
  loadTypes,
  loadTypesWithCounts,
  parseRatesXlsx,
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
  work_name: string;
  unit: string | null;
};

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
  const [ratesByType, setRatesByType] = useState<Record<string, RateRow[]>>({});
  const [loadingCategoryIds, setLoadingCategoryIds] = useState<Set<string>>(new Set());
  const [loadingTypeIds, setLoadingTypeIds] = useState<Set<string>>(new Set());

  // Плоский режим (активен при непустом тексте поиска)
  const [flatRows, setFlatRows] = useState<RateRow[]>([]);
  const [flatLoading, setFlatLoading] = useState(false);

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
        setRatesByType((m) => ({ ...m, [tId]: list }));
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
      { title: 'Наименование работ', dataIndex: 'work_name' },
      { title: 'Единица', dataIndex: 'unit', width: 120 },
    ],
    [],
  );

  const flatColumns: ColumnsType<RateRow> = useMemo(
    () => [
      { title: 'Категория затрат', dataIndex: 'category_name', width: 220 },
      { title: 'Вид затрат', dataIndex: 'type_name', width: 220 },
      { title: 'Наименование работ', dataIndex: 'work_name' },
      { title: 'Единица', dataIndex: 'unit', width: 100 },
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
          rowExpandable: (row) => row.rates_count > 0,
          onExpand: (expanded, row) => {
            if (expanded) ensureRatesLoaded(row.id);
          },
        }}
      />
    );
  };

  // Раскрытие вида → таблица расценок
  const renderRatesForType = (typeRow: TypeRow) => {
    const list = ratesByType[typeRow.id];
    if (loadingTypeIds.has(typeRow.id) && !list) {
      return (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      );
    }
    const data: RateLeafRow[] = (list ?? []).map((r) => ({
      rowKind: 'rate',
      key: `rate-${r.id}`,
      id: r.id,
      work_name: r.work_name,
      unit: r.unit,
    }));
    return (
      <Table<RateLeafRow>
        size="small"
        rowKey="key"
        columns={rateColumns}
        dataSource={data}
        pagination={false}
      />
    );
  };

  return (
    <div>
      {msgCtx}
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
            Ожидаются столбцы: «Категория затрат», «Вид затрат», «Наименование работ»,
            «Единица измерения». Столбец «Стоимость расценки» игнорируется.
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
