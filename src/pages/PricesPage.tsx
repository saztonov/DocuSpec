import { useMemo } from 'react';
import { Tabs, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import FsnbExplorer from '../components/prices/FsnbExplorer';
import ComingSoon from '../components/prices/ComingSoon';
import ImportedRatesTab from '../components/prices/ImportedRatesTab';

const TAB_KEYS = ['fsnb', 'estimates', 'corp'] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default function PricesPage() {
  const [params, setParams] = useSearchParams();
  const tab = useMemo<TabKey>(() => {
    const t = params.get('tab') as TabKey | null;
    return t && TAB_KEYS.includes(t) ? t : 'fsnb';
  }, [params]);

  const handleChange = (key: string) => {
    setParams({ tab: key }, { replace: true });
  };

  return (
    <div style={{ padding: '16px 24px' }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Расценки
      </Typography.Title>
      <Tabs
        activeKey={tab}
        onChange={handleChange}
        destroyOnHidden
        items={[
          {
            key: 'fsnb',
            label: 'ФСНБ',
            children: <FsnbExplorer />,
          },
          {
            key: 'estimates',
            label: 'Сметные расценки',
            children: <ImportedRatesTab />,
          },
          {
            key: 'corp',
            label: 'Новые расценки',
            children: (
              <ComingSoon
                title="Корпоративные расценки"
                description="Здесь будет формироваться корпоративный справочник на базе ФСНБ."
              />
            ),
          },
        ]}
      />
    </div>
  );
}
