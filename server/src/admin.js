/**
 * JASpay — Routes d'administration (Phase 3)
 * Toutes les routes vérifient côté serveur :
 * - L'identité authentifiée (JWT Supabase)
 * - Le rôle réel dans user_roles (source de vérité)
 * - Les permissions nécessaires
 * - Le statut actif du compte
 *
 * Aucune valeur de rôle provenant du frontend n'est jamais utilisée.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// -----------------------------------------------------------------------------
// Middleware : authentification utilisateur (JWT Supabase)
// -----------------------------------------------------------------------------
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token d\'authentification manquant.' });
    }

    const token = authHeader.substring(7);
    const { data, error } = await req.supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Token invalide ou expiré.' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur d\'authentification.' });
  }
}

// -----------------------------------------------------------------------------
// Middleware : vérification des rôles via user_roles (source de vérité)
// -----------------------------------------------------------------------------
function requireRole(allowedRoles) {
  return async (req, res, next) => {
    try {
      const { data, error } = await req.supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', req.user.id);

      if (error) {
        return res.status(500).json({ error: 'Erreur de vérification des rôles.' });
      }

      const userRoles = (data || []).map((r) => r.role);
      const hasAccess = allowedRoles.some((role) => userRoles.includes(role));

      if (!hasAccess) {
        return res.status(403).json({ error: 'Accès refusé : rôle insuffisant.' });
      }

      req.userRoles = userRoles;
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Erreur de vérification des rôles.' });
    }
  };
}

// -----------------------------------------------------------------------------
// Middleware : vérification que le compte est actif
// -----------------------------------------------------------------------------
async function requireActiveAccount(req, res, next) {
  try {
    const { data: profile, error } = await req.supabaseAdmin
      .from('profiles')
      .select('is_active')
      .eq('id', req.user.id)
      .single();

    if (error || !profile || !profile.is_active) {
      return res.status(403).json({ error: 'Compte suspendu ou inactif.' });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur de vérification du compte.' });
  }
}

// -----------------------------------------------------------------------------
// Helper : journaliser une action admin
// -----------------------------------------------------------------------------
async function logAdminAction(supabaseAdmin, adminUserId, actionType, targetUserId, targetEntityType, targetEntityId, details = {}) {
  try {
    await supabaseAdmin.rpc('log_admin_action', {
      p_admin_user_id: adminUserId,
      p_action_type: actionType,
      p_target_user_id: targetUserId,
      p_target_entity_type: targetEntityType,
      p_target_entity_id: targetEntityId,
      p_details: details,
    });
  } catch (err) {
    console.error('[ERREUR journal admin]', err);
  }
}


// -----------------------------------------------------------------------------
// Middleware : vérification de session admin active (A3)
// Vérifie que l'utilisateur a une session admin valide et non révoquée.
// Si aucune session n'existe, en crée une automatiquement (première connexion).
// -----------------------------------------------------------------------------
async function verifyAdminSession(req, res, next) {
  try {
    const adminUserId = req.user.id;

    // Vérifier si une session existe pour cet utilisateur
    const { data: existingSession, error: sessError } = await req.supabaseAdmin
      .from('admin_sessions')
      .select('id, revoked_at, expires_at, last_activity')
      .eq('admin_user_id', adminUserId)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessError && sessError.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Erreur de vérification de session.' });
    }

    const now = new Date();

    if (existingSession) {
      // Session existe : vérifier qu'elle n'est pas révoquée ni expirée
      if (existingSession.revoked_at) {
        return res.status(403).json({ error: 'Session administrative révoquée. Veuillez vous reconnecter.' });
      }

      if (new Date(existingSession.expires_at) <= now) {
        return res.status(403).json({ error: 'Session administrative expirée. Veuillez vous reconnecter.' });
      }

      // Session valide : mettre à jour last_activity
      await req.supabaseAdmin
        .from('admin_sessions')
        .update({ last_activity: now.toISOString() })
        .eq('id', existingSession.id);
    } else {
      // Aucune session : en créer une automatiquement (première connexion)
      const { error: createError } = await req.supabaseAdmin
        .from('admin_sessions')
        .insert({
          admin_user_id: adminUserId,
          session_token: 'sess_' + require('crypto').randomBytes(16).toString('hex'),
          expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          last_activity: now.toISOString(),
        });

      if (createError) {
        return res.status(500).json({ error: 'Erreur lors de la création de session.' });
      }
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur de vérification de session.' });
  }
}


// -----------------------------------------------------------------------------

// Application du middleware de vérification de session aux routes admin et agent (A3)
router.use('/admin', verifyAdminSession);
router.use('/agent', verifyAdminSession);

// 1. DASHBOARD SUPER ADMINISTRATEUR
// -----------------------------------------------------------------------------

// Statistiques globales
router.get('/admin/stats', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const supabaseAdmin = req.supabaseAdmin;

    // Total utilisateurs
    const { count: totalUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { head: true });

    // Utilisateurs actifs / suspendus
    const { count: activeUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { head: true })
      .eq('is_active', true);

    const { count: suspendedUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { head: true })
      .eq('is_active', false);

    // Transactions par statut
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

    // Volumes (montants) - Dépôts et retraits distincts, pas de "revenus"
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

    // Activité récente (10 dernières transactions)
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

    res.json({
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
    });
  } catch (err) {
    console.error('[ERREUR stats admin]', err);
    res.status(500).json({ error: 'Erreur lors du chargement des statistiques.' });
  }
});

// -----------------------------------------------------------------------------
// 2. GESTION DES UTILISATEURS
// -----------------------------------------------------------------------------

// Liste des utilisateurs (admin/super_admin uniquement)
router.get('/admin/users', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { search, role, is_active, limit = 50, offset = 0 } = req.query;

    let query = req.supabaseAdmin
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

    if (error) return res.status(500).json({ error: error.message });

    // Filtrer par rôle côté serveur si demandé (user_roles est déjà joint)
    let users = data || [];
    if (role) {
      users = users.filter((u) =>
        (u.user_roles || []).some((r) => r.role === role)
      );
    }

    res.json({
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
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Détails d'un utilisateur (profil + transactions)
router.get('/admin/users/:id', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const targetUserId = req.params.id;

    const { data: profile, error: pError } = await req.supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (pError || !profile) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const { data: roles } = await req.supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId);

    const { data: transactions } = await req.supabaseAdmin
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

    res.json({
      user: {
        id: profile.id,
        email: profile.email,
        phone: profile.phone,
        is_active: profile.is_active,
        roles: (roles || []).map((r) => r.role),
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      transactions: transactions || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Suspendre un utilisateur
router.post('/admin/users/:id/suspend', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const adminUserId = req.user.id;

    // Empêcher un admin de se suspendre lui-même
    if (targetUserId === adminUserId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas suspendre votre propre compte.' });
    }

    // Empêcher un admin ordinaire de suspendre un super_admin
    const { data: targetRoles } = await req.supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId);

    const targetHasSuperAdmin = (targetRoles || []).some((r) => r.role === 'super_admin');
    const callerIsSuperAdmin = req.userRoles.includes('super_admin');

    if (targetHasSuperAdmin && !callerIsSuperAdmin) {
      return res.status(403).json({ error: 'Seul un super administrateur peut suspendre un super administrateur.' });
    }

    const { data: updated, error } = await req.supabaseAdmin
      .from('profiles')
      .update({ is_active: false })
      .eq('id', targetUserId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'suspend_user',
      targetUserId,
      'user',
      targetUserId,
      { reason: 'Suspension de compte par administrateur' }
    );

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        is_active: updated.is_active,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Réactiver un utilisateur
router.post('/admin/users/:id/reactivate', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const adminUserId = req.user.id;

    const { data: updated, error } = await req.supabaseAdmin
      .from('profiles')
      .update({ is_active: true })
      .eq('id', targetUserId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'reactivate_user',
      targetUserId,
      'user',
      targetUserId,
      { reason: 'Réactivation de compte par administrateur' }
    );

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        is_active: updated.is_active,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Supprimer un utilisateur (procédure sécurisée - super_admin uniquement)
router.delete('/admin/users/:id', authenticateUser, requireRole(['super_admin']), requireActiveAccount, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const adminUserId = req.user.id;

    // Empêcher le super_admin de se supprimer lui-même
    if (targetUserId === adminUserId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    // Vérifier qu'il reste au moins un super_admin
    const { count: superAdminCount } = await req.supabaseAdmin
      .from('user_roles')
      .select('*', { head: true })
      .eq('role', 'super_admin');

    const { data: targetRoles } = await req.supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId);

    const targetIsSuperAdmin = (targetRoles || []).some((r) => r.role === 'super_admin');

    if (targetIsSuperAdmin && (superAdminCount || 0) <= 1) {
      return res.status(400).json({ error: 'Impossible de supprimer le dernier super administrateur.' });
    }

    // Supprimer le profil (cascade sur auth.users via FK)
    const { error } = await req.supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', targetUserId);

    if (error) return res.status(500).json({ error: error.message });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'delete_user',
      targetUserId,
      'user',
      targetUserId,
      { reason: 'Suppression de compte par super administrateur' }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// 3. GESTION DES RÔLES ET DES AGENTS
// -----------------------------------------------------------------------------

// Attribuer un rôle à un utilisateur
router.post('/admin/users/:id/roles', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { role } = req.body;
    const adminUserId = req.user.id;

    const validRoles = ['super_admin', 'admin', 'agent', 'moderator', 'user'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide.' });
    }

    // Seul un super_admin peut attribuer le rôle super_admin
    if (role === 'super_admin' && !req.userRoles.includes('super_admin')) {
      return res.status(403).json({ error: 'Seul un super administrateur peut attribuer le rôle super_admin.' });
    }

    // Un admin ne peut pas supprimer/rétrograder un super_admin
    if (role === 'user' && !req.userRoles.includes('super_admin')) {
      const { data: targetRoles } = await req.supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', targetUserId);
      const targetHasSuperAdmin = (targetRoles || []).some((r) => r.role === 'super_admin');
      if (targetHasSuperAdmin) {
        return res.status(403).json({ error: 'Seul un super administrateur peut modifier les rôles d\'un super administrateur.' });
      }
    }

    const { data, error } = await req.supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: targetUserId,
        role,
        assigned_by: adminUserId,
        assigned_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'assign_role',
      targetUserId,
      'user_roles',
      data.id,
      { role, assigned_by: adminUserId }
    );

    res.json({ role: data.role, user_id: data.user_id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Révoquer un rôle d'un utilisateur (opération atomique côté PostgreSQL)
// Protections : auto-révocation super_admin, dernier super_admin, admin vs super_admin
router.delete('/admin/users/:id/roles/:role', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const role = req.params.role;
    const adminUserId = req.user.id;

    const validRoles = ['super_admin', 'admin', 'agent', 'moderator', 'user'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide.' });
    }

    // Appel de la fonction PostgreSQL atomique (toutes les vérifications côté serveur)
    const { data, error } = await req.supabaseAdmin
      .rpc('revoke_user_role_atomic', {
        p_target_user_id: targetUserId,
        p_role: role,
        p_revoked_by: adminUserId,
      });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la révocation du rôle.' });
    }

    if (!data || !data.success) {
      const status = data?.error_code === 'LAST_SUPER_ADMIN' || data?.error_code === 'SELF_REVOKE_SUPER_ADMIN' ? 400 : 403;
      return res.status(status).json({ error: data?.error_message || 'Révocation refusée.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// 4. ESPACE AGENT - Transactions attribuées
// -----------------------------------------------------------------------------

// Liste des transactions pour un agent (attribuées ou toutes si admin)
router.get('/agent/transactions', authenticateUser, requireRole(['super_admin', 'admin', 'agent']), requireActiveAccount, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = req.supabaseAdmin
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

    // Un agent ne voit que ses transactions attribuées (sauf admin/super_admin)
    const isAdminOrSuper = req.userRoles.includes('super_admin') || req.userRoles.includes('admin');
    if (!isAdminOrSuper) {
      query = query.eq('assigned_agent_id', req.user.id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    res.json({
      transactions: data || [],
      count: data ? data.length : 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Traiter une transaction (agent/admin)
// Traiter une transaction (agent/admin) - VERSION ATOMIQUE (A4)
router.post('/agent/transactions/:id/process', authenticateUser, requireRole(['super_admin', 'admin', 'agent']), requireActiveAccount, async (req, res) => {
  try {
    const { new_status, notes } = req.body;

    if (!['processing', 'completed', 'rejected', 'cancelled'].includes(new_status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    // Vérifier que l'agent est authentifié et récupérer son ID
    const agentId = req.user.id;
    const isAdminOrSuper = req.userRoles.includes('super_admin') || req.userRoles.includes('admin');

    // Appel de la fonction PostgreSQL atomique avec verrouillage SELECT ... FOR UPDATE
    const { data, error } = await req.supabaseAdmin
      .rpc('process_transaction_atomic', {
        p_transaction_id: req.params.id,
        p_new_status: new_status,
        p_agent_id: agentId,
        p_notes: notes || null,
      });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Assigner une transaction à un agent (admin uniquement)
router.post('/admin/transactions/:id/assign', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'ID de l\'agent requis.' });
    }

    // Vérifier que l'agent existe et a le rôle agent
    const { data: agentRoles } = await req.supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', agent_id);

    const isAgent = (agentRoles || []).some((r) => r.role === 'agent');
    if (!isAgent) {
      return res.status(400).json({ error: 'L\'utilisateur cible n\'est pas un agent.' });
    }

    const { data: updated, error } = await req.supabaseAdmin
      .from('transactions')
      .update({ assigned_agent_id: agent_id })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logAdminAction(
      req.supabaseAdmin,
      req.user.id,
      'assign_transaction_agent',
      agent_id,
      'transaction',
      updated.id,
      { agent_id }
    );

    res.json({ transaction: updated });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// 5. CONFIGURATION DE LA PLATEFORME
// -----------------------------------------------------------------------------

// Liste des bookmakers (admin)
router.get('/admin/bookmakers', authenticateUser, requireRole(['super_admin', 'admin', 'moderator']), requireActiveAccount, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('bookmakers')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ bookmakers: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Créer ou mettre à jour un bookmaker (admin/super_admin)
router.post('/admin/bookmakers', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { id, name, technical_id, logo_url, is_active, display_order } = req.body;
    const adminUserId = req.user.id;

    if (!name || !technical_id) {
      return res.status(400).json({ error: 'Nom et identifiant technique requis.' });
    }

    let result;
    if (id) {
      const { data, error } = await req.supabaseAdmin
        .from('bookmakers')
        .update({ name, technical_id, logo_url, is_active, display_order })
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      result = data;
    } else {
      const { data, error } = await req.supabaseAdmin
        .from('bookmakers')
        .insert({ name, technical_id, logo_url, is_active, display_order })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      result = data;
    }

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      id ? 'update_bookmaker' : 'create_bookmaker',
      null,
      'bookmaker',
      result.id,
      { name, technical_id }
    );

    res.json({ bookmaker: result });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Liste des opérateurs de paiement (admin)
router.get('/admin/payment-providers', authenticateUser, requireRole(['super_admin', 'admin', 'moderator']), requireActiveAccount, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('payment_providers')
      .select('*')
      .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ providers: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Créer ou mettre à jour un opérateur de paiement (admin/super_admin)
router.post('/admin/payment-providers', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { id, name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions } = req.body;
    const adminUserId = req.user.id;

    if (!name || !technical_id) {
      return res.status(400).json({ error: 'Nom et identifiant technique requis.' });
    }

    let result;
    if (id) {
      const { data, error } = await req.supabaseAdmin
        .from('payment_providers')
        .update({ name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions })
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      result = data;
    } else {
      const { data, error } = await req.supabaseAdmin
        .from('payment_providers')
        .insert({ name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      result = data;
    }

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      id ? 'update_payment_provider' : 'create_payment_provider',
      null,
      'payment_provider',
      result.id,
      { name, technical_id }
    );

    res.json({ provider: result });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Paramètres de la plateforme (admin/super_admin)
router.get('/admin/settings', authenticateUser, requireRole(['super_admin', 'admin', 'moderator']), requireActiveAccount, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('platform_settings')
      .select('*')
      .order('setting_key', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ settings: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/admin/settings', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { setting_key, setting_value, description, is_public } = req.body;
    const adminUserId = req.user.id;

    if (!setting_key) {
      return res.status(400).json({ error: 'Clé de paramètre requise.' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('platform_settings')
      .upsert({
        setting_key,
        setting_value: setting_value || {},
        description,
        is_public: is_public || false,
        updated_by: adminUserId,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'config_change',
      null,
      'setting',
      data.id,
      { setting_key, setting_value }
    );

    res.json({ setting: data });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Annonces (admin/super_admin)
router.get('/admin/announcements', authenticateUser, requireRole(['super_admin', 'admin', 'moderator']), requireActiveAccount, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ announcements: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/admin/announcements', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { title, content, type, is_active, starts_at, ends_at } = req.body;
    const adminUserId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ error: 'Titre et contenu requis.' });
    }

    const { data, error } = await req.supabaseAdmin
      .from('announcements')
      .insert({
        title,
        content,
        type: type || 'info',
        is_active: is_active !== false,
        starts_at,
        ends_at,
        created_by: adminUserId,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'create_announcement',
      null,
      'announcement',
      data.id,
      { title, type }
    );

    res.json({ announcement: data });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// 5 bis. ANNONCES - Modification et archivage
// -----------------------------------------------------------------------------

// Modifier une annonce (admin/super_admin)
router.put('/admin/announcements/:id', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, is_active, starts_at, ends_at } = req.body;
    const adminUserId = req.user.id;

    const { data, error } = await req.supabaseAdmin
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
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Annonce introuvable.' });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'update_announcement',
      null,
      'announcement',
      id,
      { title, type, is_active }
    );

    res.json({ announcement: data });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Archiver / supprimer une annonce (super_admin uniquement)
router.delete('/admin/announcements/:id', authenticateUser, requireRole(['super_admin']), requireActiveAccount, async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;

    const { data, error } = await req.supabaseAdmin
      .from('announcements')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Annonce introuvable.' });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'delete_announcement',
      null,
      'announcement',
      id,
      { title: data.title }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// 5 ter. SESSIONS ADMINISTRATIVES
// -----------------------------------------------------------------------------

// Lister les sessions admin (super_admin uniquement)
router.get('/admin/sessions', authenticateUser, requireRole(['super_admin']), requireActiveAccount, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('admin_sessions')
      .select(`*,
        admin:auth.users(email)
      `)
      .order('last_activity', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ sessions: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Révoquer une session admin (super_admin uniquement)
// Révocation logique : met revoked_at au lieu de supprimer, permettant au middleware
// verifyAdminSession de détecter et bloquer immédiatement l'accès.
router.delete('/admin/sessions/:id', authenticateUser, requireRole(['super_admin']), requireActiveAccount, async (req, res) => {
  try {
    const { id } = req.params;
    const adminUserId = req.user.id;

    const { data, error } = await req.supabaseAdmin
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Session introuvable.' });

    await logAdminAction(
      req.supabaseAdmin,
      adminUserId,
      'revoke_admin_session',
      data.admin_user_id,
      'admin_session',
      id,
      { revoked_session_id: id, revoked_at: new Date().toISOString() }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// 6. SURVEILLANCE ET JOURNAUX DE SÉCURITÉ
// -----------------------------------------------------------------------------

// Journal des actions administratives (super_admin et admin uniquement)
router.get('/admin/audit-logs', authenticateUser, requireRole(['super_admin', 'admin']), requireActiveAccount, async (req, res) => {
  try {
    const { limit = 100, offset = 0, action_type } = req.query;

    let query = req.supabaseAdmin
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

    if (error) return res.status(500).json({ error: error.message });
    res.json({ actions: data || [], count: data ? data.length : 0 });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// Export du router
// -----------------------------------------------------------------------------
module.exports = router;
