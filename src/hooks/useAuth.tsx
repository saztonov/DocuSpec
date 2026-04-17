import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { App as AntApp } from 'antd';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../lib/users';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateOwnPassword: (newPassword: string) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type ProfileFetchResult =
  | { ok: true; profile: UserProfile | null }
  | { ok: false; error: unknown };

// Ретраим при исключениях / ошибках запроса. Различаем «запрос прошёл, профиля нет»
// (profile = null, ok: true) и «запрос не удался» (ok: false) — второе не должно разлогинивать.
async function fetchProfileWithRetry(userId: string, attempts = 3): Promise<ProfileFetchResult> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        lastError = error;
      } else {
        return { ok: true, profile: (data ?? null) as UserProfile | null };
      }
    } catch (err) {
      lastError = err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)));
    }
  }
  return { ok: false, error: lastError };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const { message } = AntApp.useApp();

  // Защита от двойной обработки одной и той же сессии (StrictMode + onAuthStateChange).
  const lastHandledUserIdRef = useRef<string | null>(null);

  // onProfileError='keep' — при сетевой ошибке оставить сессию (восстановление после hard-reload).
  // 'signout' — при сетевой ошибке сбросить сессию и бросить (явный signIn).
  const applySession = useCallback(
    async (next: Session | null, onProfileError: 'keep' | 'signout' = 'keep'): Promise<void> => {
      setSession(next);
      if (!next?.user) {
        setProfile(null);
        setProfileLoading(false);
        lastHandledUserIdRef.current = null;
        return;
      }
      if (lastHandledUserIdRef.current === next.user.id) return;
      lastHandledUserIdRef.current = next.user.id;

      setProfileLoading(true);
      const res = await fetchProfileWithRetry(next.user.id);
      if (!res.ok) {
        setProfileLoading(false);
        if (onProfileError === 'signout') {
          await supabase.auth.signOut();
          throw new Error('Не удалось загрузить профиль. Проверьте соединение и попробуйте снова.');
        }
        console.warn('Profile load failed after retries', res.error);
        message.warning('Не удалось загрузить профиль. Обновите страницу.', 4);
        return;
      }

      const prof = res.profile;
      if (!prof) {
        setProfileLoading(false);
        await supabase.auth.signOut();
        throw new Error('Профиль пользователя не найден. Обратитесь к администратору.');
      }
      if (prof.is_deleted) {
        setProfileLoading(false);
        await supabase.auth.signOut();
        throw new Error('Учётная запись отключена.');
      }
      if (!prof.is_active) {
        setProfileLoading(false);
        await supabase.auth.signOut();
        throw new Error('Учётная запись ожидает активации администратором.');
      }
      setProfile(prof);
      setProfileLoading(false);
    },
    [message],
  );

  useEffect(() => {
    let mounted = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        return applySession(data.session, 'keep');
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void applySession(next, 'keep').catch((err) => {
        console.error(err);
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // applySession бросит исключение, если is_active=false / is_deleted=true / сетевой сбой.
      lastHandledUserIdRef.current = null;
      await applySession(data.session, 'signout');
    },
    [applySession],
  );

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // После signUp Supabase автоматически логинит пользователя — у него
    // is_active=false, поэтому applySession сделает signOut. Это ожидаемо:
    // регистрация = заявка, активирует админ.
    await supabase.auth.signOut();
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
    setProfileLoading(false);
    lastHandledUserIdRef.current = null;
  }, []);

  const updateOwnPassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const res = await fetchProfileWithRetry(session.user.id);
    if (res.ok) setProfile(res.profile);
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      signIn,
      signUp,
      signOut,
      updateOwnPassword,
      resetPasswordForEmail,
      refreshProfile,
    }),
    [session, profile, loading, profileLoading, signIn, signUp, signOut, updateOwnPassword, resetPasswordForEmail, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
