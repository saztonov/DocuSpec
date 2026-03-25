#!/usr/bin/env npx tsx
/**
 * ФСНБ-2022 XML → JSON конвертер
 *
 * Парсит XML-файлы ФСНБ-2022 (ГЭСН, ФСБЦ, ТГ) и сохраняет JSON-чанки
 * для последующего импорта в Supabase через браузерное приложение.
 *
 * Использование:
 *   npx tsx scripts/fsnb-xml-to-json.ts [путь_к_папке_ФСНБ]
 *
 * По умолчанию ищет последнюю версию в C:\Users\Usr\claudeprojects\ФСНБ-22\
 *
 * Зависимости (установить перед запуском):
 *   npm install fast-xml-parser
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { XMLParser } from 'fast-xml-parser';

// ── Типы ──────────────────────────────────────────────────────

interface ParsedResource {
  code: string;
  name: string;
  measure_unit: string | null;
  resource_type: 'material' | 'equipment' | 'machine' | 'labor';
  book_code: string | null;
  book_name: string | null;
  part_code: string | null;
  part_name: string | null;
  section_code: string | null;
  section_name: string | null;
  group_code: string | null;
  group_name: string | null;
  base_price: number | null;
  opt_price: number | null;
  salary_mach: number | null;
  labour_mach: number | null;
  price_without_salary: number | null;
  machinist_category: number | null;
  search_text: string;
}

interface ParsedNormResource {
  code: string;
  name: string | null;
  quantity: number | null;
  measure_unit: string | null;
}

interface ParsedNorm {
  norm_code: string;
  base_type: string;
  name: string;
  begin_name: string | null;
  end_name: string | null;
  measure_unit: string;
  collection_code: string | null;
  collection_name: string | null;
  division_code: string | null;
  division_name: string | null;
  table_code: string | null;
  table_name: string | null;
  resources: ParsedNormResource[];
  search_text: string;
}

interface ParsedTechGroup {
  tg_code: string;
  resource_codes: string[];
}

interface ParsedTgNormLink {
  tg_code: string;
  norm_code: string;
  base_type: string;
  abstract_resource_code: string | null;
  abstract_resource_name: string | null;
  abstract_resource_unit: string | null;
}

// ── Утилиты ───────────────────────────────────────────────────

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function parseNum(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function buildSearchText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' | ');
}

function writeChunked(outDir: string, prefix: string, data: unknown[], chunkSize: number): number {
  let chunkIdx = 1;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const filename = `${prefix}-chunk-${String(chunkIdx).padStart(3, '0')}.json`;
    writeFileSync(join(outDir, filename), JSON.stringify(chunk, null, 2), 'utf-8');
    chunkIdx++;
  }
  return chunkIdx - 1;
}

// ── Парсинг ФСБЦ (материалы и оборудование) ──────────────────

function parseFsbcResources(xmlPath: string, resourceType: 'material' | 'machine'): ParsedResource[] {
  console.log(`  Чтение ${basename(xmlPath)}...`);
  const xml = readFileSync(xmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['Section', 'Resource', 'ResourceCategory'].includes(name),
    processEntities: false,
    htmlEntities: true,
  });
  const doc = parser.parse(xml);
  const resources: ParsedResource[] = [];

  const categories = toArray(doc?.ResourceCatalog?.ResourcesDirectory?.ResourceCategory);

  interface HierarchyCtx {
    bookCode: string | null; bookName: string | null;
    partCode: string | null; partName: string | null;
    sectionCode: string | null; sectionName: string | null;
    groupCode: string | null; groupName: string | null;
  }

  function walkSections(sections: any[], ctx: HierarchyCtx, depth: number): void {
    for (const sec of sections) {
      const sType = (sec['@_Type'] || '').toLowerCase();
      const sCode = sec['@_Code'] || null;
      const sName = sec['@_Name'] || null;

      const newCtx = { ...ctx };
      if (sType.includes('книга') || sType === 'книга') {
        newCtx.bookCode = sCode; newCtx.bookName = sName;
      } else if (sType.includes('часть') || sType === 'часть') {
        newCtx.partCode = sCode; newCtx.partName = sName;
      } else if (sType.includes('раздел') || sType === 'раздел') {
        newCtx.sectionCode = sCode; newCtx.sectionName = sName;
      } else if (sType.includes('группа') || sType === 'группа') {
        newCtx.groupCode = sCode; newCtx.groupName = sName;
      } else if (depth === 0) {
        newCtx.bookCode = sCode; newCtx.bookName = sName;
      } else if (depth === 1) {
        newCtx.partCode = sCode; newCtx.partName = sName;
      } else if (depth === 2) {
        newCtx.sectionCode = sCode; newCtx.sectionName = sName;
      } else {
        newCtx.groupCode = sCode; newCtx.groupName = sName;
      }

      // Извлечь ресурсы на текущем уровне
      const resItems = toArray(sec?.Resource);
      for (const res of resItems) {
        const code = res['@_Code'];
        const name = res['@_Name'];
        if (!code || !name) continue;

        const price = res?.Prices?.Price;

        resources.push({
          code,
          name,
          measure_unit: res['@_MeasureUnit'] || null,
          resource_type: resourceType,
          book_code: newCtx.bookCode,
          book_name: newCtx.bookName,
          part_code: newCtx.partCode,
          part_name: newCtx.partName,
          section_code: newCtx.sectionCode,
          section_name: newCtx.sectionName,
          group_code: newCtx.groupCode,
          group_name: newCtx.groupName,
          base_price: parseNum(price?.['@_Cost']),
          opt_price: parseNum(price?.['@_OptCost']),
          salary_mach: resourceType === 'machine' ? parseNum(price?.['@_SalaryMach']) : null,
          labour_mach: resourceType === 'machine' ? parseNum(price?.['@_LabourMach']) : null,
          price_without_salary: resourceType === 'machine' ? parseNum(price?.['@_PriceCostWithoutSalary']) : null,
          machinist_category: resourceType === 'machine' ? parseNum(price?.['@_MachinistCategory']) : null,
          search_text: buildSearchText([
            code, newCtx.bookName, newCtx.partName, newCtx.sectionName, newCtx.groupName,
            name, res['@_MeasureUnit'],
          ]),
        });
      }

      // Рекурсия в дочерние секции
      const childSections = toArray(sec?.Section);
      if (childSections.length > 0) {
        walkSections(childSections, newCtx, depth + 1);
      }
    }
  }

  for (const category of categories) {
    const topSections = toArray(category?.Section);
    walkSections(topSections, {
      bookCode: null, bookName: null, partCode: null, partName: null,
      sectionCode: null, sectionName: null, groupCode: null, groupName: null,
    }, 0);
  }

  console.log(`  → ${resources.length} ресурсов`);
  return resources;
}

// ── Парсинг ГЭСН (нормы) ─────────────────────────────────────

function parseGesnNorms(xmlPath: string, baseType: string): ParsedNorm[] {
  console.log(`  Чтение ${basename(xmlPath)} (${(readFileSync(xmlPath).length / 1024 / 1024).toFixed(1)} МБ)...`);
  const xml = readFileSync(xmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['Section', 'Work', 'Resource', 'NameGroup', 'Item'].includes(name),
    processEntities: false,
    htmlEntities: true,
  });
  const doc = parser.parse(xml);
  const norms: ParsedNorm[] = [];

  const categories = toArray(doc?.base?.ResourcesDirectory?.ResourceCategory);

  for (const category of categories) {
    walkGesnSections(toArray(category?.Section), baseType, norms, {
      collectionCode: null,
      collectionName: null,
      divisionCode: null,
      divisionName: null,
      tableCode: null,
      tableName: null,
    });
  }

  console.log(`  → ${norms.length} норм`);
  return norms;
}

interface GesnContext {
  collectionCode: string | null;
  collectionName: string | null;
  divisionCode: string | null;
  divisionName: string | null;
  tableCode: string | null;
  tableName: string | null;
}

function walkGesnSections(sections: any[], baseType: string, norms: ParsedNorm[], ctx: GesnContext): void {
  for (const section of sections) {
    const sType = section['@_Type'] || '';
    const sCode = section['@_Code'] || '';
    const sName = section['@_Name'] || '';

    const newCtx = { ...ctx };

    if (sType === 'Сборник') {
      newCtx.collectionCode = sCode;
      newCtx.collectionName = sName;
    } else if (sType === 'Раздел' || sType === 'Подраздел') {
      newCtx.divisionCode = sCode;
      newCtx.divisionName = sName;
    } else if (sType === 'Таблица') {
      newCtx.tableCode = sCode;
      newCtx.tableName = sName;
    }

    // Обработка NameGroup → Work
    const nameGroups = toArray(section?.NameGroup);
    for (const ng of nameGroups) {
      const beginName = ng['@_BeginName'] || '';
      const works = toArray(ng?.Work);
      for (const work of works) {
        const norm = parseWork(work, baseType, beginName, newCtx);
        if (norm) norms.push(norm);
      }
    }

    // Прямые Work (без NameGroup)
    const directWorks = toArray(section?.Work);
    for (const work of directWorks) {
      const norm = parseWork(work, baseType, null, newCtx);
      if (norm) norms.push(norm);
    }

    // Рекурсия в дочерние секции
    const childSections = toArray(section?.Section);
    if (childSections.length > 0) {
      walkGesnSections(childSections, baseType, norms, newCtx);
    }
  }
}

function parseWork(work: any, baseType: string, beginName: string | null, ctx: GesnContext): ParsedNorm | null {
  const code = work['@_Code'];
  if (!code) return null;

  const endName = work['@_EndName'] || '';
  const measureUnit = work['@_MeasureUnit'] || '';

  const fullName = beginName
    ? `${beginName} ${endName}`.trim()
    : endName;

  const resources: ParsedNormResource[] = [];
  const resItems = toArray(work?.Resources?.Resource);
  for (const res of resItems) {
    resources.push({
      code: res['@_Code'] || '',
      name: res['@_EndName'] || null,
      quantity: parseNum(res['@_Quantity']),
      measure_unit: res['@_MeasureUnit'] || null,
    });
  }

  const resourceNames = resources
    .filter(r => r.name)
    .slice(0, 5)
    .map(r => r.name)
    .join(', ');

  return {
    norm_code: code,
    base_type: baseType,
    name: fullName || code,
    begin_name: beginName,
    end_name: endName || null,
    measure_unit: measureUnit,
    collection_code: ctx.collectionCode,
    collection_name: ctx.collectionName,
    division_code: ctx.divisionCode,
    division_name: ctx.divisionName,
    table_code: ctx.tableCode,
    table_name: ctx.tableName,
    resources,
    search_text: buildSearchText([
      `${baseType} ${code}`,
      ctx.collectionName,
      ctx.divisionName,
      fullName,
      measureUnit,
      resourceNames ? `Ресурсы: ${resourceNames}` : null,
    ]),
  };
}

// ── Парсинг ТГ (технологические группы) ───────────────────────

function parseTechGroups(xmlPath: string): ParsedTechGroup[] {
  console.log(`  Чтение ${basename(xmlPath)}...`);
  const xml = readFileSync(xmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['TechnologyGroup', 'Resource'].includes(name),
  });
  const doc = parser.parse(xml);
  const groups: ParsedTechGroup[] = [];

  const bases = toArray(doc?.NewDataSet?.base);
  for (const base of bases) {
    const tgs = toArray(base?.TechnologyGroup);
    for (const tg of tgs) {
      const code = tg['@_Code'];
      if (!code) continue;

      const resCodes: string[] = [];
      const resources = toArray(tg?.Resource);
      for (const res of resources) {
        const rc = res['@_Code'];
        if (rc) resCodes.push(rc);
      }

      groups.push({ tg_code: code, resource_codes: resCodes });
    }
  }

  console.log(`  → ${groups.length} ТГ`);
  return groups;
}

// ── Парсинг Ключей перехода ТГ ────────────────────────────────

function parseTgNormLinks(xmlPath: string): ParsedTgNormLink[] {
  console.log(`  Чтение ${basename(xmlPath)}...`);
  const xml = readFileSync(xmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['TechnologyGroup', 'Work', 'AbstractResource'].includes(name),
  });
  const doc = parser.parse(xml);
  const links: ParsedTgNormLink[] = [];

  const bases = toArray(doc?.NewDataSet?.base);
  for (const base of bases) {
    const tgs = toArray(base?.TechnologyGroup);
    for (const tg of tgs) {
      const tgCode = tg['@_Code'];
      if (!tgCode) continue;

      const works = toArray(tg?.Work);
      for (const work of works) {
        const normCode = work['@_Code'];
        const baseType = work['@_BaseType'] || 'ГЭСН';
        if (!normCode) continue;

        // AbstractResource может быть один или массив
        const absResources = toArray(work?.AbstractResource);
        if (absResources.length > 0) {
          for (const ar of absResources) {
            links.push({
              tg_code: tgCode,
              norm_code: normCode,
              base_type: baseType,
              abstract_resource_code: ar['@_Code'] || null,
              abstract_resource_name: ar['@_Name'] || null,
              abstract_resource_unit: ar['@_MeasureUnit'] || null,
            });
          }
        } else {
          links.push({
            tg_code: tgCode,
            norm_code: normCode,
            base_type: baseType,
            abstract_resource_code: null,
            abstract_resource_name: null,
            abstract_resource_unit: null,
          });
        }
      }
    }
  }

  console.log(`  → ${links.length} связей ТГ↔норма`);
  return links;
}

// ── Главная функция ───────────────────────────────────────────

function main(): void {
  const defaultBase = 'C:\\Users\\Usr\\claudeprojects\\ФСНБ-22';
  let sourceDir = process.argv[2];

  if (!sourceDir) {
    // Найти последнюю версию по дате в имени папки
    if (!existsSync(defaultBase)) {
      console.error(`Папка ${defaultBase} не найдена. Укажите путь как аргумент.`);
      process.exit(1);
    }
    const dirs = readdirSync(defaultBase).filter(d => d.startsWith('ФСНБ-2022'));
    if (dirs.length === 0) {
      console.error('Не найдены папки ФСНБ-2022');
      process.exit(1);
    }
    // Найти папку с максимальной датой в имени (формат ДД.ММ.ГГГГ)
    const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})/;
    dirs.sort((a, b) => {
      const ma = a.match(dateRegex);
      const mb = b.match(dateRegex);
      if (!ma || !mb) return a.localeCompare(b);
      const da = new Date(+ma[3], +ma[2] - 1, +ma[1]);
      const db = new Date(+mb[3], +mb[2] - 1, +mb[1]);
      return da.getTime() - db.getTime();
    });
    sourceDir = join(defaultBase, dirs[dirs.length - 1]);
  }

  console.log(`\n=== ФСНБ-2022 XML → JSON ===`);
  console.log(`Источник: ${sourceDir}\n`);

  const outDir = join(process.cwd(), 'temp', 'fsnb-import');
  mkdirSync(outDir, { recursive: true });
  console.log(`Выход: ${outDir}\n`);

  const CHUNK_SIZE = 1000;

  // 1. ФСБЦ: Материалы и оборудование
  console.log('1. ФСБЦ Материалы и оборудование');
  const matPath = join(sourceDir, 'ФСБЦ_Мат&Оборуд.xml');
  const materials = existsSync(matPath)
    ? parseFsbcResources(matPath, 'material')
    : (console.warn('  ⚠ Файл не найден'), []);

  // 2. ФСБЦ: Машины
  console.log('2. ФСБЦ Машины');
  const machPath = join(sourceDir, 'ФСБЦ_Маш.xml');
  const machines = existsSync(machPath)
    ? parseFsbcResources(machPath, 'machine')
    : (console.warn('  ⚠ Файл не найден'), []);

  // Объединяем ресурсы
  const allResources = [...materials, ...machines];
  writeFileSync(join(outDir, 'resources.json'), JSON.stringify(allResources, null, 2), 'utf-8');
  console.log(`  Итого ресурсов: ${allResources.length}\n`);

  // 3. ГЭСН
  const gesnFiles: { file: string; baseType: string }[] = [
    { file: 'ГЭСН.xml', baseType: 'ГЭСН' },
    { file: 'ГЭСНм.xml', baseType: 'ГЭСНм' },
    { file: 'ГЭСНр.xml', baseType: 'ГЭСНр' },
    { file: 'ГЭСНп.xml', baseType: 'ГЭСНп' },
    { file: 'ГЭСНмр.xml', baseType: 'ГЭСНмр' },
  ];

  let totalNorms = 0;
  for (const { file, baseType } of gesnFiles) {
    const filePath = join(sourceDir, file);
    if (!existsSync(filePath)) {
      console.log(`3. ${file} — не найден, пропуск`);
      continue;
    }

    console.log(`3. ${file}`);
    try {
      const norms = parseGesnNorms(filePath, baseType);
      const chunks = writeChunked(outDir, `norms-${baseType}`, norms, CHUNK_SIZE);
      console.log(`  → ${chunks} чанков по ${CHUNK_SIZE}\n`);
      totalNorms += norms.length;
    } catch (err) {
      console.error(`  ❌ Ошибка парсинга ${file}:`, err instanceof Error ? err.message : err);
      console.log('  Попытка чтения может требовать больше памяти. Запустите с --max-old-space-size=4096\n');
    }
  }
  console.log(`  Итого норм: ${totalNorms}\n`);

  // 4. ТГ
  console.log('4. База ТГ');
  const tgPath = join(sourceDir, 'База ТГ.xml');
  const techGroups = existsSync(tgPath)
    ? parseTechGroups(tgPath)
    : (console.warn('  ⚠ Файл не найден'), []);
  writeFileSync(join(outDir, 'tech-groups.json'), JSON.stringify(techGroups, null, 2), 'utf-8');

  // 5. Ключи перехода ТГ
  console.log('5. Ключи перехода ТГ');
  const tgLinksPath = join(sourceDir, 'Ключи перехода ТГ.xml');
  const tgLinks = existsSync(tgLinksPath)
    ? parseTgNormLinks(tgLinksPath)
    : (console.warn('  ⚠ Файл не найден'), []);
  writeFileSync(join(outDir, 'tg-norm-links.json'), JSON.stringify(tgLinks, null, 2), 'utf-8');

  // Итоговый манифест
  const manifest = {
    source_dir: sourceDir,
    generated_at: new Date().toISOString(),
    resources_count: allResources.length,
    norms_count: totalNorms,
    tech_groups_count: techGroups.length,
    tg_norm_links_count: tgLinks.length,
    files: readdirSync(outDir).filter(f => f.endsWith('.json')),
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\n=== Готово ===');
  console.log(`Ресурсов: ${allResources.length}`);
  console.log(`Норм: ${totalNorms}`);
  console.log(`ТГ: ${techGroups.length}`);
  console.log(`Связей ТГ↔норма: ${tgLinks.length}`);
  console.log(`Файлов: ${manifest.files.length}`);
  console.log(`Папка: ${outDir}`);
}

main();
