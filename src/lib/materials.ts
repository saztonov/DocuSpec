import Fuse from 'fuse.js';
import { supabase } from './supabase';

export interface MaterialRow {
  id: string;
  name: string;
  unit: string | null;
  price: number | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialInput {
  name: string;
  unit: string | null;
  price: number | null;
}

const SELECT_FIELDS = 'id, name, unit, price, created_at, updated_at';

function mapRow(r: any): MaterialRow {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit ?? null,
    price: r.price !== null && r.price !== undefined ? Number(r.price) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function loadMaterials(search?: string): Promise<MaterialRow[]> {
  let q = supabase.from('materials').select(SELECT_FIELDS).order('name');
  const s = search?.trim();
  if (s) q = q.ilike('name', `%${s}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createMaterial(input: MaterialInput): Promise<MaterialRow> {
  const name = input.name.trim();
  if (!name) throw new Error('Название материала обязательно');
  const { data, error } = await supabase
    .from('materials')
    .insert({ name, unit: input.unit ?? null, price: input.price ?? null })
    .select(SELECT_FIELDS)
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(`Материал «${name}» уже есть в справочнике`);
    }
    throw error;
  }
  return mapRow(data);
}

export async function updateMaterial(
  id: string,
  patch: Partial<MaterialInput>,
): Promise<MaterialRow> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new Error('Название материала обязательно');
    body.name = n;
  }
  if (patch.unit !== undefined) body.unit = patch.unit;
  if (patch.price !== undefined) body.price = patch.price;
  const { data, error } = await supabase
    .from('materials')
    .update(body)
    .eq('id', id)
    .select(SELECT_FIELDS)
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error('Материал с таким названием уже существует');
    }
    throw error;
  }
  return mapRow(data);
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('materials').delete().eq('id', id);
  if (error) {
    if ((error as any).code === '23503') {
      throw new Error('Нельзя удалить: материал используется в расценках');
    }
    throw error;
  }
}

export async function findMaterialByName(name: string): Promise<MaterialRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('materials')
    .select(SELECT_FIELDS)
    .ilike('name', trimmed)
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  return row ? mapRow(row) : null;
}

export function buildMaterialFuse(items: MaterialRow[]): Fuse<MaterialRow> {
  return new Fuse(items, {
    keys: ['name'],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: false,
    minMatchCharLength: 2,
  });
}
