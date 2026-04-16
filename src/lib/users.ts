import { supabase, supabaseSignup } from './supabase';

export type UserRole = 'admin' | 'user';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export async function loadUsers(includeDeleted = false): Promise<UserProfile[]> {
  let q = supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (!includeDeleted) q = q.eq('is_deleted', false);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as UserProfile[];
}

export async function updateUserProfile(
  id: string,
  patch: Partial<Pick<UserProfile, 'full_name' | 'role'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setUserActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function softDeleteUser(id: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function restoreUser(id: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_deleted: false })
    .eq('id', id);
  if (error) throw error;
}

export interface CreateUserAsAdminInput {
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
}

// Создаёт пользователя через изолированный signUp-клиент, чтобы не разлогинить
// текущего администратора. После signUp апдейтит profile (роль, активацию, ФИО).
export async function createUserAsAdmin(input: CreateUserAsAdminInput): Promise<UserProfile> {
  const { data, error } = await supabaseSignup.auth.signUp({
    email: input.email,
    password: input.password,
  });
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Не удалось создать пользователя: signUp не вернул user.id');

  // Изолированная сессия больше не нужна — гарантированно очищаем.
  await supabaseSignup.auth.signOut();

  // Триггер handle_new_auth_user уже создал черновую запись. Доводим до нужного состояния.
  const { data: updated, error: upErr } = await supabase
    .from('profiles')
    .update({
      role: input.role,
      is_active: true,
      full_name: input.full_name ?? null,
    })
    .eq('id', userId)
    .select()
    .single();
  if (upErr) throw upErr;
  return updated as UserProfile;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw error;
}
