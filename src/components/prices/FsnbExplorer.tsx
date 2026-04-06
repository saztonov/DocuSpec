import { useEffect, useState } from 'react';
import { Layout } from 'antd';
import FsnbTreePanel, { type ScopeSelection } from './FsnbTreePanel';
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
        <FsnbTreePanel onSelect={handleScopeSelect} />
      </Sider>
      <Content style={{ display: 'flex', minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #f0f0f0' }}>
          <FsnbSearchPanel
            collections={collections}
            scope={scope}
            onClearScope={() => setScope({ kind: null })}
            onSelectNorm={id => setTarget({ kind: 'norm', id })}
            onSelectResource={id => setTarget({ kind: 'resource', id })}
          />
        </div>
        <div style={{ width: 480, minWidth: 380, background: '#fafafa' }}>
          <FsnbDetailsPanel target={target} onTargetChange={setTarget} />
        </div>
      </Content>
    </Layout>
  );
}
