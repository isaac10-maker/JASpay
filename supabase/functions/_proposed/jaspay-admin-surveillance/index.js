// JASpay — Edge Function : jaspay-admin-surveillance
// Remplace les routes Express :
//   GET    /api/admin/sessions
//   DELETE /api/admin/sessions/:id
//   GET    /api/admin/audit-logs
//
// LOGIQUE METIER CONSERVEE A L'IDENTIQUE :
//   - JWT obligatoire, verifie serveur
//   - rôle super_admin requis pour les sessions, admin/super_admin pour l'audit
//   - compte actif obligatoire (profiles.is_active)
//   - session administrative active obligatoire (revoked_at null, expires_at futur)
//   - mise a jour de last_activity
//   - journalisation des actions admin via log_admin_action
//   - forme de reponse identique : { sessions: [] } et { actions: [], count }
//
// DIFFERENCES TECHNIQUES (obligatoires pour corriger le BOOT_ERROR) :
//   1. Deno.serve(handler) en fin de fichier (absent = BOOT_ERROR)
//   2. Aucun import CDN
//   3. Routage : extraction du suffixe /api/...
//   4. L'embed `admin:auth.users(email)` n'est PAS resolvable par PostgREST
//      (auth est un autre schema, non expose). Les emails sont resolus via
//      l'API Admin /auth/v1/admin/users et injectes sous la meme cle `admin`
//      pour ne pas casser le contrat frontend.
//   5. .single() remplace par une lecture tolerante (evite le 406 sur 0 ligne)

const ALLOWED_ORIGINS = [
  'https://jaspay.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function buildCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

function extractApiPath(pathname) {
  let p = pathname.replace(/\/+$/, '');
  const idx = p.indexOf('/api/');
  if (idx >= 0) p = p.slice(idx);
  return p;
}

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

function authBase() {
  return Deno.env.get('SUPABASE_URL') + '/auth/v1/';
}

async function restGet(pathWithQuery) {
  const res = await fetch(restBase() + pathWithQuery, { headers: serviceHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST GET ' + res.status + ' : ' + text);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function restGetOne(pathWithQuery) {
  const rows = await restGet(pathWithQuery + '&limit=1');
  return rows.length > 0 ? rows[0] : null;
}

async function restPatch(table, query, payload) {
  const res = await fetch(restBase() + table + query, {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST PATCH ' + res.status + ' : ' + text);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

// Résout les emails via l'API Admin Auth (remplace l'embed auth.users).
// Retourne une Map id -> email.
async function resolveEmails(userIds) {
  const map = new Map();
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (unique.length === 0) return map;

  try {
    const res = await fetch(authBase() + 'admin/users?per_page=1000', {
      headers: serviceHeaders(),
    });
    if (!res.ok) {
      console.error('[jaspay-admin-surveillance] Admin users ' + res.status);
      return map;
    }
    const data = await res.json();
    const list = data && data.users ? data.users : [];
    for (const u of list) {
      if (unique.includes(u.id)) map.set(u.id, u.email || null);
    }
  } catch (err) {
    console.error(
      '[jaspay-admin-surveillance] Resolution emails :',
      err && err.message ? err.message : err
    );
  }

  return map;
}

async function getUserIdFromToken(token) {
  if (!token) return null;
  const base = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  try {
    const res = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
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

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const path = extractApiPath(url.pathname);

  // --- Authentification ---
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
    // --- Rôles ---
    const roleRows = await restGet(
      'user_roles?select=role&user_id=eq.' + encodeURIComponent(userId)
    );
    const roles = roleRows.map((r) => r.role);
    const isSuperAdmin = roles.includes('super_admin');
    const isAdmin = roles.includes('admin');

    // --- Compte actif ---
    const profile = await restGetOne(
      'profiles?select=is_active&id=eq.' + encodeURIComponent(userId)
    );

    if (!profile || !profile.is_active) {
      return jsonResponse({ error: 'Compte suspendu ou inactif' }, 403, cors);
    }

    // --- Session administrative active ---
    const session = await restGetOne(
      'admin_sessions?select=id,revoked_at,expires_at,last_activity' +
        '&admin_user_id=eq.' +
        encodeURIComponent(userId) +
        '&revoked_at=is.null' +
        '&expires_at=gt.' +
        encodeURIComponent(new Date().toISOString()) +
        '&order=last_activity.desc'
    );

    if (!session) {
      return jsonResponse(
        { error: 'Aucune session administrative active. Veuillez vous reconnecter.' },
        403,
        cors
      );
    }

    // Mise a jour last_activity
    try {
      await restPatch(
        'admin_sessions',
        '?id=eq.' + encodeURIComponent(session.id),
        { last_activity: new Date().toISOString() }
      );
    } catch (e) {
      console.error('[jaspay-admin-surveillance] last_activity :', e.message);
    }

    // Helper : journaliser une action admin
    async function logAdminAction(actionType, targetUserId, targetEntityType, targetEntityId, details) {
      try {
        const res = await fetch(restBase() + 'rpc/log_admin_action', {
          method: 'POST',
          headers: serviceHeaders(),
          body: JSON.stringify({
            p_admin_user_id: userId,
            p_action_type: actionType,
            p_target_user_id: targetUserId,
            p_target_entity_type: targetEntityType,
            p_target_entity_id: targetEntityId,
            p_details: details || {},
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          console.error('[jaspay-admin-surveillance] RPC log_admin_action', res.status, t);
        }
      } catch (err) {
        console.error(
          '[jaspay-admin-surveillance] Erreur journalisation:',
          err && err.message ? err.message : err
        );
      }
    }

    // --- GET /api/admin/sessions ---
    if (path === '/api/admin/sessions' && req.method === 'GET') {
      if (!isSuperAdmin) {
        return jsonResponse(
          { error: 'Accès refusé : super administrateur requis' },
          403,
          cors
        );
      }

      const rows = await restGet('admin_sessions?select=*&order=last_activity.desc');
      const emails = await resolveEmails(rows.map((r) => r.admin_user_id));

      const sessions = rows.map((r) => ({
        ...r,
        admin: { email: emails.get(r.admin_user_id) || null },
      }));

      return jsonResponse({ sessions }, 200, cors);
    }

    // --- DELETE /api/admin/sessions/:id ---
    const sessionMatch = path.match(/^\/api\/admin\/sessions\/([a-f0-9-]+)$/);
    if (sessionMatch && req.method === 'DELETE') {
      if (!isSuperAdmin) {
        return jsonResponse(
          { error: 'Accès refusé : super administrateur requis' },
          403,
          cors
        );
      }

      const sessionId = sessionMatch[1];
      const revokedAt = new Date().toISOString();

      const updated = await restPatch(
        'admin_sessions',
        '?id=eq.' + encodeURIComponent(sessionId),
        { revoked_at: revokedAt }
      );

      if (updated.length === 0) {
        return jsonResponse({ error: 'Session introuvable' }, 404, cors);
      }

      await logAdminAction(
        'revoke_admin_session',
        updated[0].admin_user_id,
        'admin_session',
        sessionId,
        { revoked_session_id: sessionId, revoked_at: revokedAt }
      );

      return jsonResponse({ success: true }, 200, cors);
    }

    // --- GET /api/admin/audit-logs ---
    if (path === '/api/admin/audit-logs' && req.method === 'GET') {
      if (!isSuperAdmin && !isAdmin) {
        return jsonResponse(
          { error: 'Accès refusé : administrateur requis' },
          403,
          cors
        );
      }

      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const actionType = url.searchParams.get('action_type');

      let query =
        'admin_actions?select=*&order=created_at.desc&limit=' +
        limit +
        '&offset=' +
        offset;

      if (actionType) {
        query += '&action_type=eq.' + encodeURIComponent(actionType);
      }

      const rows = await restGet(query);
      const emails = await resolveEmails(rows.map((r) => r.admin_user_id));

      const actions = rows.map((r) => ({
        ...r,
        admin: { email: emails.get(r.admin_user_id) || null },
      }));

      return jsonResponse({ actions, count: actions.length }, 200, cors);
    }

    return jsonResponse({ error: 'Route non trouvée' }, 404, cors);
  } catch (err) {
    console.error(
      '[jaspay-admin-surveillance] Erreur:',
      err && err.message ? err.message : err
    );
    return jsonResponse({ error: 'Erreur serveur' }, 500, cors);
  }
}

// Supabase Edge Runtime exige un appel explicite a Deno.serve.
Deno.serve(handler);
