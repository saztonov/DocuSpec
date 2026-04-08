/**
 * Читает temp/rates3.xlsx, разбивает корпоративные расценки на 3 доменных бандла
 * для агентной кластеризации (Фаза A).
 *
 * Выход:
 *   temp/_v2/corp-bundle-1-structures.tsv    — структуры и конструктив
 *   temp/_v2/corp-bundle-2-finish.tsv        — отделка, фасад, двери
 *   temp/_v2/corp-bundle-3-engineering.tsv   — инженерка, наружка, стройплощадка
 *   temp/_v2/corp-all.json                   — полный индекс с id
 */

import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore xlsx экспорт по умолчанию
import XLSX from 'xlsx';

const SRC = 'temp/rates3.xlsx';
const DST = 'temp/_v2';

interface CorpRate {
  id: number;
  category: string;
  type: string;
  work_name: string;
  unit: string;
  base_price: number | string;
}

// Категории → бандл
const BUNDLE_MAP: Record<string, 1 | 2 | 3> = {
  'ЗЕМЛЯНЫЕ РАБОТЫ': 1,
  'УСТРОЙСТВО КОТЛОВАНА': 1,
  'МОНОЛИТНЫЕ РАБОТЫ': 1,
  'КЛАДОЧНЫЕ РАБОТЫ': 1,
  'МЕТАЛЛИЧЕСКИЕ КОНСТРУКЦИИ': 1,
  'КРОВЛЯ': 1,
  'ГИДРОИЗОЛЯЦИОННЫЕ РАБОТЫ': 1,
  'УСТРОЙСТВО ВИБРОЗАЩИТЫ': 1,

  'ОТДЕЛОЧНЫЕ РАБОТЫ': 2,
  'ОТДЕЛКА КВАРТИР MR BASE (предчистовая отделка)': 2,
  'ФАСАДНЫЕ РАБОТЫ': 2,
  'ДВЕРИ, ЛЮКИ, ВОРОТА': 2,
  'МОКАП': 2,

  'ВИС / Механические инженерные системы': 3,
  'ВИС / Электрические системы': 3,
  'ВИС / Слаботочные системы, автоматика и диспетчеризация': 3,
  'НАРУЖНИЕ ВИС / Механические инженерные системы': 3,
  'БЛАГОУСТРОЙСТВО': 3,
  'ВОДООТВЕДЕНИЕ И ВОДОПОНИЖЕНИЕ': 3,
  'Организация строительной площадки': 3,
  'ТЕХНОЛОГИЯ (ТХ)': 3,
};

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Источник не найден: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(DST, { recursive: true });

  const wb = XLSX.readFile(SRC);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const rates: CorpRate[] = [];
  let unbucketed = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const category = String(r['Категория затрат'] ?? '').trim();
    const type = String(r['Вид затрат'] ?? '').trim();
    const work_name = String(r['НАИМЕНОВАНИЕ РАБОТ'] ?? '').trim();
    const unit = String(r['Единица'] ?? '').trim();
    const base_price = (r['Расценка БАЗОВАЯ'] as number | string) ?? '';
    if (!work_name) continue;
    rates.push({ id: i + 1, category, type, work_name, unit, base_price });
  }

  // Buckets
  const buckets: Record<1 | 2 | 3, CorpRate[]> = { 1: [], 2: [], 3: [] };
  for (const r of rates) {
    const b = BUNDLE_MAP[r.category];
    if (b) {
      buckets[b].push(r);
    } else {
      unbucketed++;
      console.warn(`Unbucketed: "${r.category}" — rate id ${r.id}`);
    }
  }

  // Write TSVs
  const bundleNames = {
    1: 'corp-bundle-1-structures.tsv',
    2: 'corp-bundle-2-finish.tsv',
    3: 'corp-bundle-3-engineering.tsv',
  };

  for (const [k, name] of Object.entries(bundleNames) as Array<[string, string]>) {
    const key = Number(k) as 1 | 2 | 3;
    const lines = ['id\tcategory\ttype\twork_name\tunit'];
    for (const r of buckets[key]) {
      lines.push(`${r.id}\t${r.category}\t${r.type}\t${r.work_name}\t${r.unit}`);
    }
    fs.writeFileSync(path.join(DST, name), lines.join('\n'));
    console.log(`${name}: ${buckets[key].length} строк`);
  }

  // Full JSON index
  fs.writeFileSync(
    path.join(DST, 'corp-all.json'),
    JSON.stringify(rates, null, 2),
  );

  console.log(`\nВсего расценок: ${rates.length}, не распределено: ${unbucketed}`);
}

main();
