/**
 * rateLimit.js — Helper client pour l'Edge Function de rate limiting.
 *
 * Appelle jaspay-rate-lift pour vérifier si une tentative d'authentification
 * est autorisée avant de soumettre le formulaire.
 *
 * Règle : 3 tentatives par e-mail sur 5 minutes.
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

/**
 * Vérifie si une tentative d'authentification est autorisée.
 * Retourne { allowed: boolean, remaining: number, error: string|null }
 */
export async function checkRateLimit(email, attemptType = 'login') {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    return { allowed: true, remaining: 3, error: null };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';

  const url = `${supabaseUrl}/functions/v1/jaspay-rate-limit`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email, attempt_type: attemptType }),
    });

    const data = await res.json();

    if (res.status === 429) {
      return {
        allowed: false,
        remaining: 0,
        error: data.error || 'Trop de tentatives erronées, ressayez dans 5min',
      };
    }

    if (!res.ok) {
      return { allowed: true, remaining: 3, error: null };
    }

    return {
      allowed: true,
      remaining: data.remaining ?? 3,
      error: null,
    };
  } catch (err) {
    console.error('[RateLimit] Erreur :', err.message);
    // En cas d'échec du service de rate limiting, on autorise la tentative
    // pour ne pas bloquer les utilisateurs légitimes.
    return { allowed: true, remaining: 3, error: null };
  }
}

/**
 * Enregistre une tentative échouée après une tentative d'authentification.
 * Cette fonction est appelée automatiquement par le frontend après une erreur
 * Supabase Auth pour maintenir le compteur à jour.
 */
export async function recordFailedAttempt(email, attemptType = 'login') {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) return;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';

  const url = `${supabaseUrl}/functions/v1/jaspay-rate-limit`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email, attempt_type: attemptType }),
    });
  } catch (err) {
    console.error('[RateLimit] Échec enregistrement tentative :', err.message);
  }
}
