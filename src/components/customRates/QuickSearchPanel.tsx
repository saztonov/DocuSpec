import { useCallback, useEffect, useState } from 'react';
import { Spin, Typography, Alert } from 'antd';
import QuickSearchControls from './QuickSearchControls';
import CandidateList from './CandidateList';
import { useFuseSearch } from '../../hooks/useFuseSearch';
import { loadFuzzySettings, saveFuzzySettings } from './FuzzySettingsPopover';
import type { Candidate, FuzzySettings } from '../../types/customRates';

interface Props {
  inDraftKeys: Set<string>;
  existingKeys: Set<string>;
  onAddToDraft: (c: Candidate) => void;
}

export default function QuickSearchPanel({ inDraftKeys, existingKeys, onAddToDraft }: Props) {
  const [settings, setSettings] = useState<FuzzySettings>(() => loadFuzzySettings());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[] | null>(null);

  // Сохраняем настройки в localStorage при изменении
  useEffect(() => {
    saveFuzzySettings(settings);
  }, [settings]);

  const { loading: cacheLoading, error: cacheError, indexSize, search } = useFuseSearch(settings);

  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const found = search(query);
    setResults(found);
  }, [query, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <QuickSearchControls
        query={query}
        onQueryChange={setQuery}
        settings={settings}
        onSettingsChange={setSettings}
        onSearch={handleSearch}
        loading={cacheLoading}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', minHeight: 0 }}>
        {cacheLoading && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
            <div style={{ marginTop: 12 }}>
              <Typography.Text type="secondary">Загружаю кэш расценок...</Typography.Text>
            </div>
          </div>
        )}

        {cacheError && (
          <Alert
            type="error"
            message="Не удалось загрузить кэш"
            description={cacheError}
            showIcon
          />
        )}

        {!cacheLoading && !cacheError && results === null && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Typography.Text type="secondary">
              Введите запрос и нажмите «Найти». В поиске участвуют ФСНБ ({indexSize > 0 ? `${indexSize}` : '—'} записей) и корпоративные расценки 1С.
            </Typography.Text>
          </div>
        )}

        {!cacheLoading && !cacheError && results !== null && (
          <CandidateList
            candidates={results}
            inDraftKeys={inDraftKeys}
            existingKeys={existingKeys}
            onAdd={onAddToDraft}
          />
        )}
      </div>
    </div>
  );
}
