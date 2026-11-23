// JASpay — Edge Function : jaspay-rate-limit
//
// Limitation des tentatives d'authentification.
// Règle : 3 tentatives échouées maximum par e-mail sur une fenêtre de 5 minutes.
// Au-delà : HTTP 429 + "Trop de tentatives erronées, ressayez dans 5min"
//
// API (POST, JSON) : { email, attempt_type?, action? }
//   action = "check"  (défaut) -> vérifie sans incrémenter
//   action = "record"          -> enregistre une tentative échouée
//   action = "reset"           -> efface le compteur (connexion réussie)
//
// AUCUNE dépendance externe : appels PostgREST via fetch natif.
// L'import du SDK via CDN provoquait un BOOT_ERROR au démarrage du runtime.
//
// CORS : répond au preflight OPTIONS (204) et ajoute les en-têtes CORS à
// TOUTES les réponses, y compris les erreurs.
//
// Sécurité : verify_jwt = false car l'appelant est non authentifié au moment
// de la connexion. L'accès base utilise SUPABASE_SERVICE_ROLE_KEY, confiné à
// cette fonction. Rien n'est exposé au client au-delà de { allowed, remaining }.
// La table rate_limit_attempts n'a AUCUNE politique RLS : elle est
// inaccessible avec les clés anon/authenticated.

const MAX_ATTEMPTS = 3;
const WINDOW_MINUTES = 5;

const ALLOWED_ORIGINS = [
  'https://jaspay.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function buildCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// Appel PostgREST direct avec la clé service_role.
function restHeaders() {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
  };
}

function restUrl(query) {
  const base = Deno.env.get('SUPABASE_URL');
  return base + '/rest/v1/rate_limit_attempts' + query;
}

async function countAttempts(email, attemptType, windowStart) {
  const query =
    '?email=eq.' +
    encodeURIComponent(email) +
    '&attempt_type=eq.' +
    encodeURIComponent(attemptType) +
    '&created_at=gte.' +
    encodeURIComponent(windowStart) +
    '&select=id';

  const res = await fetch(restUrl(query), { headers: restHeaders() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST count ' + res.status + ' : ' + text);
  }

  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

async function insertAttempt(email, attemptType, ipAddress) {
  const res = await fetch(restUrl(''), {
    method: 'POST',
    headers: { ...restHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ email, attempt_type: attemptType, ip_address: ipAddress }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST insert ' + res.status + ' : ' + text);
  }
}

async function deleteAttempts(email, attemptType) {
  const query =
    '?email=eq.' +
    encodeURIComponent(email) +
    '&attempt_type=eq.' +
    encodeURIComponent(attemptType);

  const res = await fetch(restUrl(query), {
    method: 'DELETE',
    headers: { ...restHeaders(), Prefer: 'return=minimal' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST delete ' + res.status + ' : ' + text);
  }
}

async function handler(req) {
  const origin = req.headers.get('origin');
  const cors = buildCorsHeaders(origin);

  // Preflight CORS : répondre TOUJOURS, avant toute logique métier.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée' }, 405, cors);
  }

  try {
    let payload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: 'Corps JSON invalide' }, 400, cors);
    }

    const { email, attempt_type = 'login', action = 'check' } = payload || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return jsonResponse({ error: 'Adresse e-mail valide requise' }, 400, cors);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    // reset : connexion réussie, on efface le compteur
    if (action === 'reset') {
      await deleteAttempts(normalizedEmail, attempt_type);
      return jsonResponse({ ok: true, allowed: true, remaining: MAX_ATTEMPTS }, 200, cors);
    }

    // record : enregistrer une tentative échouée
    if (action === 'record') {
      const ipAddress =
        req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      await insertAttempt(normalizedEmail, attempt_type, ipAddress);
    }

    // check (et relecture après record) : compter les tentatives
    const attemptCount = await countAttempts(normalizedEmail, attempt_type, windowStart);

    if (attemptCount >= MAX_ATTEMPTS) {
      return jsonResponse(
        {
          allowed: false,
          remaining: 0,
          error: 'Trop de tentatives erronées, ressayez dans 5min',
          retry_after: WINDOW_MINUTES * 60,
        },
        429,
        cors
      );
    }

    return jsonResponse(
      { ok: true, allowed: true, remaining: MAX_ATTEMPTS - attemptCount },
      200,
      cors
    );
  } catch (err) {
    console.error('[rate-limit] Exception :', err && err.message ? err.message : err);
    return jsonResponse({ error: 'Erreur interne du serveur' }, 500, cors);
  }
}

// Supabase Edge Runtime exige un appel explicite à Deno.serve.
Deno.serve(handler);
