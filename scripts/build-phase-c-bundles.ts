/**
 * Готовит входные данные для Фазы C (кросс-маппинг кластер→norm_code).
 * Группирует корпоративные кластеры и ФСНБ-нормы по сборникам.
 *
 * Выход: temp/_v2/phaseC/<group>/clusters.json + fsnb.tsv
 */

import fs from 'node:fs';
import path from 'node:path';

interface Cluster {
  id: string;
  title: string;
  description: string;
  rate_ids: number[];
  expected_fsnb_collections: string[];
  bundle?: number;
}

interface Rate {
  id: number;
  category: string;
  type: string;
  work_name: string;
  unit: string;
}

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

// Группы ФСНБ-коллекций. Ключ = имя папки. Значение = список base_type|collection_code.
const GROUPS: Record<string, string[]> = {
  'G1-earth-piles': ['ГЭСН|01', 'ГЭСН|05'],
  'G2-monolith': ['ГЭСН|06', 'ГЭСН|07'],
  'G3-masonry-metal-wood': ['ГЭСН|08', 'ГЭСН|09', 'ГЭСН|10'],
  'G4-floors-roofs-corrosion-insulation': ['ГЭСН|11', 'ГЭСН|12', 'ГЭСН|13', 'ГЭСН|26'],
  'G5-finishing': ['ГЭСН|15'],
  'G6-internal-mep': ['ГЭСН|16', 'ГЭСН|17', 'ГЭСН|18', 'ГЭСН|20', 'ГЭСН|21'],
  'G7-external-networks': ['ГЭСН|22', 'ГЭСН|23', 'ГЭСН|24'],
  'G8-outdoor-roads-greenery': ['ГЭСН|27', 'ГЭСН|34', 'ГЭСН|47'],
  'G9-lifts-pumps': ['ГЭСНм|03', 'ГЭСНм|07', 'ГЭСНм|40'],
  'G10-electrics': ['ГЭСНм|08'],
  'G11-comms-automation': ['ГЭСНм|10', 'ГЭСНм|11'],
  'G12-tech-pipes': ['ГЭСНм|12'],
};

function short(s: string, n = 180): string {
  return (s || '').replace(/\s+/g, ' ').replace(/&quot;/g, '"').slice(0, n);
}

function main() {
  const dstRoot = 'temp/_v2/phaseC';
  fs.rmSync(dstRoot, { recursive: true, force: true });
  fs.mkdirSync(dstRoot, { recursive: true });

  // 1. Load all clusters
  const clustersAll: Cluster[] = JSON.parse(
    fs.readFileSync('temp/_v2/corp-clusters.json', 'utf8'),
  ).clusters;

  // 2. Load all corp rates for lookup
  const corpAll: Rate[] = JSON.parse(fs.readFileSync('temp/_v2/corp-all.json', 'utf8'));
  const rateMap = new Map(corpAll.map(r => [r.id, r]));

  // 3. Load all FSNB norms from filtered v1
  const srcDir = 'temp/fsnb-import-filtered';
  const normFiles = fs
    .readdirSync(srcDir)
    .filter(f => f.startsWith('norms-') && f.endsWith('.json'))
    .sort();
  const normsAll: ParsedNorm[] = [];
  for (const f of normFiles) {
    const arr = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf8')) as ParsedNorm[];
    normsAll.push(...arr);
  }
  console.log(`Загружено: ${clustersAll.length} кластеров, ${normsAll.length} норм ФСНБ`);

  // 4. Для каждой группы — отбираем кластеры и нормы
  const groupKeys = Object.entries(GROUPS).map(([g, cols]) => ({ g, cols: new Set(cols) }));

  let totalClustersWritten = 0;
  let totalNormsWritten = 0;

  for (const { g, cols } of groupKeys) {
    const groupDir = path.join(dstRoot, g);
    fs.mkdirSync(groupDir, { recursive: true });

    // Clusters — те, у которых хотя бы один expected_fsnb_collections ∈ cols
    const groupClusters: Array<{
      id: string;
      title: string;
      description: string;
      rate_count: number;
      rate_samples: Array<{ id: number; work_name: string; unit: string }>;
    }> = [];

    for (const c of clustersAll) {
      if (!c.expected_fsnb_collections.some(col => cols.has(col))) continue;
      // Attach actual rate text
      const rates = c.rate_ids.map(id => rateMap.get(id)).filter(Boolean) as Rate[];
      groupClusters.push({
        id: c.id,
        title: c.title,
        description: c.description,
        rate_count: rates.length,
        rate_samples: rates.slice(0, 8).map(r => ({
          id: r.id,
          work_name: short(r.work_name, 120),
          unit: r.unit,
        })),
      });
    }

    // Normы — все из нужных сборников
    const groupNorms = normsAll.filter(n => cols.has(`${n.base_type}|${n.collection_code}`));

    // Write clusters.json
    fs.writeFileSync(
      path.join(groupDir, 'clusters.json'),
      JSON.stringify(groupClusters, null, 2),
    );

    // Write fsnb.tsv — компактный TSV
    const lines = ['norm_code\ttable_code\ttable_name\tdivision\tunit\tnorm_name'];
    for (const n of groupNorms) {
      lines.push(
        [
          n.norm_code,
          n.table_code || '',
          short(n.table_name || '', 100),
          short(n.division_name || '', 60),
          n.measure_unit || '',
          short(n.name || '', 180),
        ].join('\t'),
      );
    }
    fs.writeFileSync(path.join(groupDir, 'fsnb.tsv'), lines.join('\n'));

    console.log(
      `${g.padEnd(40)} ${groupClusters.length.toString().padStart(4)} кластеров | ${groupNorms.length.toString().padStart(5)} норм`,
    );
    totalClustersWritten += groupClusters.length;
    totalNormsWritten += groupNorms.length;
  }

  console.log(`\nИтого: ${totalClustersWritten} кластер-группа пар, ${totalNormsWritten} норм распределено`);
}

main();
