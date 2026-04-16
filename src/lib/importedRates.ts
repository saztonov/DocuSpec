import * as XLSX from 'xlsx';
import { supabase } from './supabase';

export interface ParsedRate {
  category: string;
  type: string;
  workName: string;
  unit: string | null;
  priceContract: number | null;
  priceOwn: number | null;
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

export type RateKind = 'base' | 'optional';

export interface RateRow {
  id: string;
  type_id: string;
  work_name: string;
  unit: string | null;
  price_contract: number | null;
  price_own: number | null;
  rate_type: RateKind;
  type_name: string;
  category_id: string;
  category_name: string;
  materials_count?: number;
}

export interface RateMaterialRow {
  id: string;
  rate_id: string;
  material_id: string;
  material_name: string;
  material_unit: string | null;
  material_price: number | null;
  quantity: number;
  rate_type: RateKind;
  created_at: string;
}

type HeaderKey = 'category' | 'type' | 'workName' | 'unit' | 'priceContract' | 'priceOwn';

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  category: ['категория затрат', 'категория'],
  type: ['вид затрат', 'вид'],
  workName: ['наименование работ', 'наименование'],
  unit: ['единица измерения', 'единица', 'ед. изм.', 'ед изм', 'ед.изм.'],
  priceContract: ['цена подряд', 'подряд'],
  priceOwn: ['цена собственные', 'цена собственная', 'цена собств', 'собственные'],
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

function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw * 100) / 100;
  }
  const s = String(raw)
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
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
  const idxPriceContract = findColumn(headers, HEADER_ALIASES.priceContract);
  const idxPriceOwn = findColumn(headers, HEADER_ALIASES.priceOwn);

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
    const priceContract = idxPriceContract >= 0 ? parsePrice(r[idxPriceContract]) : null;
    const priceOwn = idxPriceOwn >= 0 ? parsePrice(r[idxPriceOwn]) : null;
    out.push({
      category,
      type,
      workName,
      unit: unit || null,
      priceContract,
      priceOwn,
    });
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
  type RatePayload = {
    type_id: string;
    work_name: string;
    unit: string | null;
    price_contract: number | null;
    price_own: number | null;
  };
  const ratePayload: RatePayload[] = rows
    .map((r) => {
      const catId = catMap.get(r.category);
      if (!catId) return null;
      const typeId = typeMap.get(`${catId}${typeKeySep}${r.type}`);
      if (!typeId) return null;
      return {
        type_id: typeId,
        work_name: r.workName,
        unit: r.unit,
        price_contract: r.priceContract,
        price_own: r.priceOwn,
      } satisfies RatePayload;
    })
    .filter((x): x is RatePayload => !!x);

  // Дедуп по (type_id, work_name) — иначе upsert отдельной партии ругнётся
  const rateDedup = new Map<string, RatePayload>();
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
}): Promise<{ rows: RateRow[]; total: number }> {
  const { categoryId, typeId, search } = params;

  let q = supabase
    .from('imported_rates')
    .select(
      'id, type_id, work_name, unit, price_contract, price_own, rate_type, imported_rate_types!inner(id, name, category_id, imported_rate_categories!inner(id, name))',
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

  q = q.order('work_name');

  const { data, error, count } = await q;
  if (error) throw error;

  const rows: RateRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    type_id: r.type_id,
    work_name: r.work_name,
    unit: r.unit,
    price_contract: r.price_contract !== null ? Number(r.price_contract) : null,
    price_own: r.price_own !== null ? Number(r.price_own) : null,
    rate_type: (r.rate_type ?? 'base') as RateKind,
    type_name: r.imported_rate_types?.name ?? '',
    category_id: r.imported_rate_types?.category_id ?? '',
    category_name: r.imported_rate_types?.imported_rate_categories?.name ?? '',
  }));

  return { rows, total: count ?? 0 };
}

export interface RateCategoryNode {
  id: string;
  name: string;
  types_count: number;
}

export interface RateTypeNode {
  id: string;
  category_id: string;
  name: string;
  rates_count: number;
}

export async function loadCategoriesWithCounts(): Promise<RateCategoryNode[]> {
  const { data, error } = await supabase
    .from('imported_rate_categories')
    .select('id, name, imported_rate_types(count)')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    types_count: c.imported_rate_types?.[0]?.count ?? 0,
  }));
}

export async function loadTypesWithCounts(categoryId: string): Promise<RateTypeNode[]> {
  const { data, error } = await supabase
    .from('imported_rate_types')
    .select('id, category_id, name, imported_rates(count)')
    .eq('category_id', categoryId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    id: t.id,
    category_id: t.category_id,
    name: t.name,
    rates_count: t.imported_rates?.[0]?.count ?? 0,
  }));
}

export async function loadRatesByType(typeId: string): Promise<RateRow[]> {
  const { data, error } = await supabase
    .from('imported_rates')
    .select(
      'id, type_id, work_name, unit, price_contract, price_own, rate_type, imported_rate_materials(count), imported_rate_types!inner(id, name, category_id, imported_rate_categories!inner(id, name))',
    )
    .eq('type_id', typeId)
    .order('work_name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    type_id: r.type_id,
    work_name: r.work_name,
    unit: r.unit,
    price_contract: r.price_contract !== null ? Number(r.price_contract) : null,
    price_own: r.price_own !== null ? Number(r.price_own) : null,
    rate_type: (r.rate_type ?? 'base') as RateKind,
    type_name: r.imported_rate_types?.name ?? '',
    category_id: r.imported_rate_types?.category_id ?? '',
    category_name: r.imported_rate_types?.imported_rate_categories?.name ?? '',
    materials_count: r.imported_rate_materials?.[0]?.count ?? 0,
  }));
}

export interface ImportedRateInput {
  type_id: string;
  work_name: string;
  unit: string | null;
  price_contract: number | null;
  price_own: number | null;
  rate_type?: RateKind;
}

export async function createImportedRate(input: ImportedRateInput): Promise<RateRow> {
  const { data, error } = await supabase
    .from('imported_rates')
    .insert({
      type_id: input.type_id,
      work_name: input.work_name,
      unit: input.unit,
      price_contract: input.price_contract,
      price_own: input.price_own,
      rate_type: input.rate_type ?? 'base',
    })
    .select(
      'id, type_id, work_name, unit, price_contract, price_own, rate_type, imported_rate_types!inner(id, name, category_id, imported_rate_categories!inner(id, name))',
    )
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      throw new Error('Расценка с таким наименованием уже есть в этом виде затрат.');
    }
    throw error;
  }
  const r: any = data;
  return {
    id: r.id,
    type_id: r.type_id,
    work_name: r.work_name,
    unit: r.unit,
    price_contract: r.price_contract !== null ? Number(r.price_contract) : null,
    price_own: r.price_own !== null ? Number(r.price_own) : null,
    rate_type: (r.rate_type ?? 'base') as RateKind,
    type_name: r.imported_rate_types?.name ?? '',
    category_id: r.imported_rate_types?.category_id ?? '',
    category_name: r.imported_rate_types?.imported_rate_categories?.name ?? '',
  };
}

export async function deleteImportedRate(id: string): Promise<void> {
  const { error } = await supabase.from('imported_rates').delete().eq('id', id);
  if (error) throw error;
}

export async function createCategory(name: string): Promise<RateCategory> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Название категории обязательно');
  const { data, error } = await supabase
    .from('imported_rate_categories')
    .insert({ name: trimmed })
    .select('id, name')
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(`Категория «${trimmed}» уже существует`);
    }
    throw error;
  }
  return data as RateCategory;
}

export async function updateCategoryName(id: string, name: string): Promise<RateCategory> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Название категории обязательно');
  const { data, error } = await supabase
    .from('imported_rate_categories')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name')
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(`Категория «${trimmed}» уже существует`);
    }
    throw error;
  }
  return data as RateCategory;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('imported_rate_categories').delete().eq('id', id);
  if (error) {
    if ((error as any).code === '23503') {
      throw new Error('Нельзя удалить категорию: в ней есть виды затрат');
    }
    throw error;
  }
}

export async function createType(categoryId: string, name: string): Promise<RateType> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Название вида затрат обязательно');
  const { data, error } = await supabase
    .from('imported_rate_types')
    .insert({ category_id: categoryId, name: trimmed })
    .select('id, category_id, name')
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(`Вид «${trimmed}» уже существует в этой категории`);
    }
    throw error;
  }
  return data as RateType;
}

export async function updateTypeName(id: string, name: string): Promise<RateType> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Название вида затрат обязательно');
  const { data, error } = await supabase
    .from('imported_rate_types')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, category_id, name')
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(`Вид «${trimmed}» уже существует в этой категории`);
    }
    throw error;
  }
  return data as RateType;
}

export async function deleteType(id: string): Promise<void> {
  const { error } = await supabase.from('imported_rate_types').delete().eq('id', id);
  if (error) {
    if ((error as any).code === '23503') {
      throw new Error('Нельзя удалить вид: в нём есть расценки');
    }
    throw error;
  }
}

export type ImportedRatePatch = Partial<
  Pick<ImportedRateInput, 'work_name' | 'unit' | 'price_contract' | 'price_own' | 'rate_type'>
>;

export async function updateImportedRate(id: string, patch: ImportedRatePatch): Promise<RateRow> {
  const { data, error } = await supabase
    .from('imported_rates')
    .update(patch)
    .eq('id', id)
    .select(
      'id, type_id, work_name, unit, price_contract, price_own, rate_type, imported_rate_types!inner(id, name, category_id, imported_rate_categories!inner(id, name))',
    )
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      throw new Error('Расценка с таким наименованием уже есть в этом виде затрат.');
    }
    throw error;
  }
  const r: any = data;
  return {
    id: r.id,
    type_id: r.type_id,
    work_name: r.work_name,
    unit: r.unit,
    price_contract: r.price_contract !== null ? Number(r.price_contract) : null,
    price_own: r.price_own !== null ? Number(r.price_own) : null,
    rate_type: (r.rate_type ?? 'base') as RateKind,
    type_name: r.imported_rate_types?.name ?? '',
    category_id: r.imported_rate_types?.category_id ?? '',
    category_name: r.imported_rate_types?.imported_rate_categories?.name ?? '',
  };
}

// ── Материалы, привязанные к расценке ─────────────────────────────────────

const RATE_MATERIAL_SELECT =
  'id, rate_id, material_id, quantity, rate_type, created_at, materials!inner(id, name, unit, price)';

function mapRateMaterial(r: any): RateMaterialRow {
  const m = r.materials ?? {};
  return {
    id: r.id,
    rate_id: r.rate_id,
    material_id: r.material_id,
    material_name: m.name ?? '',
    material_unit: m.unit ?? null,
    material_price:
      m.price !== null && m.price !== undefined ? Number(m.price) : null,
    quantity: r.quantity !== null && r.quantity !== undefined ? Number(r.quantity) : 0,
    rate_type: (r.rate_type ?? 'base') as RateKind,
    created_at: r.created_at,
  };
}

export async function loadRateMaterials(rateId: string): Promise<RateMaterialRow[]> {
  const { data, error } = await supabase
    .from('imported_rate_materials')
    .select(RATE_MATERIAL_SELECT)
    .eq('rate_id', rateId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(mapRateMaterial);
}

export interface RateMaterialInput {
  rate_id: string;
  material_id: string;
  quantity: number;
  rate_type: RateKind;
}

export async function addRateMaterial(input: RateMaterialInput): Promise<RateMaterialRow> {
  const { data, error } = await supabase
    .from('imported_rate_materials')
    .insert({
      rate_id: input.rate_id,
      material_id: input.material_id,
      quantity: input.quantity,
      rate_type: input.rate_type,
    })
    .select(RATE_MATERIAL_SELECT)
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error('Этот материал уже привязан к расценке');
    }
    throw error;
  }
  return mapRateMaterial(data);
}

export type RateMaterialPatch = Partial<Pick<RateMaterialInput, 'quantity' | 'rate_type'>>;

export async function updateRateMaterial(
  id: string,
  patch: RateMaterialPatch,
): Promise<RateMaterialRow> {
  const { data, error } = await supabase
    .from('imported_rate_materials')
    .update(patch)
    .eq('id', id)
    .select(RATE_MATERIAL_SELECT)
    .single();
  if (error) throw error;
  return mapRateMaterial(data);
}

export async function removeRateMaterial(id: string): Promise<void> {
  const { error } = await supabase
    .from('imported_rate_materials')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
