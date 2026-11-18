/**
 * JASpay — Helper d'appel aux Edge Functions Supabase
 *
 * Remplace les appels vers le backend Express (http://localhost:3001/api)
 * par des appels vers les Edge Functions Supabase.
 *
 * Chaque appel inclut automatiquement le token d'authentification depuis la session Supabase.
 *
 * Usage :
 *   import { invokeEdge } from '../lib/edgeFunctions';
 *   const { data, error } = await invokeEdge('jaspay-config', '/api/bookmakers', 'GET');
 *   const { data, error } = await invokeEdge('jaspay-transactions', '/api/transactions', 'POST', { ... });
 */

import { supabase } from './supabase';

const getSupabaseUrl = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) {
    console.error('[EdgeFunctions] VITE_SUPABASE_URL manquante');
    return '';
  }
  return url.replace(/\/$/, '');
};

/**
 * Appelle une Edge Function Supabase avec la méthode HTTP et le chemin appropriés.
 *
 * @param {string} functionName - Nom de l'Edge Function (ex: 'jaspay-config')
 * @param {string} path - Chemin API (ex: '/api/bookmakers')
 * @param {string} method - Méthode HTTP (GET, POST, PUT, DELETE)
 * @param {Object} body - Corps de la requête (optionnel)
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function invokeEdge(functionName, path, method = 'GET', body = null) {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    return { data: null, error: { message: 'VITE_SUPABASE_URL manquante' } };
  }

  // Récupérer la session actuelle pour le token JWT
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';

  const url = `${supabaseUrl}/functions/v1/${functionName}${path}`;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);

    // Gérer les réponses non-JSON (erreurs serveur)
    let data;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = { message: `Erreur HTTP ${res.status}` };
    }

    if (!res.ok) {
      return {
        data: null,
        error: data || { message: `Erreur HTTP ${res.status}` },
      };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err.message || 'Erreur lors de l\'appel Edge Function' },
    };
  }
}

export default { invokeEdge };