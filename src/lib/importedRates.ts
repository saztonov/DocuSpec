import * as XLSX from 'xlsx';
import { supabase } from './supabase';

export interface ParsedRate {
  category: string;
  type: string;
  workName: string;
  unit: string | null;
}

export interface RateCategory {
  id: string;
  name: string;
}

export interface RateType {
  id: string;
  category_id: string;
  name: string;
}

export interface RateRow {
  id: string;
  type_id: string;
  work_name: string;
  unit: string | null;
  type_name: string;
  category_id: string;
  category_name: string;
}

const HEADER_ALIASES: Record<keyof Omit<ParsedRate, 'unit'> | 'unit', string[]> = {
  category: ['категория затрат', 'категория'],
  type: ['вид затрат', 'вид'],
  workName: ['наименование работ', 'наименование'],
  unit: ['единица измерения', 'единица', 'ед. изм.', 'ед изм', 'ед.изм.'],
};

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function findColumn(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (aliases.some((a) => h === a || h.startsWith(a))) return i;
  }
  return -1;
}

export async function parseRatesXlsx(file: File): Promise<ParsedRate[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Лист не найден в файле');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('Файл пустой');

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ''));
  const idxCategory = findColumn(headers, HEADER_ALIASES.category);
  const idxType = findColumn(headers, HEADER_ALIASES.type);
  const idxWork = findColumn(headers, HEADER_ALIASES.workName);
  const idxUnit = findColumn(headers, HEADER_ALIASES.unit);

  if (idxCategory < 0 || idxType < 0 || idxWork < 0 || idxUnit < 0) {
    throw new Error(
      `Не найдены обязательные столбцы. Обнаружены заголовки: ${headers.join(' | ')}`,
    );
  }

  const out: ParsedRate[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const category = String(r[idxCategory] ?? '').trim();
    const type = String(r[idxType] ?? '').trim();
    const workName = String(r[idxWork] ?? '').trim();
    const unit = String(r[idxUnit] ?? '').trim();
    if (!category || !type || !workName) continue;
    out.push({ category, type, workName, unit: unit || null });
  }
  return out;
}

export async function importRates(rows: ParsedRate[]): Promise<{
  categories: number;
  types: number;
  rates: number;
}> {
  if (rows.length === 0) return { categories: 0, types: 0, rates: 0 };

  // 1. Категории
  const uniqCats = Array.from(new Set(rows.map((r) => r.category)));
  const { error: catErr } = await supabase
    .from('imported_rate_categories')
    .upsert(
      uniqCats.map((name) => ({ name })),
      { onConflict: 'name', ignoreDuplicates: true },
    );
  if (catErr) throw catErr;

  const { data: cats, error: catSelErr } = await supabase
    .from('imported_rate_categories')
    .select('id, name')
    .in('name', uniqCats);
  if (catSelErr) throw catSelErr;
  const catMap = new Map((cats ?? []).map((c) => [c.name, c.id]));

  // 2. Виды затрат
  const typeKeySep = '\u0001';
  const typePairs = Array.from(
    new Set(rows.map((r) => `${r.category}${typeKeySep}${r.type}`)),
  ).map((k) => {
    const [category, type] = k.split(typeKeySep);
    return { category, type };
  });

  const typePayload = typePairs.map((p) => ({
    category_id: catMap.get(p.category)!,
    name: p.type,
  }));

  const { error: typeErr } = await supabase
    .from('imported_rate_types')
    .upsert(typePayload, {
      onConflict: 'category_id,name',
      ignoreDuplicates: true,
    });
  if (typeErr) throw typeErr;

  // Выбрать id видов
  const catIdsForTypes = Array.from(new Set(typePayload.map((t) => t.category_id)));
  const { data: typesData, error: typeSelErr } = await supabase
    .from('imported_rate_types')
    .select('id, category_id, name')
    .in('category_id', catIdsForTypes);
  if (typeSelErr) throw typeSelErr;
  const typeMap = new Map(
    (typesData ?? []).map((t) => [`${t.category_id}${typeKeySep}${t.name}`, t.id]),
  );

  // 3. Расценки — порциями по 500
  const ratePayload = rows
    .map((r) => {
      const catId = catMap.get(r.category);
      if (!catId) return null;
      const typeId = typeMap.get(`${catId}${typeKeySep}${r.type}`);
      if (!typeId) return null;
      return { type_id: typeId, work_name: r.workName, unit: r.unit };
    })
    .filter((x): x is { type_id: string; work_name: string; unit: string | null } => !!x);

  // Дедуп по (type_id, work_name) — иначе upsert отдельной партии ругнётся
  const rateDedup = new Map<string, { type_id: string; work_name: string; unit: string | null }>();
  for (const r of ratePayload) {
    rateDedup.set(`${r.type_id}${typeKeySep}${r.work_name}`, r);
  }
  const rateRows = Array.from(rateDedup.values());

  const CHUNK = 500;
  for (let i = 0; i < rateRows.length; i += CHUNK) {
    const batch = rateRows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('imported_rates')
      .upsert(batch, { onConflict: 'type_id,work_name' });
    if (error) throw error;
  }

  return {
    categories: uniqCats.length,
    types: typePairs.length,
    rates: rateRows.length,
  };
}

export async function loadCategories(): Promise<RateCategory[]> {
  const { data, error } = await supabase
    .from('imported_rate_categories')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function loadTypes(categoryId?: string | null): Promise<RateType[]> {
  let q = supabase.from('imported_rate_types').select('id, category_id, name').order('name');
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function loadRates(params: {
  categoryId?: string | null;
  typeId?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: RateRow[]; total: number }> {
  const { categoryId, typeId, search, limit = 50, offset = 0 } = params;

  let q = supabase
    .from('imported_rates')
    .select(
      'id, type_id, work_name, unit, imported_rate_types!inner(id, name, category_id, imported_rate_categories!inner(id, name))',
      { count: 'exact' },
    );

  if (typeId) {
    q = q.eq('type_id', typeId);
  } else if (categoryId) {
    q = q.eq('imported_rate_types.category_id', categoryId);
  }
  if (search && search.trim()) {
    q = q.ilike('work_name', `%${search.trim()}%`);
  }

  q = q.order('work_name').range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  const rows: RateRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    type_id: r.type_id,
    work_name: r.work_name,
    unit: r.unit,
    type_name: r.imported_rate_types?.name ?? '',
    category_id: r.imported_rate_types?.category_id ?? '',
    category_name: r.imported_rate_types?.imported_rate_categories?.name ?? '',
  }));

  return { rows, total: count ?? 0 };
}
