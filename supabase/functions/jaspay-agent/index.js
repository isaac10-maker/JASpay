//
// JASpay — Edge Function : jaspay-agent
// Remplace les routes Express :
// GET /api/agent/transactions
// POST /api/agent/transactions/:id/process
//
// Operations agent sur transactions attribuees.
// Verifie : JWT, role (agent/admin/super_admin), compte actif,
// session admin (revoked_at, expires_at), assignation de l'agent.
//
// AUCUN IMPORT CDN : l'import du SDK via esm.sh casse le demarrage
// (BOOT_ERROR / 503). On utilise fetch + PostgREST directement.
// Deno.serve(handler) est obligatoire en fin de fichier.

const ALLOWED_ORIGINS = [
  'https://jaspay.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// CORS restreint : l'origine n'est renvoyee que si elle est connue.
function buildCorsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

function jsonResponse(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Extrait /api/... du chemin complet.
// Sans cela, path vaut /functions/v1/jaspay-agent/api/... et AUCUNE route
// ne correspond.
function extractApiPath(pathname) {
  let p = pathname.replace(/\/+$/, '');
  const idx = p.indexOf('/api/');
  if (idx >= 0) p = p.slice(idx);
  return p;
}

// --- En-tetes PostgREST avec service_role (usage strictement interne) ---
function serviceHeaders(extra) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

function restBase() {
  return Deno.env.get('SUPABASE_URL') + '/rest/v1/';
}

// GET PostgREST renvoyant un tableau (jamais d'erreur si 0 ligne).
async function restGet(pathWithQuery) {
  const res = await fetch(restBase() + pathWithQuery, { headers: serviceHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST GET ' + res.status + ' : ' + text);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

// GET PostgREST renvoyant la premiere ligne ou null (sans 406).
async function restGetOne(pathWithQuery) {
  const rows = await restGet(pathWithQuery + '&limit=1');
  return rows.length > 0 ? rows[0] : null;
}

// PATCH PostgREST.
async function restPatch(table, filter, payload) {
  const res = await fetch(restBase() + table + '?' + filter, {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST PATCH ' + res.status + ' : ' + text);
  }
  return null;
}

// RPC PostgREST.
async function restRpc(name, args) {
  const res = await fetch(restBase() + 'rpc/' + name, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error('PostgREST RPC ' + res.status + ' : ' + text);
  }
  return data;
}

// Verifie le JWT aupres du service Auth (aucun SDK).
async function getUserIdFromToken(token) {
  if (!token) return null;
  try {
    const res = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
      headers: {
        apikey: Deno.env.get('SUPABASE_ANON_KEY'),
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

// Emails des utilisateurs via l'API Admin.
// PostgREST ne peut PAS resoudre l'embed user:auth.users(email) : il n'a pas
// acces au schema auth. C'etait la 2e cause de panne de cette fonction.
async function fetchAuthUserEmails() {
  const base = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const map = {};
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(base + '/auth/v1/admin/users?page=' + page + '&per_page=1000', {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
      });
      if (!res.ok) break;
      const json = await res.json();
      const users = json.users || [];
      for (const u of users) if (u.id) map[u.id] = u.email;
      if (users.length < 1000) break;
    }
  } catch (e) {
    console.error('[jaspay-agent] Emails indisponibles :', e && e.message ? e.message : e);
  }
  return map;
}

async function handler(req) {
  const cors = buildCorsHeaders(req.headers.get('origin'));

  // Preflight CORS avant toute logique metier.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const path = extractApiPath(url.pathname);

  // --- Authentification : JWT obligatoire ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: "Token d'authentification manquant" }, 401, cors);
  }

  const token = authHeader.substring(7);
  const userId = await getUserIdFromToken(token);

  if (!userId) {
    return jsonResponse({ error: 'Token invalide ou expiré' }, 401, cors);
  }

  try {
    // --- Verification des roles ---
    const roleRows = await restGet(
      'user_roles?select=role&user_id=eq.' + encodeURIComponent(userId)
    );
    const roles = roleRows.map((r) => r.role);
    const isAdminOrSuper = roles.includes('super_admin') || roles.includes('admin');
    const isAgent = roles.includes('agent');

    if (!isAdminOrSuper && !isAgent) {
      return jsonResponse({ error: 'Accès refusé : rôle insuffisant' }, 403, cors);
    }

    // --- Verification du compte actif ---
    const profile = await restGetOne(
      'profiles?select=is_active&id=eq.' + encodeURIComponent(userId)
    );

    if (!profile || !profile.is_active) {
      return jsonResponse({ error: 'Compte suspendu ou inactif' }, 403, cors);
    }

    // --- Verification de la session admin (revoked_at, expires_at) ---
    const session = await restGetOne(
      'admin_sessions?select=id,revoked_at,expires_at,last_activity' +
        '&admin_user_id=eq.' +
        encodeURIComponent(userId) +
        '&revoked_at=is.null' +
        '&expires_at=gt.' +
        encodeURIComponent(new Date().toISOString()) +
        '&order=last_activity.desc'
    );

    // Aucune session active : on en ouvre une.
    // JWT, role (super_admin/admin/agent) et compte actif ont deja ete
    // verifies. L'autorisation vient de la liste blanche en base
    // (public.admin_whitelist) : aucun email en dur dans ce fichier.
    // open_admin_session n'est executable que par service_role et refuse
    // tout appelant sans role administrateur.
    let activeSessionId = session ? session.id : null;

    if (!activeSessionId) {
      const opened = await restRpc('open_admin_session', {
        p_admin_user_id: userId,
        p_ttl_hours: 24,
        p_ip_address: req.headers.get('x-forwarded-for'),
        p_user_agent: req.headers.get('user-agent'),
      });

      const row = Array.isArray(opened) ? opened[0] : opened;

      if (!row || !row.session_id) {
        return jsonResponse({ error: 'Session administrative impossible a ouvrir' }, 403, cors);
      }

      activeSessionId = row.session_id;
    }

    // Mise a jour last_activity (non bloquante)
    try {
      await restPatch(
        'admin_sessions',
        'id=eq.' + encodeURIComponent(activeSessionId),
        { last_activity: new Date().toISOString() }
      );
    } catch (e) {
      console.error('[jaspay-agent] last_activity non mis a jour :', e && e.message ? e.message : e);
    }

    // --- GET /api/agent/transactions ---
    if (path === '/api/agent/transactions' && req.method === 'GET') {
      const status = url.searchParams.get('status');
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');

      const limit = parseInt(limitParam || '50', 10);
      const offset = parseInt(offsetParam || '0', 10);

      const select =
        '*,bookmaker:bookmakers(name),provider:payment_providers(name),' +
        'events:transaction_events(old_status,new_status,changed_at,notes)';

      let query =
        'transactions?select=' +
        encodeURIComponent(select) +
        '&order=created_at.desc' +
        '&limit=' +
        limit +
        '&offset=' +
        offset;

      // Un agent ne voit que ses transactions assignees (sauf admin/super_admin)
      if (!isAdminOrSuper) {
        query += '&assigned_agent_id=eq.' + encodeURIComponent(userId);
      }

      if (status) query += '&status=eq.' + encodeURIComponent(status);

      const rows = await restGet(query);

      // Les emails sont resolus via l'API Admin (PostgREST ne voit pas auth.users).
      let emails = {};
      if (rows.length > 0) emails = await fetchAuthUserEmails();

      const transactions = rows.map((r) => ({
        ...r,
        user: { email: emails[r.user_id] || null },
      }));

      return jsonResponse({ transactions, count: transactions.length }, 200, cors);
    }

    // --- POST /api/agent/transactions/:id/process ---
    const processMatch = path.match(/^\/api\/agent\/transactions\/([a-f0-9-]+)\/process$/);
    if (processMatch && req.method === 'POST') {
      const transactionId = processMatch[1];

      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: 'Corps JSON invalide' }, 400, cors);
      }

      const { new_status, notes } = body || {};

      if (!['processing', 'completed', 'rejected', 'cancelled'].includes(new_status)) {
        return jsonResponse({ error: 'Statut invalide' }, 400, cors);
      }

      // Fonction PostgreSQL atomique (SELECT ... FOR UPDATE).
      // Elle verifie l'identite et les permissions cote SQL.
      let data;
      try {
        data = await restRpc('process_transaction_atomic', {
          p_transaction_id: transactionId,
          p_new_status: new_status,
          p_agent_id: userId,
          p_notes: notes || null,
        });
      } catch (e) {
        console.error('[jaspay-agent] RPC :', e && e.message ? e.message : e);
        return jsonResponse(
          { error: 'Erreur lors du traitement de la transaction' },
          500,
          cors
        );
      }

      if (!data || !data.success) {
        const status =
          data?.error_code === 'ALREADY_PROCESSED' ? 409 :
          data?.error_code === 'NOT_ASSIGNED' ? 403 :
          data?.error_code === 'NOT_FOUND' ? 404 :
          data?.error_code === 'INVALID_STATUS' ? 400 : 400;
        return jsonResponse(
          {
            error: data?.error_message || 'Révocation refusée',
            code: data?.error_code,
          },
          status,
          cors
        );
      }

      return jsonResponse(
        {
          success: true,
          transaction: {
            id: data.transaction_id,
            old_status: data.old_status,
            new_status: data.new_status,
          },
        },
        200,
        cors
      );
    }

    return jsonResponse({ error: 'Route non trouvée' }, 404, cors);
  } catch (err) {
    console.error('[jaspay-agent] Erreur:', err && err.message ? err.message : err);
    return jsonResponse({ error: 'Erreur serveur' }, 500, cors);
  }
}

// Supabase Edge Runtime exige un appel explicite a Deno.serve.
Deno.serve(handler);
