/**
 * Фильтр ФСНБ v2 — whitelist конкретных norm_code.
 *
 * Источник: результаты Фазы C многоагентного кросс-маппинга корпоративных
 * кластеров работ генподрядчика многоэтажных коммерческих ЖК на нормы
 * ФСНБ-2022 (см. temp/_v2/final-whitelist.json).
 *
 * Всего ~601 уникальная норма, распределённая по 25 сборникам ГЭСН/ГЭСНм.
 * Для каждого корпоративного кластера агенты выбирали 2-8 наиболее типичных
 * норм, избегая экзотики (вечномёрзлые, морские условия, АЭС, гидротехника,
 * промышленность, магистрали, газопроводы).
 *
 * Регенерация: изменить список norm_codes и перезапустить
 *   npx tsx scripts/filter-fsnb-import.ts --profile=v2
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WHITELIST_PATH = path.join(__dirname, '..', 'temp', '_v2', 'final-whitelist.json');

interface WhitelistFile {
  version: string;
  norm_codes: string[];
}

const data = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8')) as WhitelistFile;

export const RESIDENTIAL_COMMERCIAL_V2_NORM_CODES: ReadonlySet<string> = new Set(
  data.norm_codes,
);

export const WHITELIST_STATS = {
  version: data.version,
  total: data.norm_codes.length,
};
