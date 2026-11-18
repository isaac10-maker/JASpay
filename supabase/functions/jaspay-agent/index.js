/**
 * JASpay — Edge Function : jaspay-agent
 * Remplace les routes Express :
 *   GET /api/agent/transactions
 *   POST /api/agent/transactions/:id/process
 *
 * Opérations agent sur transactions attribuées.
 * Vérifie : JWT, rôle (agent/admin/super_admin), compte actif,
 * session admin (revoked_at, expires_at), assignation de l'agent.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  const isAdminOrSuper = roles.includes('super_admin') || roles.includes('admin');
  const isAgent = roles.includes('agent');

  if (!isAdminOrSuper && !isAgent) {
    return new Response(
      JSON.stringify({ error: 'Accès refusé : rôle insuffisant' }),
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
    .eq('revoked_at', null)  // Session non révoquée
    .gt('expires_at', new Date().toISOString())  // Session non expirée
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

  try {
    // --- GET /api/agent/transactions ---
    if (path === '/api/agent/transactions' && req.method === 'GET') {
      const { status, limit = 50, offset = 0 } = Object.fromEntries(url.searchParams);

      let query = supabaseAdmin
        .from('transactions')
        .select(`
          *,
          user:auth.users(email),
          bookmaker:bookmakers(name),
          provider:payment_providers(name),
          events:transaction_events(old_status, new_status, changed_at, notes)
        `)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      // Un agent ne voit que ses transactions assignées (sauf admin/super_admin)
      if (!isAdminOrSuper) {
        query = query.eq('assigned_agent_id', userId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ transactions: data || [], count: data ? data.length : 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/agent/transactions/:id/process ---
    const processMatch = path.match(/^\/api\/agent\/transactions\/([a-f0-9-]+)\/process$/);
    if (processMatch && req.method === 'POST') {
      const transactionId = processMatch[1];
      const body = await req.json();
      const { new_status, notes } = body;

      if (!['processing', 'completed', 'rejected', 'cancelled'].includes(new_status)) {
        return new Response(
          JSON.stringify({ error: 'Statut invalide' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Appel de la fonction PostgreSQL atomique avec verrouillage SELECT ... FOR UPDATE
      // La fonction vérifie l'identité et les permissions côté SQL
      const { data, error } = await supabaseAdmin.rpc('process_transaction_atomic', {
        p_transaction_id: transactionId,
        p_new_status: new_status,
        p_agent_id: userId,
        p_notes: notes || null,
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Erreur lors du traitement de la transaction' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!data || !data.success) {
        const status = data?.error_code === 'ALREADY_PROCESSED' ? 409 :
                       data?.error_code === 'NOT_ASSIGNED' ? 403 :
                       data?.error_code === 'NOT_FOUND' ? 404 :
                       data?.error_code === 'INVALID_STATUS' ? 400 : 400;
        return new Response(
          JSON.stringify({ error: data?.error_message || 'Révocation refusée', code: data?.error_code }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          transaction: {
            id: data.transaction_id,
            old_status: data.old_status,
            new_status: data.new_status,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route non trouvée' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[jaspay-agent] Erreur:', err.message);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}