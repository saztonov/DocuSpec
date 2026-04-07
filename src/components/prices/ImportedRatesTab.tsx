import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Select,
  Space,
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
  loadRates,
  loadTypes,
  parseRatesXlsx,
  type ParsedRate,
  type RateCategory,
  type RateRow,
  type RateType,
} from '../../lib/importedRates';

const PAGE_SIZE = 50;

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

  // Таблица
  const [rows, setRows] = useState<RateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

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

  const refreshRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadRates({
        categoryId,
        typeId,
        search,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e: any) {
      msg.error(`Ошибка загрузки расценок: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [categoryId, typeId, search, page, msg]);

  useEffect(() => {
    refreshCategories();
    refreshTypes(null);
  }, [refreshCategories, refreshTypes]);

  useEffect(() => {
    refreshRates();
  }, [refreshRates]);

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
      await refreshRates();
    } catch (e: any) {
      msg.error(`Ошибка импорта: ${e.message ?? e}`);
    } finally {
      setImporting(false);
    }
  };

  const handleCategoryChange = async (value: string | null) => {
    setCategoryId(value ?? null);
    setTypeId(null);
    setPage(1);
    await refreshTypes(value ?? null);
  };

  const handleTypeChange = (value: string | null) => {
    setTypeId(value ?? null);
    setPage(1);
  };

  const handleReset = async () => {
    setCategoryId(null);
    setTypeId(null);
    setSearch('');
    setPage(1);
    await refreshTypes(null);
  };

  const columns: ColumnsType<RateRow> = useMemo(
    () => [
      { title: 'Категория затрат', dataIndex: 'category_name', width: 220 },
      { title: 'Вид затрат', dataIndex: 'type_name', width: 220 },
      { title: 'Наименование работ', dataIndex: 'work_name' },
      { title: 'Единица', dataIndex: 'unit', width: 100 },
    ],
    [],
  );

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
            style={{ width: 260 }}
            placeholder="Поиск по наименованию"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => {
              setPage(1);
              refreshRates();
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Сбросить
          </Button>
        </Space>
      </Card>

      <Table<RateRow>
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
        }}
      />
    </div>
  );
}
