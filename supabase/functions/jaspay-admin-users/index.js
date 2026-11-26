//
// JASpay — Edge Function : jaspay-admin-users
// Remplace les routes Express :
// GET /api/admin/stats
// GET /api/admin/users
// GET /api/admin/users/:id
// POST /api/admin/users/:id/suspend
// POST /api/admin/users/:id/reactivate
// DELETE /api/admin/users/:id
// POST /api/admin/users/:id/roles
// DELETE /api/admin/users/:id/roles/:role
// POST /api/admin/transactions/:id/assign
//
// Gestion utilisateurs et rôles.
// Vérifie : JWT, rôle (super_admin/admin), compte actif,
// session admin (revoked_at, expires_at), protections super_admin.
//


import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

// Extrait /api/... du chemin complet.
function extractApiPath(pathname) {
  let p = pathname.replace(/\/+$/, '');
  const idx = p.indexOf('/api/');
  if (idx >= 0) p = p.slice(idx);
  return p;
}

async function handler(req) {
  // Gérer le preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = extractApiPath(url.pathname);

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

  if (!isSuperAdmin && !isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Accès refusé : rôle administrateur requis' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // --- Vérification du compte actif ---
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_active')
    .eq('id', userId)
    .maybeSingle();

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

  // --- Session administrative ---
  // Aucune session active : on en ouvre une. L'autorisation repose sur la
  // liste blanche en base (public.admin_whitelist) et sur le role deja
  // verifie ci-dessus : le JWT, le role super_admin/admin et le compte actif
  // ont tous ete controles avant d'arriver ici. Un email en dur dans le code
  // n'intervient jamais.
  // open_admin_session n'est executable que par service_role et refuse tout
  // appelant sans role administrateur (garde-fou cote base).
  let activeSessionId = session ? session.id : null;

  if (!activeSessionId) {
    const { data: opened, error: openError } = await supabaseAdmin.rpc('open_admin_session', {
      p_admin_user_id: userId,
      p_ttl_hours: 24,
      p_ip_address: req.headers.get('x-forwarded-for'),
      p_user_agent: req.headers.get('user-agent'),
    });

    if (openError || !opened) {
      return new Response(
        JSON.stringify({ error: 'Session administrative impossible a ouvrir' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    activeSessionId = Array.isArray(opened) ? opened[0].session_id : opened.session_id;
  }

  // Mise a jour last_activity
  await supabaseAdmin
    .from('admin_sessions')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', activeSessionId);

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
      console.error('[jaspay-admin-users] Erreur journalisation:', err.message);
    }
  }

  try {
    // --- GET /api/admin/stats ---
    if (path === '/api/admin/stats' && req.method === 'GET') {
      const { count: totalUsers } = await supabaseAdmin
        .from('profiles')
        .select('*', { head: true });

      const { count: activeUsers } = await supabaseAdmin
        .from('profiles')
        .select('*', { head: true })
        .eq('is_active', true);

      const { count: suspendedUsers } = await supabaseAdmin
        .from('profiles')
        .select('*', { head: true })
        .eq('is_active', false);

      const { count: pendingTx } = await supabaseAdmin
        .from('transactions')
        .select('*', { head: true })
        .eq('status', 'pending');

      const { count: processingTx } = await supabaseAdmin
        .from('transactions')
        .select('*', { head: true })
        .eq('status', 'processing');

      const { count: completedTx } = await supabaseAdmin
        .from('transactions')
        .select('*', { head: true })
        .eq('status', 'completed');

      const { count: rejectedTx } = await supabaseAdmin
        .from('transactions')
        .select('*', { head: true })
        .eq('status', 'rejected');

      const { data: deposits } = await supabaseAdmin
        .from('transactions')
        .select('amount, currency, transaction_type, status')
        .eq('transaction_type', 'deposit');

      const { data: withdrawals } = await supabaseAdmin
        .from('transactions')
        .select('amount, currency, transaction_type, status')
        .eq('transaction_type', 'withdrawal');

      const sumDeposits = (deposits || []).reduce((acc, t) => acc + Number(t.amount), 0);
      const sumWithdrawals = (withdrawals || []).reduce((acc, t) => acc + Number(t.amount), 0);

      const { data: recentActivity } = await supabaseAdmin
        .from('transactions')
        .select(`
          transaction_reference,
          transaction_type,
          amount,
          currency,
          status,
          created_at,
          profiles(email)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      return new Response(
        JSON.stringify({
          stats: {
            totalUsers: totalUsers || 0,
            activeUsers: activeUsers || 0,
            suspendedUsers: suspendedUsers || 0,
            totalDeposits: deposits ? deposits.length : 0,
            totalWithdrawals: withdrawals ? withdrawals.length : 0,
            pendingTransactions: pendingTx || 0,
            processingTransactions: processingTx || 0,
            completedTransactions: completedTx || 0,
            rejectedTransactions: rejectedTx || 0,
            volumeDepositsXOF: Math.round(sumDeposits * 100) / 100,
            volumeWithdrawalsXOF: Math.round(sumWithdrawals * 100) / 100,
          },
          recentActivity: recentActivity || [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/admin/users ---
    if (path === '/api/admin/users' && req.method === 'GET') {
      const { search, role, is_active, limit = 50, offset = 0 } = Object.fromEntries(url.searchParams);

      let query = supabaseAdmin
        .from('profiles')
        .select(`
          id,
          email,
          phone,
          is_active,
          created_at,
          updated_at,
          user_roles(role)
        `)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (search) {
        query = query.ilike('email', `%${search}%`);
      }

      if (is_active !== undefined) {
        query = query.eq('is_active', is_active === 'true');
      }

      const { data, error } = await query;
      if (error) throw error;

      let users = data || [];
      if (role) {
        users = users.filter((u) =>
          (u.user_roles || []).some((r) => r.role === role)
        );
      }

      return new Response(
        JSON.stringify({
          users: users.map((u) => ({
            id: u.id,
            email: u.email,
            phone: u.phone,
            is_active: u.is_active,
            roles: (u.user_roles || []).map((r) => r.role),
            created_at: u.created_at,
            updated_at: u.updated_at,
          })),
          count: users.length,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/admin/users/:id ---
    const userDetailMatch = path.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/);
    if (userDetailMatch && req.method === 'GET') {
      const targetUserId = userDetailMatch[1];

      const { data: targetProfile, error: pError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (pError || !targetProfile) {
        return new Response(
          JSON.stringify({ error: 'Utilisateur introuvable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: targetRoles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', targetUserId);

      const { data: transactions } = await supabaseAdmin
        .from('transactions')
        .select(`
          transaction_reference,
          transaction_type,
          amount,
          currency,
          status,
          created_at,
          bookmaker:bookmakers(name)
        `)
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(20);

      return new Response(
        JSON.stringify({
          user: {
            id: targetProfile.id,
            email: targetProfile.email,
            phone: targetProfile.phone,
            is_active: targetProfile.is_active,
            roles: (targetRoles || []).map((r) => r.role),
            created_at: targetProfile.created_at,
            updated_at: targetProfile.updated_at,
          },
          transactions: transactions || [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/users/:id/suspend ---
    const suspendMatch = path.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/suspend$/);
    if (suspendMatch && req.method === 'POST') {
      const targetUserId = suspendMatch[1];

      // Empêcher un admin de se suspendre lui-même
      if (targetUserId === userId) {
        return new Response(
          JSON.stringify({ error: 'Vous ne pouvez pas suspendre votre propre compte' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Empêcher un admin ordinaire de suspendre un super_admin
      const { data: suspendTargetRoles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', targetUserId);

      const targetHasSuperAdmin = (suspendTargetRoles || []).some((r) => r.role === 'super_admin');
      if (targetHasSuperAdmin && !isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Seul un super administrateur peut suspendre un super administrateur' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: false })
        .eq('id', targetUserId)
        .select()
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!updated) {
        return new Response(
          JSON.stringify({ error: 'Utilisateur introuvable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction('suspend_user', targetUserId, 'user', targetUserId, {
        reason: 'Suspension de compte par administrateur',
      });

      return new Response(
        JSON.stringify({
          user: { id: updated.id, email: updated.email, is_active: updated.is_active },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/users/:id/reactivate ---
    const reactivateMatch = path.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/reactivate$/);
    if (reactivateMatch && req.method === 'POST') {
      const targetUserId = reactivateMatch[1];

      const { data: updated, error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: true })
        .eq('id', targetUserId)
        .select()
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!updated) {
        return new Response(
          JSON.stringify({ error: 'Utilisateur introuvable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction('reactivate_user', targetUserId, 'user', targetUserId, {
        reason: 'Réactivation de compte par administrateur',
      });

      return new Response(
        JSON.stringify({
          user: { id: updated.id, email: updated.email, is_active: updated.is_active },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- DELETE /api/admin/users/:id ---
    const deleteMatch = path.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const targetUserId = deleteMatch[1];

      // Empêcher le super_admin de se supprimer lui-même
      if (targetUserId === userId) {
        return new Response(
          JSON.stringify({ error: 'Vous ne pouvez pas supprimer votre propre compte' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Vérifier qu'il reste au moins un super_admin
      const { count: superAdminCount } = await supabaseAdmin
        .from('user_roles')
        .select('*', { head: true })
        .eq('role', 'super_admin');

      const { data: delTargetRoles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', targetUserId);

      const targetIsSuperAdmin = (delTargetRoles || []).some((r) => r.role === 'super_admin');

      if (targetIsSuperAdmin && (superAdminCount || 0) <= 1) {
        return new Response(
          JSON.stringify({ error: 'Impossible de supprimer le dernier super administrateur' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', targetUserId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction('delete_user', targetUserId, 'user', targetUserId, {
        reason: 'Suppression de compte par super administrateur',
      });

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/users/:id/roles ---
    const assignRoleMatch = path.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/roles$/);
    if (assignRoleMatch && req.method === 'POST') {
      const targetUserId = assignRoleMatch[1];
      const body = await req.json();
      const { role } = body;

      const validRoles = ['super_admin', 'admin', 'agent', 'moderator', 'user'];
      if (!role || !validRoles.includes(role)) {
        return new Response(
          JSON.stringify({ error: 'Rôle invalide' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Seul un super_admin peut attribuer le rôle super_admin
      if (role === 'super_admin' && !isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Seul un super administrateur peut attribuer le rôle super_admin' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Un admin ne peut pas supprimer/rétrograder un super_admin
      if (role === 'user' && !isSuperAdmin) {
        const { data: checkRoles } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', targetUserId);
        const targetHasSuperAdmin = (checkRoles || []).some((r) => r.role === 'super_admin');
        if (targetHasSuperAdmin) {
          return new Response(
            JSON.stringify({ error: 'Seul un super administrateur peut modifier les rôles d\'un super administrateur' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { data, error } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: targetUserId,
          role,
          assigned_by: userId,
          assigned_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ error: 'Attribution du role non confirmee' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction('assign_role', targetUserId, 'user_roles', data.id, {
        role,
        assigned_by: userId,
      });

      return new Response(
        JSON.stringify({ role: data.role, user_id: data.user_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- DELETE /api/admin/users/:id/roles/:role ---
    const revokeRoleMatch = path.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/roles\/([a-z_]+)$/);
    if (revokeRoleMatch && req.method === 'DELETE') {
      const targetUserId = revokeRoleMatch[1];
      const role = revokeRoleMatch[2];

      const validRoles = ['super_admin', 'admin', 'agent', 'moderator', 'user'];
      if (!validRoles.includes(role)) {
        return new Response(
          JSON.stringify({ error: 'Rôle invalide' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Appel de la fonction PostgreSQL atomique (toutes les vérifications côté serveur)
      const { data, error } = await supabaseAdmin.rpc('revoke_user_role_atomic', {
        p_target_user_id: targetUserId,
        p_role: role,
        p_revoked_by: userId,
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Erreur lors de la révocation du rôle' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!data || !data.success) {
        const status = data?.error_code === 'LAST_SUPER_ADMIN' || data?.error_code === 'SELF_REVOKE_SUPER_ADMIN' ? 400 : 403;
        return new Response(
          JSON.stringify({ error: data?.error_message || 'Révocation refusée', code: data?.error_code }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/admin/transactions/:id/assign ---
    const assignMatch = path.match(/^\/api\/admin\/transactions\/([a-f0-9-]+)\/assign$/);
    if (assignMatch && req.method === 'POST') {
      const transactionId = assignMatch[1];
      const body = await req.json();
      const { agent_id } = body;

      if (!agent_id) {
        return new Response(
          JSON.stringify({ error: 'ID de l\'agent requis' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Vérifier que l'agent existe et a le rôle agent
      const { data: agentRoles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', agent_id);

      const isAgent = (agentRoles || []).some((r) => r.role === 'agent');
      if (!isAgent) {
        return new Response(
          JSON.stringify({ error: 'L\'utilisateur cible n\'est pas un agent' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from('transactions')
        .update({ assigned_agent_id: agent_id })
        .eq('id', transactionId)
        .select()
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!updated) {
        return new Response(
          JSON.stringify({ error: 'Transaction introuvable' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logAdminAction(
        'assign_transaction_agent',
        agent_id,
        'transaction',
        updated.id,
        { agent_id }
      );

      return new Response(
        JSON.stringify({ transaction: updated }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route non trouvée' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[jaspay-admin-users] Erreur:', err && err.message ? err.message : err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Supabase Edge Runtime exige un appel explicite a Deno.serve.
Deno.serve(handler);
