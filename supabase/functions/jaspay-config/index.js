// JASpay — Edge Function : jaspay-config (VERSION PROPOSÉE)
// Remplace les routes Express :
//   GET /api/bookmakers
//   GET /api/payment-providers
//   GET /api/payment-methods
//   GET /api/health
//
// Lecture seule, pas de modification d'état.
//
// MODELE D'ACCES CONSERVE A L'IDENTIQUE :
//   La version d'origine utilisait la cle ANON + le JWT de l'utilisateur.
//   Les politiques RLS s'appliquaient donc reellement. Cette version fait
//   exactement la meme chose : cle ANON + JWT propage a PostgREST, pour que
//   RLS reste l'unique garde-fou. AUCUN usage de service_role ici.
//
// DIFFERENCES TECHNIQUES (obligatoires pour corriger le BOOT_ERROR) :
//   1. Deno.serve(handler) en fin de fichier (absent = BOOT_ERROR)
//   2. Aucun import CDN (l'import esm.sh casse le demarrage)
//   3. Routage : extraction du suffixe /api/... car req.url contient le
//      prefixe /functions/v1/jaspay-config (l'original renvoyait 404)

const ALLOWED_ORIGINS = [
  'https://jaspay.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function buildCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Extrait /api/... du chemin complet.
// req.url vaut /functions/v1/jaspay-config/api/bookmakers
// => renvoie /api/bookmakers
function extractApiPath(pathname) {
  let p = pathname.replace(/\/+$/, '');
  const idx = p.indexOf('/api/');
  if (idx >= 0) p = p.slice(idx);
  return p;
}

// En-tetes pour PostgREST : cle ANON + JWT utilisateur => RLS s'applique.
function anonHeaders(userToken) {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  return {
    apikey: anonKey,
    Authorization: 'Bearer ' + (userToken || anonKey),
    'Content-Type': 'application/json',
  };
}

// GET PostgREST. Retourne le tableau JSON ou leve une erreur.
async function restGet(pathWithQuery, userToken) {
  const base = Deno.env.get('SUPABASE_URL');
  const res = await fetch(base + '/rest/v1/' + pathWithQuery, {
    headers: anonHeaders(userToken),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST ' + res.status + ' : ' + text);
  }

  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

// Verifie le JWT aupres du service Auth.
// Equivalent de supabase.auth.getUser(token) sans le SDK.
async function getUserIdFromToken(token) {
  if (!token) return null;

  const base = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  try {
    const res = await fetch(base + '/auth/v1/user', {
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + token,
      },
    });

    if (!res.ok) return null;

    const user = await res.json();
    return user && user.id ? user.id : null;
  } catch {
    return null;
  }
}

async function handler(req) {
  const origin = req.headers.get('origin');
  const cors = buildCorsHeaders(origin);

  // Preflight CORS : avant toute logique metier.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // Seules les methodes GET sont autorisees (comportement conserve).
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Méthode non autorisée' }, 405, cors);
  }

  const url = new URL(req.url);
  const path = extractApiPath(url.pathname);

  // JWT depuis l'en-tete Authorization
  const authHeader = req.headers.get('Authorization');
  const userToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  let userId = null;
  if (userToken) {
    userId = await getUserIdFromToken(userToken);
  }

  try {
    // --- GET /api/health : public, pas d'authentification (comportement conserve) ---
    if (path === '/api/health') {
      return jsonResponse({ status: 'ok', service: 'jaspay-config' }, 200, cors);
    }

    // Toutes les routes de donnees exigent un utilisateur authentifie.
    if (!userId) {
      return jsonResponse({ error: 'Authentification requise' }, 401, cors);
    }

    // --- GET /api/bookmakers ---
    // Champs retournes et filtres identiques a l'original.
    if (path === '/api/bookmakers') {
      const query =
        'bookmakers?select=' +
        encodeURIComponent('id,name,technical_id,logo_url,is_active,display_order') +
        '&is_active=eq.true&order=display_order.asc';

      const rows = await restGet(query, userToken);

      return jsonResponse({ bookmakers: rows || [] }, 200, cors);
    }

    // --- GET /api/payment-providers ---
    // Champs retournes et filtres identiques a l'original.
    if (path === '/api/payment-providers') {
      const query =
        'payment_providers?select=' +
        encodeURIComponent(
          'id,name,technical_id,is_active,supports_deposit,supports_withdrawal,ussd_instructions'
        ) +
        '&is_active=eq.true';

      const rows = await restGet(query, userToken);

      return jsonResponse({ providers: rows || [] }, 200, cors);
    }

    // --- GET /api/payment-methods?bookmakerId=... ---
    // Embed provider:payment_providers conserve a l'identique.
    if (path === '/api/payment-methods') {
      const bookmakerId = url.searchParams.get('bookmakerId');

      const select =
        'id,is_active,min_amount,max_amount,fee_percent,fee_fixed,' +
        'provider:payment_providers(id,name,technical_id,supports_deposit,supports_withdrawal,ussd_instructions)';

      let query = 'payment_methods?select=' + encodeURIComponent(select) + '&is_active=eq.true';

      if (bookmakerId) {
        query += '&bookmaker_id=eq.' + encodeURIComponent(bookmakerId);
      }

      const rows = await restGet(query, userToken);

      return jsonResponse({ methods: rows || [] }, 200, cors);
    }

    return jsonResponse({ error: 'Route non trouvée' }, 404, cors);
  } catch (err) {
    console.error('[jaspay-config] Erreur:', err && err.message ? err.message : err);
    return jsonResponse({ error: 'Erreur serveur' }, 500, cors);
  }
}

// Supabase Edge Runtime exige un appel explicite a Deno.serve.
Deno.serve(handler);
