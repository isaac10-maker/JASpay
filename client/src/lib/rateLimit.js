/**
 * rateLimit.js — Helper client pour l'Edge Function de rate limiting.
 *
 * Appelle jaspay-rate-limit pour :
 *   - checkRateLimit      : vérifier si une tentative est autorisée
 *   - recordFailedAttempt : enregistrer une tentative échouée
 *   - resetRateLimit      : effacer le compteur après connexion réussie
 *
 * Règle : 3 tentatives par e-mail sur 5 minutes.
 *
 * Stratégie de dégradation : si le service est indisponible, on n'autorise pas
 * silencieusement un nombre illimité d'essais. Supabase Auth applique sa
 * propre limitation native côté serveur, donc la protection n'est jamais
 * totalement absente. On remonte un drapeau `degraded` pour que l'UI reste
 * informative.
 */

import { supabase } from './supabase';

const getSupabaseUrl = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error('[RateLimit] VITE_SUPABASE_URL manquante');
    return '';
  }
  return url.replace(/\/$/, '');
};

const getAnonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY || '';

async function callRateLimit(payload) {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) throw new Error('Configuration Supabase absente');

  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${supabaseUrl}/functions/v1/jaspay-rate-limit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: getAnonKey(),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  return { status: res.status, ok: res.ok, data };
}

/**
 * Vérifie si une tentative d'authentification est autorisée.
 * Retourne { allowed, remaining, error, degraded }
 */
export async function checkRateLimit(email, attemptType = 'login') {
  try {
    const { status, ok, data } = await callRateLimit({
      email,
      attempt_type: attemptType,
      action: 'check',
    });

    if (status === 429 || data.allowed === false) {
      return {
        allowed: false,
        remaining: 0,
        error: data.error || 'Trop de tentatives erronées, ressayez dans 5min',
        degraded: false,
      };
    }

    if (!ok) {
      // Le contrôle n'a pas pu s'exécuter : on laisse Supabase Auth arbitrer
      // (sa limitation native reste active) et on signale la dégradation.
      console.warn('[RateLimit] Service indisponible, statut', status);
      return { allowed: true, remaining: null, error: null, degraded: true };
    }

    return {
      allowed: true,
      remaining: typeof data.remaining === 'number' ? data.remaining : null,
      error: null,
      degraded: false,
    };
  } catch (err) {
    console.error('[RateLimit] Erreur :', err.message);
    return { allowed: true, remaining: null, error: null, degraded: true };
  }
}

/**
 * Enregistre une tentative échouée.
 * Doit être appelée UNIQUEMENT après un échec d'authentification avéré.
 * Retourne le nombre de tentatives restantes (ou null si inconnu).
 */
export async function recordFailedAttempt(email, attemptType = 'login') {
  try {
    const { status, data } = await callRateLimit({
      email,
      attempt_type: attemptType,
      action: 'record',
    });

    if (status === 429) {
      return {
        remaining: 0,
        blocked: true,
        error: data.error || 'Trop de tentatives erronées, ressayez dans 5min',
      };
    }

    return {
      remaining: typeof data.remaining === 'number' ? data.remaining : null,
      blocked: false,
      error: null,
    };
  } catch (err) {
    console.error('[RateLimit] Échec enregistrement tentative :', err.message);
    return { remaining: null, blocked: false, error: null };
  }
}

/**
 * Efface le compteur après une connexion réussie.
 */
export async function resetRateLimit(email, attemptType = 'login') {
  try {
    await callRateLimit({ email, attempt_type: attemptType, action: 'reset' });
  } catch (err) {
    // Non bloquant : un compteur résiduel expirera de toute façon en 5 minutes.
    console.warn('[RateLimit] Reset impossible :', err.message);
  }
}
