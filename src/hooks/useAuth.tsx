import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../lib/users';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateOwnPassword: (newPassword: string) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as UserProfile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Защита от двойной обработки одной и той же сессии (StrictMode + onAuthStateChange).
  const lastHandledUserIdRef = useRef<string | null>(null);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next?.user) {
      setProfile(null);
      lastHandledUserIdRef.current = null;
      return;
    }
    if (lastHandledUserIdRef.current === next.user.id) return;
    lastHandledUserIdRef.current = next.user.id;

    let prof: UserProfile | null = null;
    try {
      prof = await fetchProfile(next.user.id);
    } catch (err) {
      console.error('Failed to load profile', err);
    }

    if (!prof) {
      // Профиль не создался (возможно, триггер выключен) — выкидываем.
      await supabase.auth.signOut();
      throw new Error('Профиль пользователя не найден. Обратитесь к администратору.');
    }
    if (prof.is_deleted) {
      await supabase.auth.signOut();
      throw new Error('Учётная запись отключена.');
    }
    if (!prof.is_active) {
      await supabase.auth.signOut();
      throw new Error('Учётная запись ожидает активации администратором.');
    }
    setProfile(prof);
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        return applySession(data.session);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void applySession(next).catch((err) => {
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
      // applySession бросит исключение, если is_active=false / is_deleted=true.
      lastHandledUserIdRef.current = null;
      await applySession(data.session);
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
    const prof = await fetchProfile(session.user.id);
    setProfile(prof);
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      updateOwnPassword,
      resetPasswordForEmail,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signUp, signOut, updateOwnPassword, resetPasswordForEmail, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
