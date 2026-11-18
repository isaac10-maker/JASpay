/**
 * JASpay — Edge Function : jaspay-admin-config
 * Remplace les routes Express :
 *   GET /api/admin/bookmakers
 *   POST /api/admin/bookmakers
 *   GET /api/admin/payment-providers
 *   POST /api/admin/payment-providers
 *   GET /api/admin/settings
 *   POST /api/admin/settings
 *   GET /api/admin/announcements
 *   POST /api/admin/announcements
 *   PUT /api/admin/announcements/:id
 *   DELETE /api/admin/announcements/:id
 *
 * Configuration plateforme.
 * Vérifie : JWT, rôle (super_admin/admin/moderator selon route),
 * compte actif, session admin (revoked_at, expires_at).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
  const isModerator = roles.includes('moderator');

  if (!isSuperAdmin && !isAdmin && !isModerator) {
    return new Response(
      JSON.stringify({ error: 'Accès refusé : rôle requis' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

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
      console.error('[jaspay-admin-config] Erreur journalisation:', err.message);
    }
  }

  try {
    // --- GET /api/admin/bookmakers ---
    if (path === '/api/admin/bookmakers' && req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('bookmakers')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      return new Response(
        JSON.stringify({ bookmakers: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/bookmakers ---
    if (path === '/api/admin/bookmakers' && req.method === 'POST') {
      if (!isSuperAdmin && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const { id, name, technical_id, logo_url, is_active, display_order } = body;

      if (!name || !technical_id) {
        return new Response(
          JSON.stringify({ error: 'Nom et identifiant technique requis' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let result;
      if (id) {
        const { data, error } = await supabaseAdmin
          .from('bookmakers')
          .update({ name, technical_id, logo_url, is_active, display_order })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('bookmakers')
          .insert({ name, technical_id, logo_url, is_active, display_order })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      await logAdminAction(
        id ? 'update_bookmaker' : 'create_bookmaker',
        null,
        'bookmaker',
        result.id,
        { name, technical_id }
      );

      return new Response(
        JSON.stringify({ bookmaker: result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/admin/payment-providers ---
    if (path === '/api/admin/payment-providers' && req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('payment_providers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return new Response(
        JSON.stringify({ providers: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/payment-providers ---
    if (path === '/api/admin/payment-providers' && req.method === 'POST') {
      if (!isSuperAdmin && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const { id, name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions } = body;

      if (!name || !technical_id) {
        return new Response(
          JSON.stringify({ error: 'Nom et identifiant technique requis' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let result;
      if (id) {
        const { data, error } = await supabaseAdmin
          .from('payment_providers')
          .update({ name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('payment_providers')
          .insert({ name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      await logAdminAction(
        id ? 'update_payment_provider' : 'create_payment_provider',
        null,
        'payment_provider',
        result.id,
        { name, technical_id }
      );

      return new Response(
        JSON.stringify({ provider: result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/admin/settings ---
    if (path === '/api/admin/settings' && req.method === 'GET') {
      if (!isSuperAdmin && !isAdmin && !isModerator) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('platform_settings')
        .select('*')
        .order('setting_key', { ascending: true });

      if (error) throw error;
      return new Response(
        JSON.stringify({ settings: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/settings ---
    if (path === '/api/admin/settings' && req.method === 'POST') {
      if (!isSuperAdmin && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const { setting_key, setting_value, description, is_public } = body;

      if (!setting_key) {
        return new Response(
          JSON.stringify({ error: 'Clé de paramètre requise' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('platform_settings')
        .upsert({
          setting_key,
          setting_value: setting_value || {},
          description,
          is_public: is_public || false,
          updated_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      await logAdminAction(
        'config_change',
        null,
        'setting',
        data.id,
        { setting_key, setting_value }
      );

      return new Response(
        JSON.stringify({ setting: data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/admin/announcements ---
    if (path === '/api/admin/announcements' && req.method === 'GET') {
      if (!isSuperAdmin && !isAdmin && !isModerator) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return new Response(
        JSON.stringify({ announcements: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/announcements ---
    if (path === '/api/admin/announcements' && req.method === 'POST') {
      if (!isSuperAdmin && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const { title, content, type, is_active, starts_at, ends_at } = body;

      if (!title || !content) {
        return new Response(
          JSON.stringify({ error: 'Titre et contenu requis' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('announcements')
        .insert({
          title,
          content,
          type: type || 'info',
          is_active: is_active !== false,
          starts_at,
          ends_at,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      await logAdminAction(
        'create_announcement',
        null,
        'announcement',
        data.id,
        { title, type }
      );

      return new Response(
        JSON.stringify({ announcement: data }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- PUT /api/admin/announcements/:id ---
    const announceMatch = path.match(/^\/api\/admin\/announcements\/([a-f0-9-]+)$/);
    if (announceMatch && req.method === 'PUT') {
      if (!isSuperAdmin && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const announcementId = announceMatch[1];
      const body = await req.json();
      const { title, content, type, is_active, starts_at, ends_at } = body;

      const { data, error } = await supabaseAdmin
        .from('announcements')
        .update({
          title,
          content,
          type,
          is_active,
          starts_at,
          ends_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', announcementId)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return new Response(
          JSON.stringify({ error: 'Annonce introuvable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction(
        'update_announcement',
        null,
        'announcement',
        announcementId,
        { title, type, is_active }
      );

      return new Response(
        JSON.stringify({ announcement: data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- DELETE /api/admin/announcements/:id ---
    if (announceMatch && req.method === 'DELETE') {
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Accès refusé : super administrateur requis' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const announcementId = announceMatch[1];

      const { data, error } = await supabaseAdmin
        .from('announcements')
        .delete()
        .eq('id', announcementId)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return new Response(
          JSON.stringify({ error: 'Annonce introuvable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction(
        'delete_announcement',
        null,
        'announcement',
        announcementId,
        { title: data.title }
      );

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route non trouvée' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[jaspay-admin-config] Erreur:', err.message);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}