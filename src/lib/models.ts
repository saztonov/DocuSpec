export interface ModelOption {
  value: string;
  label: string;
}

export function getAvailableModels(): ModelOption[] {
  const envKeys = [
    'VITE_OPENROUTER_MODEL',
    'VITE_OPENROUTER_MODEL2',
    'VITE_OPENROUTER_MODEL3',
    'VITE_OPENROUTER_MODEL4',
  ] as const;

  const models: ModelOption[] = [];

  for (const key of envKeys) {
    const val = import.meta.env[key] as string | undefined;
    if (val) {
      const label = val.includes('/') ? val.split('/').pop()! : val;
      models.push({ value: val, label });
    }
  }

  return models;
}
