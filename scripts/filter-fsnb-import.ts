/**
 * Фильтрует JSON-чанки ФСНБ-2022 по профилю RESIDENTIAL_COMMERCIAL
 * и пишет результат в temp/fsnb-import-filtered/.
 *
 * Использование:
 *   npx tsx scripts/filter-fsnb-import.ts
 *
 * Алгоритм:
 *   1. Читает все norms-*.json
 *   2. Применяет фильтр (по table_code / division_code / all)
 *   3. Собирает множество usedResourceCodes (из norms.resources[] +
 *      transitively из tg-norm-links → tech-groups.resource_codes)
 *   4. Фильтрует resources.json, tech-groups.json, tg-norm-links.json
 *   5. Rechunks нормы по 500 и записывает всё в temp/fsnb-import-filtered/
 */

import fs from 'node:fs';
import path from 'node:path';
import { RESIDENTIAL_COMMERCIAL, type CollectionFilter } from './fsnb-filter.config';

const SRC_DIR = 'temp/fsnb-import';
const DST_DIR = 'temp/fsnb-import-filtered';
const CHUNK_SIZE = 500;

interface ParsedNorm {
  norm_code: string;
  base_type: string;
  collection_code: string;
  division_code?: string;
  table_code?: string;
  resources?: Array<{ code?: string; name?: string | null; quantity?: number; measure_unit?: string | null }>;
  [k: string]: unknown;
}

interface ParsedResource {
  code: string;
  [k: string]: unknown;
}

interface ParsedTechGroup {
  tg_code: string;
  resource_codes: string[];
}

interface ParsedTgNormLink {
  tg_code: string;
  norm_code: string;
  base_type: string;
  [k: string]: unknown;
}

function matchesFilter(norm: ParsedNorm, filter: CollectionFilter | undefined): boolean {
  if (!filter) return false;
  if (filter.mode === 'all') return true;
  if (filter.mode === 'divisions') {
    return norm.division_code != null && filter.divisions.includes(norm.division_code);
  }
  if (filter.mode === 'tables') {
    return norm.table_code != null && filter.tables.includes(norm.table_code);
  }
  return false;
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Источник не найден: ${SRC_DIR}`);
    process.exit(1);
  }
  if (fs.existsSync(DST_DIR)) {
    console.log(`Очистка ${DST_DIR}...`);
    fs.rmSync(DST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DST_DIR, { recursive: true });

  // 1. Фильтруем нормы
  console.log('─ Фильтрация норм ─');
  const normFiles = fs
    .readdirSync(SRC_DIR)
    .filter(f => f.startsWith('norms-') && f.endsWith('.json'))
    .sort();

  const keptNorms: ParsedNorm[] = [];
  const byCollection: Record<string, number> = {};
  let totalRead = 0;

  for (const f of normFiles) {
    const arr = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8')) as ParsedNorm[];
    totalRead += arr.length;
    for (const n of arr) {
      const key = `${n.base_type}|${n.collection_code}`;
      const filter = RESIDENTIAL_COMMERCIAL[key];
      if (matchesFilter(n, filter)) {
        keptNorms.push(n);
        byCollection[key] = (byCollection[key] || 0) + 1;
      }
    }
  }

  console.log(`Всего прочитано: ${totalRead}`);
  console.log(`Оставлено: ${keptNorms.length}`);
  console.log('─ По сборникам ─');
  for (const [k, v] of Object.entries(byCollection).sort()) {
    console.log(`  ${v.toString().padStart(5)} ${k}`);
  }

  // Множество norm_code прошедших норм — для фильтрации tg-norm-links
  const keptNormCodes = new Set(keptNorms.map(n => n.norm_code));

  // 2. Собираем множество нужных ресурсных кодов
  console.log('\n─ Сбор ресурсов ─');
  const usedResourceCodes = new Set<string>();

  // 2a. Из ресурсного состава прошедших норм
  for (const n of keptNorms) {
    if (!n.resources) continue;
    for (const r of n.resources) {
      if (r.code) usedResourceCodes.add(r.code);
    }
  }
  console.log(`Из norms.resources: ${usedResourceCodes.size}`);

  // 2b. Через tg-norm-links: какие ТГ ссылаются на прошедшие нормы → в этих ТГ все resource_codes
  const tgNormLinks = JSON.parse(
    fs.readFileSync(path.join(SRC_DIR, 'tg-norm-links.json'), 'utf8'),
  ) as ParsedTgNormLink[];

  const keptTgCodes = new Set<string>();
  const keptLinks: ParsedTgNormLink[] = [];
  for (const lnk of tgNormLinks) {
    if (keptNormCodes.has(lnk.norm_code)) {
      keptTgCodes.add(lnk.tg_code);
      keptLinks.push(lnk);
    }
  }

  const techGroups = JSON.parse(
    fs.readFileSync(path.join(SRC_DIR, 'tech-groups.json'), 'utf8'),
  ) as ParsedTechGroup[];

  const keptTechGroups: ParsedTechGroup[] = [];
  for (const tg of techGroups) {
    if (keptTgCodes.has(tg.tg_code)) {
      keptTechGroups.push(tg);
      for (const rc of tg.resource_codes) usedResourceCodes.add(rc);
    }
  }

  console.log(`После добавления из ТГ: ${usedResourceCodes.size}`);
  console.log(`Технологических групп: ${keptTechGroups.length}`);
  console.log(`Связей ТГ↔норма: ${keptLinks.length}`);

  // 3. Фильтруем ресурсы
  const resources = JSON.parse(
    fs.readFileSync(path.join(SRC_DIR, 'resources.json'), 'utf8'),
  ) as ParsedResource[];
  const keptResources = resources.filter(r => usedResourceCodes.has(r.code));
  console.log(`\nРесурсов в исходнике: ${resources.length}`);
  console.log(`Оставлено: ${keptResources.length}`);

  // 4. Записываем всё в DST_DIR
  console.log('\n─ Запись в ' + DST_DIR + ' ─');

  // 4a. Нормы — разбиваем по base_type и чанкуем по 500
  const normsByBaseType: Record<string, ParsedNorm[]> = {};
  for (const n of keptNorms) {
    (normsByBaseType[n.base_type] ||= []).push(n);
  }
  const writtenFiles: string[] = [];
  for (const [bt, norms] of Object.entries(normsByBaseType)) {
    for (let i = 0; i < norms.length; i += CHUNK_SIZE) {
      const chunk = norms.slice(i, i + CHUNK_SIZE);
      const idx = Math.floor(i / CHUNK_SIZE) + 1;
      const fname = `norms-${bt}-chunk-${String(idx).padStart(3, '0')}.json`;
      fs.writeFileSync(path.join(DST_DIR, fname), JSON.stringify(chunk, null, 2));
      writtenFiles.push(fname);
    }
  }

  // 4b. Ресурсы, ТГ, связи
  fs.writeFileSync(path.join(DST_DIR, 'resources.json'), JSON.stringify(keptResources, null, 2));
  writtenFiles.push('resources.json');
  fs.writeFileSync(path.join(DST_DIR, 'tech-groups.json'), JSON.stringify(keptTechGroups, null, 2));
  writtenFiles.push('tech-groups.json');
  fs.writeFileSync(path.join(DST_DIR, 'tg-norm-links.json'), JSON.stringify(keptLinks, null, 2));
  writtenFiles.push('tg-norm-links.json');

  // 4c. Манифест
  const srcManifest = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'manifest.json'), 'utf8'));
  const manifest = {
    source_dir: srcManifest.source_dir,
    generated_at: new Date().toISOString(),
    filter_profile: 'residential_commercial',
    resources_count: keptResources.length,
    norms_count: keptNorms.length,
    tech_groups_count: keptTechGroups.length,
    tg_norm_links_count: keptLinks.length,
    files: ['manifest.json', ...writtenFiles.sort()],
  };
  fs.writeFileSync(path.join(DST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n✔ Готово. Итог записан в ${DST_DIR}/manifest.json`);
  console.log(`  норм: ${manifest.norms_count}`);
  console.log(`  ресурсов: ${manifest.resources_count}`);
  console.log(`  ТГ: ${manifest.tech_groups_count}`);
  console.log(`  связей ТГ↔норма: ${manifest.tg_norm_links_count}`);
}

main();
