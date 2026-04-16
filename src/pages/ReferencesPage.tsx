import { useMemo } from 'react';
import { Tabs, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader.tsx';
import MaterialsTab from '../components/references/MaterialsTab.tsx';

const TAB_KEYS = ['materials'] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default function ReferencesPage() {
  const [params, setParams] = useSearchParams();
  const tab = useMemo<TabKey>(() => {
    const t = params.get('tab') as TabKey | null;
    return t && TAB_KEYS.includes(t) ? t : 'materials';
  }, [params]);

  const handleChange = (key: string) => {
    setParams({ tab: key }, { replace: true });
  };

  return (
    <>
      <AppHeader />
      <div style={{ padding: '16px 24px' }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Справочники
        </Typography.Title>
        <Tabs
          activeKey={tab}
          onChange={handleChange}
          destroyOnHidden
          items={[
            {
              key: 'materials',
              label: 'Материалы',
              children: <MaterialsTab />,
            },
          ]}
        />
      </div>
    </>
  );
}
