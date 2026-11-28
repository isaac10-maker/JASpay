import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';

/**
 * Contexte d'authentification JASpay — UNE seule source de vérité pour toute l'application.
 *
 * Avant : chaque composant appelait useAuth() et créait son propre état (session, profil, rôles),
 * ce qui provoquait des redirections vers /login au rechargement et des états incohérents.
 *
 * Rôles : la source de vérité est la table `user_roles` (gérée côté serveur).
 * `user_metadata.role` n'est JAMAIS utilisé pour le contrôle d'accès.
 */

const AuthContext = createContext(null);

function siteBase() {
  const envUrl = import.meta.env.VITE_SITE_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, '');
  return window.location.origin;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentUserId = useRef(null);
  const loadToken = useRef(0);

  const loadAccount = useCallback(async (userId) => {
    const token = ++loadToken.current;
    try {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);
      if (token !== loadToken.current) return; // réponse périmée
      if (p.error) console.error('[auth] Erreur profil :', p.error.message);
      if (r.error) console.error('[auth] Erreur rôles :', r.error.message);
      setProfile(p.error ? null : p.data ?? null);
      setUserRoles(r.error || !r.data ? [] : r.data.map((x) => x.role));
    } catch (err) {
      if (token !== loadToken.current) return;
      console.error('[auth] Exception chargement compte :', err.message);
      setProfile(null);
      setUserRoles([]);
    }
  }, []);

  const clearAccount = useCallback(() => {
    loadToken.current++;
    currentUserId.current = null;
    setProfile(null);
    setUserRoles([]);
  }, []);

  useEffect(() => {
    let active = true;

    // Initialisation : getSession() attend le traitement de l'URL (confirmation d'e-mail,
    // retour Google, lien de réinitialisation) avant de répondre.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) console.error('[auth] Erreur session :', error.message);
        const s = data?.session ?? null;
        setSession(s);
        if (s?.user) {
          currentUserId.current = s.user.id;
          await loadAccount(s.user.id);
        }
      } catch (err) {
        console.error('[auth] Erreur initialisation :', err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active || event === 'INITIAL_SESSION') return;
      setSession(newSession ?? null);

      if (!newSession?.user) {
        clearAccount();
        return;
      }
      // Ne recharge le compte que si l'utilisateur a changé (SIGNED_IN est aussi émis au retour sur l'onglet).
      if (currentUserId.current !== newSession.user.id) {
        currentUserId.current = newSession.user.id;
        // Différé : ne jamais appeler Supabase de façon synchrone dans ce callback (risque de blocage).
        setTimeout(() => {
          if (active) loadAccount(newSession.user.id);
        }, 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadAccount, clearAccount]);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${siteBase()}/auth/callback` },
    });
    if (error) {
      console.error('[auth.signUp]', { status: error.status, code: error.code, name: error.name });
    }
    // Adresse déjà utilisée : Supabase renvoie un utilisateur SANS identités (anti-énumération), sans erreur.
    const alreadyExists =
      !error &&
      !!data?.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0;
    return { data, error, alreadyExists };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      console.error('[auth.signIn]', { status: error.status, code: error.code, name: error.name });
    }
    return { data, error };
  }, []);

  const resendConfirmation = useCallback(async (email) => {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${siteBase()}/auth/callback` },
    });
    if (error) {
      console.error('[auth.resend]', { status: error.status, code: error.code, name: error.name });
    }
    return { data, error };
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteBase()}/reset-password`,
    });
    return { data, error };
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { data, error } = await supabase.auth.updateUser({ password });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    // Même en cas d'erreur réseau, on vide l'état local pour ne pas bloquer l'utilisateur
    setSession(null);
    clearAccount();
    return { error };
  }, [clearAccount]);

  const value = useMemo(() => {
    const has = (role) => userRoles.includes(role);
    return {
      user: session?.user ?? null,
      session,
      profile,
      userRoles,
      loading,
      isAuthenticated: !!session?.user,
      isAdmin: has('super_admin') || has('admin'),
      isSuperAdmin: has('super_admin'),
      isAgent: has('agent'),
      isModerator: has('moderator'),
      hasRole: has,
      signUp,
      signIn,
      resendConfirmation,
      resetPassword,
      updatePassword,
      signOut,
    };
  }, [
    session,
    profile,
    userRoles,
    loading,
    signUp,
    signIn,
    resendConfirmation,
    resetPassword,
    updatePassword,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>.');
  }
  return ctx;
}

export default AuthContext;
