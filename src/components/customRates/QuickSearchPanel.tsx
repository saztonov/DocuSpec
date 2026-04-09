import { useCallback, useEffect, useState } from 'react';
import { Spin, Typography, Alert } from 'antd';
import QuickSearchControls from './QuickSearchControls';
import CandidateList from './CandidateList';
import { useFuseSearch } from '../../hooks/useFuseSearch';
import { loadFuzzySettings, saveFuzzySettings } from './FuzzySettingsPopover';
import {
  QUICK_SEARCH_SCOPE_LS_KEY,
  type Candidate,
  type FuzzySettings,
  type RateSearchScope,
} from '../../types/customRates';

function loadScope(): RateSearchScope {
  try {
    const v = localStorage.getItem(QUICK_SEARCH_SCOPE_LS_KEY);
    if (v === 'fsnb' || v === 'imported' || v === 'both') return v;
  } catch {
    /* ignore */
  }
  return 'both';
}

interface Props {
  inDraftKeys: Set<string>;
  existingKeys: Set<string>;
  onAddToDraft: (c: Candidate) => void;
}

export default function QuickSearchPanel({ inDraftKeys, existingKeys, onAddToDraft }: Props) {
  const [settings, setSettings] = useState<FuzzySettings>(() => loadFuzzySettings());
  const [scope, setScope] = useState<RateSearchScope>(() => loadScope());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[] | null>(null);

  // Сохраняем настройки в localStorage при изменении
  useEffect(() => {
    saveFuzzySettings(settings);
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(QUICK_SEARCH_SCOPE_LS_KEY, scope);
    } catch {
      /* ignore */
    }
    // Сбрасываем предыдущие результаты — они относились к другой базе
    setResults(null);
  }, [scope]);

  const { loading: cacheLoading, error: cacheError, indexSize, search } = useFuseSearch(settings, scope);

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
        scope={scope}
        onScopeChange={setScope}
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
              Введите запрос и нажмите «Найти».{' '}
              {scope === 'fsnb'
                ? `В поиске участвуют только нормы ФСНБ (${indexSize > 0 ? indexSize : '—'} записей).`
                : scope === 'imported'
                ? `В поиске участвуют только корпоративные расценки 1С (${indexSize > 0 ? indexSize : '—'} записей).`
                : `В поиске участвуют ФСНБ и корпоративные расценки 1С (${indexSize > 0 ? indexSize : '—'} записей).`}
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
