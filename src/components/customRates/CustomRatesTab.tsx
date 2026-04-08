import { useCallback, useEffect, useState } from 'react';
import { Button, Space, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useCustomRates, DEFAULT_CUSTOM_RATES_FILTERS } from '../../hooks/useCustomRates';
import { loadCategories, loadTypes } from '../../lib/importedRates';
import type { RateCategory, RateType } from '../../lib/importedRates';
import CustomRatesFilters from './CustomRatesFilters';
import CustomRatesTable from './CustomRatesTable';
import CreateRatesModal from './CreateRatesModal';

export default function CustomRatesTab() {
  const [filters, setFilters] = useState(DEFAULT_CUSTOM_RATES_FILTERS);
  const [categories, setCategories] = useState<RateCategory[]>([]);
  const [types, setTypes] = useState<RateType[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [msg, msgCtx] = message.useMessage();

  const { rows, total, loading, error, deleteRate, afterBatchCreate } = useCustomRates(filters);

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

  useEffect(() => {
    void refreshCategories();
    void refreshTypes(null);
  }, [refreshCategories, refreshTypes]);

  // При смене категории — перезагружаем виды затрат и сбрасываем typeId
  const handleCategoryChange = useCallback(
    async (categoryId: string | null) => {
      setFilters((prev) => ({ ...prev, categoryId, typeId: null, page: 1 }));
      await refreshTypes(categoryId);
    },
    [refreshTypes],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteRate(id);
        msg.success('Расценка удалена');
      } catch (e: any) {
        msg.error(`Ошибка удаления: ${e.message ?? e}`);
      }
    },
    [deleteRate, msg],
  );

  const handleModalClose = useCallback(
    async (savedCount: number) => {
      setModalOpen(false);
      if (savedCount > 0) {
        msg.success(`Сохранено расценок: ${savedCount}`);
        await afterBatchCreate();
      }
    },
    [afterBatchCreate, msg],
  );

  return (
    <div>
      {msgCtx}

      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            Новые расценки
          </Typography.Title>
          <Typography.Text type="secondary">
            Пользовательский справочник на базе ФСНБ, корпоративных расценок 1С и созданных вручную
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Создать расценки
        </Button>
      </Space>

      <CustomRatesFilters
        value={filters}
        categories={categories}
        types={types}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch, page: 1 }))}
        onCategoryChange={handleCategoryChange}
      />

      <CustomRatesTable
        rows={rows}
        total={total}
        loading={loading}
        page={filters.page}
        pageSize={filters.pageSize}
        onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
        onDelete={handleDelete}
      />

      {error && (
        <Typography.Text type="danger" style={{ display: 'block', marginTop: 8 }}>
          {error}
        </Typography.Text>
      )}

      {modalOpen && (
        <CreateRatesModal
          open={modalOpen}
          onClose={handleModalClose}
          categories={categories}
          types={types}
        />
      )}
    </div>
  );
}
