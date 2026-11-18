import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook d'authentification JASpay.
 *
 * Rôles : la source de vérité est la table `user_roles` (gérée côté serveur).
 * Le champ `role` a été supprimé de `profiles` (migration 002).
 * `user_metadata.role` de Supabase Auth n'est JAMAIS utilisé pour le contrôle d'accès.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [userRoles, setUserRoles] = useState([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          await fetchProfile(session.user.id);
          await fetchUserRoles(session.user.id);
        } else {
          setProfile(null);
          setUserRoles([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[useAuth] Erreur récupération profil :', error.message);
      }

      if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('[useAuth] Exception récupération profil :', err.message);
    }
  }, []);

  const fetchUserRoles = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) {
        console.error('[useAuth] Erreur récupération rôles :', error.message);
        setUserRoles([]);
        return;
      }

      setUserRoles(data ? data.map((r) => r.role) : []);
    } catch (err) {
      console.error('[useAuth] Exception récupération rôles :', err.message);
      setUserRoles([]);
    }
  }, []);

  const hasRole = useCallback((role) => userRoles.includes(role), [userRoles]);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error('[useAuth.signUp] Erreur Supabase Auth :', {
        message: error.message,
        status: error.status,
        code: error.code,
        details: error.details,
        name: error.name,
      });
    }
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error('[useAuth.signIn] Erreur Supabase Auth :', {
        message: error.message,
        status: error.status,
        code: error.code,
        details: error.details,
        name: error.name,
      });
    }
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setProfile(null);
      setUserRoles([]);
    }
    return { error };
  };

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { data, error };
  };

  return {
    user,
    session,
    profile,
    userRoles,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    isAuthenticated: !!user,
    isAdmin: hasRole('super_admin') || hasRole('admin'),
    isSuperAdmin: hasRole('super_admin'),
    isAgent: hasRole('agent'),
    isModerator: hasRole('moderator'),
    hasRole,
  };
}

export default useAuth;
