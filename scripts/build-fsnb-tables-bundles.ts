/**
 * Читает temp/fsnb-import-filtered/ (filtered v1), формирует TSV с таблицами
 * и списком всех норм внутри каждой таблицы. Делит на 3 доменных бандла
 * для агентного профилирования (Фаза B).
 *
 * Выход:
 *   temp/_v2/fsnb-bundle-1-construction.tsv  — ГЭСН 01,05,06,07,08,09,10,11,12,13,26
 *   temp/_v2/fsnb-bundle-2-finish-mep.tsv    — ГЭСН 15,16,17,18,20,21
 *   temp/_v2/fsnb-bundle-3-outdoor-mech.tsv  — ГЭСН 22,23,24,27,34,47 + все ГЭСНм
 *   temp/_v2/fsnb-all-tables.json            — полный индекс
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = 'temp/fsnb-import-filtered';
const DST_DIR = 'temp/_v2';

interface ParsedNorm {
  norm_code: string;
  base_type: string;
  collection_code: string;
  collection_name?: string;
  division_code?: string;
  division_name?: string;
  table_code?: string;
  table_name?: string;
  name?: string;
  measure_unit?: string;
}

interface TableEntry {
  key: string; // base_type|collection_code|table_code
  base_type: string;
  collection_code: string;
  collection_name: string;
  division_code: string;
  division_name: string;
  table_code: string;
  table_name: string;
  norms: Array<{ norm_code: string; name: string; unit: string }>;
}

function bundleFor(bt: string, col: string): 1 | 2 | 3 | 0 {
  if (bt === 'ГЭСН') {
    if (['01', '05', '06', '07', '08', '09', '10', '11', '12', '13', '26'].includes(col)) return 1;
    if (['15', '16', '17', '18', '20', '21'].includes(col)) return 2;
    if (['22', '23', '24', '27', '34', '47'].includes(col)) return 3;
  }
  if (bt === 'ГЭСНм') return 3;
  return 0;
}

function short(s: string, n = 140): string {
  return (s || '').replace(/\s+/g, ' ').replace(/&quot;/g, '"').slice(0, n);
}

function main() {
  fs.mkdirSync(DST_DIR, { recursive: true });

  // 1. Собираем все нормы
  const files = fs
    .readdirSync(SRC_DIR)
    .filter(f => f.startsWith('norms-') && f.endsWith('.json'))
    .sort();

  const tableMap = new Map<string, TableEntry>();
  let total = 0;

  for (const f of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8')) as ParsedNorm[];
    for (const n of arr) {
      total++;
      const key = `${n.base_type}|${n.collection_code}|${n.table_code || 'NULL'}`;
      let t = tableMap.get(key);
      if (!t) {
        t = {
          key,
          base_type: n.base_type,
          collection_code: n.collection_code,
          collection_name: short(n.collection_name || ''),
          division_code: n.division_code || '',
          division_name: short(n.division_name || '', 80),
          table_code: n.table_code || '',
          table_name: short(n.table_name || '', 160),
          norms: [],
        };
        tableMap.set(key, t);
      }
      t.norms.push({
        norm_code: n.norm_code,
        name: short(n.name || '', 200),
        unit: n.measure_unit || '',
      });
    }
  }

  const tables = Array.from(tableMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  console.log(`Всего норм: ${total}`);
  console.log(`Уникальных таблиц: ${tables.length}`);

  // 2. Bucket
  const buckets: Record<1 | 2 | 3, TableEntry[]> = { 1: [], 2: [], 3: [] };
  let unbucketed = 0;
  for (const t of tables) {
    const b = bundleFor(t.base_type, t.collection_code);
    if (b === 0) {
      unbucketed++;
      console.warn(`Unbucketed: ${t.base_type}|${t.collection_code}`);
      continue;
    }
    buckets[b].push(t);
  }

  // 3. Write TSVs — одна строка на норму (агент должен видеть каждую норму, чтобы выбрать typical)
  const bundleNames = {
    1: 'fsnb-bundle-1-construction.tsv',
    2: 'fsnb-bundle-2-finish-mep.tsv',
    3: 'fsnb-bundle-3-outdoor-mech.tsv',
  };

  for (const [k, name] of Object.entries(bundleNames) as Array<[string, string]>) {
    const key = Number(k) as 1 | 2 | 3;
    const lines = ['base_type\tcol\ttable_code\ttable_name\tnorm_code\tunit\tnorm_name'];
    for (const t of buckets[key]) {
      for (const n of t.norms) {
        lines.push(
          `${t.base_type}\t${t.collection_code}\t${t.table_code}\t${t.table_name}\t${n.norm_code}\t${n.unit}\t${n.name}`,
        );
      }
    }
    fs.writeFileSync(path.join(DST_DIR, name), lines.join('\n'));
    const normCount = buckets[key].reduce((s, t) => s + t.norms.length, 0);
    console.log(`${name}: ${buckets[key].length} таблиц, ${normCount} норм`);
  }

  // 4. JSON index
  fs.writeFileSync(
    path.join(DST_DIR, 'fsnb-all-tables.json'),
    JSON.stringify(tables, null, 2),
  );

  console.log(`\nНе распределено таблиц: ${unbucketed}`);
}

main();
