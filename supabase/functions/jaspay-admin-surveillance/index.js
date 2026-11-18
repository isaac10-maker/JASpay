/**
 * JASpay — Edge Function : jaspay-admin-surveillance
 * Remplace les routes Express :
 *   GET /api/admin/sessions
 *   DELETE /api/admin/sessions/:id
 *   GET /api/admin/audit-logs
 *
 * Surveillance, sessions, journaux d'audit.
 * Vérifie : JWT, rôle (super_admin pour sessions, admin/super_admin pour audit),
 * compte actif, session admin (revoked_at, expires_at).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
};

export default async function handler(req) {
  // Gérer le preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');

  // Récupérer le token JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Token d\'authentification manquant' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.substring(7);

  // Client avec clé anon pour vérifier l'utilisateur
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_ANON_KEY')
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Token invalide ou expiré' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = user.id;

  // Client avec clé service_role pour les opérations privilégiées
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  );

  // --- Vérification des rôles ---
  const { data: userRoles } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const roles = userRoles ? userRoles.map((r) => r.role) : [];
  const isSuperAdmin = roles.includes('super_admin');
  const isAdmin = roles.includes('admin');

  // --- Vérification du compte actif ---
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_active')
    .eq('id', userId)
    .single();

  if (!profile || !profile.is_active) {
    return new Response(
      JSON.stringify({ error: 'Compte suspendu ou inactif' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // --- Vérification de la session admin (revoked_at, expires_at) ---
  const { data: session } = await supabaseAdmin
    .from('admin_sessions')
    .select('id, revoked_at, expires_at, last_activity')
    .eq('admin_user_id', userId)
    .eq('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('last_activity', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Aucune session administrative active. Veuillez vous reconnecter.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Mise à jour last_activity
  await supabaseAdmin
    .from('admin_sessions')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', session.id);

  // Helper : journaliser une action admin
  async function logAdminAction(actionType, targetUserId, targetEntityType, targetEntityId, details = {}) {
    try {
      await supabaseAdmin.rpc('log_admin_action', {
        p_admin_user_id: userId,
        p_action_type: actionType,
        p_target_user_id: targetUserId,
        p_target_entity_type: targetEntityType,
        p_target_entity_id: targetEntityId,
        p_details: details,
      });
    } catch (err) {
      console.error('[jaspay-admin-surveillance] Erreur journalisation:', err.message);
    }
  }

  try {
    // --- GET /api/admin/sessions ---
    if (path === '/api/admin/sessions' && req.method === 'GET') {
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : super administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('admin_sessions')
        .select(`
          *,
          admin:auth.users(email)
        `)
        .order('last_activity', { ascending: false });

      if (error) throw error;
      return new Response(
        JSON.stringify({ sessions: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- DELETE /api/admin/sessions/:id ---
    const sessionMatch = path.match(/^\/api\/admin\/sessions\/([a-f0-9-]+)$/);
    if (sessionMatch && req.method === 'DELETE') {
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : super administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sessionId = sessionMatch[1];

      const { data, error } = await supabaseAdmin
        .from('admin_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return new Response(
          JSON.stringify({ error: 'Session introuvable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction(
        'revoke_admin_session',
        data.admin_user_id,
        'admin_session',
        sessionId,
        { revoked_session_id: sessionId, revoked_at: new Date().toISOString() }
      );

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/admin/audit-logs ---
    if (path === '/api/admin/audit-logs' && req.method === 'GET') {
      if (!isSuperAdmin && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { limit = 100, offset = 0, action_type } = Object.fromEntries(url.searchParams);

      let query = supabaseAdmin
        .from('admin_actions')
        .select(`
          *,
          admin:auth.users(email)
        `)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (action_type) {
        query = query.eq('action_type', action_type);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ actions: data || [], count: data ? data.length : 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route non trouvée' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[jaspay-admin-surveillance] Erreur:', err.message);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}