import { useEffect, useState } from 'react';
import { Layout } from 'antd';
import FsnbTreePanel, { type ScopeSelection, type DeletedInfo } from './FsnbTreePanel';
import FsnbSearchPanel from './FsnbSearchPanel';
import FsnbDetailsPanel, { type DetailsTarget } from './FsnbDetailsPanel';
import { listCollections, type FsnbCollectionInfo } from '../../lib/fsnbExplorer';

const { Sider, Content } = Layout;

export default function FsnbExplorer() {
  const [collections, setCollections] = useState<FsnbCollectionInfo[]>([]);
  const [scope, setScope] = useState<ScopeSelection>({ kind: null });
  const [target, setTarget] = useState<DetailsTarget>(null);

  useEffect(() => {
    listCollections().then(setCollections);
  }, []);

  // Если в дереве выбрана конкретная норма/ресурс — открываем в правой панели
  const handleScopeSelect = (s: ScopeSelection) => {
    if (s.kind === 'norm' && s.norm_id) {
      setTarget({ kind: 'norm', id: s.norm_id });
      setScope({ kind: null });
      return;
    }
    if (s.kind === 'tg-resource' && s.resource_id) {
      setTarget({ kind: 'resource', id: s.resource_id });
      setScope({ kind: null });
      return;
    }
    setScope(s);
  };

  return (
    <Layout style={{ height: 'calc(100vh - 120px)', background: '#fff' }}>
      <Sider
        width={300}
        theme="light"
        collapsible
        style={{ borderRight: '1px solid #f0f0f0', background: '#fafafa' }}
      >
        <FsnbTreePanel
          onSelect={handleScopeSelect}
          onDeleted={(info: DeletedInfo) => {
            // Сбрасываем правую панель, если был открыт удалённый объект
            if (info.kind === 'norm') {
              setTarget(prev =>
                prev && prev.kind === 'norm' && prev.id === info.norm_id
                  ? null
                  : prev,
              );
            }
            // Сбрасываем scope, если он был на удалённом разделе/подразделе
            setScope(prev => {
              if (
                info.kind === 'division' &&
                prev.kind === 'division' &&
                prev.collection_id === info.collection_id &&
                prev.division_code === info.division_code
              ) {
                return { kind: null };
              }
              if (
                info.kind === 'table' &&
                prev.kind === 'table' &&
                prev.collection_id === info.collection_id &&
                prev.division_code === info.division_code &&
                prev.table_code === info.table_code
              ) {
                return { kind: null };
              }
              return prev;
            });
          }}
        />
      </Sider>
      <Content style={{ display: 'flex', minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #f0f0f0' }}>
          <FsnbSearchPanel
            collections={collections}
            scope={scope}
            onClearScope={() => setScope({ kind: null })}
            onSelectNorm={id => setTarget({ kind: 'norm', id })}
            onSelectResource={id => setTarget({ kind: 'resource', id })}
            onResultsCleared={() => setTarget(null)}
          />
        </div>
        <div style={{ width: 480, minWidth: 380, background: '#fafafa' }}>
          <FsnbDetailsPanel target={target} onTargetChange={setTarget} />
        </div>
      </Content>
    </Layout>
  );
}
