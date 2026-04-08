/**
 * Агрегирует matches.json из всех групп phaseC (поддерживает разные схемы).
 * Записывает temp/_v2/cross-matches.json + temp/_v2/final-whitelist.json.
 */
const fs = require('fs');
const path = require('path');

const PHASE_C_DIR = 'temp/_v2/phaseC';

function extractNormCodes(match) {
  // Возможные варианты схемы от агентов
  const out = new Set();
  const visit = v => {
    if (!v) return;
    if (typeof v === 'string' && /^\d{2}-\d{2}-\d{3}-\d{2}$/.test(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === 'object') {
      if (v.norm_code) out.add(v.norm_code);
      if (v.code && /^\d{2}-\d{2}-\d{3}-\d{2}$/.test(v.code)) out.add(v.code);
      for (const k of ['norm_codes', 'fsnb_norms', 'norms', 'matches', 'fsnb']) {
        if (v[k]) visit(v[k]);
      }
    }
  };
  visit(match);
  return [...out];
}

function flattenMatches(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Возможные контейнеры: {matches:[]}, {results:[]}, массив верхнего уровня, объект с цифр. ключами
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else if (raw.matches && Array.isArray(raw.matches)) arr = raw.matches;
  else if (raw.results && Array.isArray(raw.results)) arr = raw.results;
  else {
    // объект с числовыми ключами
    const keys = Object.keys(raw);
    if (keys.every(k => /^\d+$/.test(k))) {
      arr = keys.sort((a, b) => +a - +b).map(k => raw[k]);
    } else {
      arr = [];
    }
  }
  return arr;
}

const allNormCodes = new Set();
const allMatches = [];
const matchedClusterIds = new Set();

const groups = fs.readdirSync(PHASE_C_DIR);
for (const g of groups) {
  const file = path.join(PHASE_C_DIR, g, 'matches.json');
  if (!fs.existsSync(file)) continue;
  const arr = flattenMatches(file);
  for (const m of arr) {
    const cid = m.cluster_id || m.id || 'UNKNOWN';
    const codes = extractNormCodes(m);
    allMatches.push({ group: g, cluster_id: cid, norm_codes: codes });
    if (codes.length > 0) {
      matchedClusterIds.add(cid);
      for (const c of codes) allNormCodes.add(c);
    }
  }
}

const sorted = [...allNormCodes].sort();

fs.writeFileSync(
  'temp/_v2/cross-matches.json',
  JSON.stringify(
    {
      total_matches: allMatches.length,
      matched_clusters: matchedClusterIds.size,
      unique_norm_codes: allNormCodes.size,
      norm_codes: sorted,
      matches: allMatches,
    },
    null,
    2,
  ),
);

fs.writeFileSync(
  'temp/_v2/final-whitelist.json',
  JSON.stringify({ version: 'v2', norm_codes: sorted }, null, 2),
);

console.log('Всего matches:', allMatches.length);
console.log('Кластеров с нормами:', matchedClusterIds.size);
console.log('Уникальных norm_codes:', allNormCodes.size);
console.log('Сохранено: temp/_v2/cross-matches.json, temp/_v2/final-whitelist.json');
