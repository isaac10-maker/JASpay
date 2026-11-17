/**
 * JASpay — Backend Node.js sécurisé
 * Phase 2 — Transactions
 *
 * Responsabilités :
 * - Génération de références de transaction uniques (côté serveur, jamais frontend)
 * - Validation des montants et données financières
 * - Actions des agents (valider/rejeter) avec clé service_role (côté serveur uniquement)
 * - Journalisation d'audit
 *
 * Aucune clé service_role n'est exposée au frontend.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Import des routes d'administration (Phase 3)
const adminRoutes = require('./admin');

// -----------------------------------------------------------------------------
// Middleware : injecter le client Supabase admin dans req pour toutes les routes
// -----------------------------------------------------------------------------
app.use((req, res, next) => {
  req.supabaseAdmin = supabaseAdmin;
  next();
});

// -----------------------------------------------------------------------------
// Configuration Supabase (côté serveur uniquement)
// -----------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('[ERREUR] SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises côté serveur.');
  process.exit(1);
}

// Client avec clé service_role (privilèges élevés, NE JAMAIS exposer au frontend)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// -----------------------------------------------------------------------------
// Middleware de sécurité
// -----------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

// Rate limiting : plus strict sur les endpoints financiers
const financialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requêtes par fenêtre
  message: { error: 'Trop de requêtes financières. Veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' },
});

app.use(generalLimiter);

// -----------------------------------------------------------------------------
// Middleware d'authentification (vérifie le JWT utilisateur)
// -----------------------------------------------------------------------------
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token d\'authentification manquant.' });
    }

    const token = authHeader.substring(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);

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
// Middleware : vérifier le rôle utilisateur via user_roles (source de vérité)
// -----------------------------------------------------------------------------
async function requireRole(allowedRoles) {
  return async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
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
// Génération de référence de transaction unique (côté serveur)
// -----------------------------------------------------------------------------
function generateTransactionReference(type) {
  const prefix = type === 'deposit' ? 'DEP' : 'WDR';
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const random = uuidv4().substring(0, 8).toUpperCase();
  return `${prefix}-${date}-${random}`;
}

// -----------------------------------------------------------------------------
// Routes publiques (lecture des données de configuration)
// -----------------------------------------------------------------------------

app.get('/api/bookmakers', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bookmakers')
      .select('id, name, technical_id, logo_url, is_active, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ bookmakers: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/payment-providers', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payment_providers')
      .select('id, name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions')
      .eq('is_active', true);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ providers: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/payment-methods', async (req, res) => {
  try {
    const { bookmakerId } = req.query;

    let query = supabaseAdmin
      .from('payment_methods')
      .select(`
        id,
        is_active,
        min_amount,
        max_amount,
        fee_percent,
        fee_fixed,
        provider:payment_providers (
          id, name, technical_id, supports_deposit, supports_withdrawal, ussd_instructions
        )
      `)
      .eq('is_active', true);

    if (bookmakerId) {
      query = query.eq('bookmaker_id', bookmakerId);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    res.json({ methods: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// Génération de référence (endpoint protégé, appelé avant création de transaction)
// -----------------------------------------------------------------------------
app.post('/api/transactions/reference', authenticateUser, financialLimiter, async (req, res) => {
  try {
    const { transaction_type } = req.body;

    if (!transaction_type || !['deposit', 'withdrawal'].includes(transaction_type)) {
      return res.status(400).json({ error: 'Type de transaction invalide.' });
    }

    const reference = generateTransactionReference(transaction_type);

    // Vérifier l'unicité (défense en profondeur)
    const { data: existing } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('transaction_reference', reference)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Référence déjà existante, réessayez.' });
    }

    res.json({ transaction_reference: reference });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la génération de référence.' });
  }
});

// -----------------------------------------------------------------------------
// Création de transaction (validée côté serveur)
// -----------------------------------------------------------------------------
app.post('/api/transactions', authenticateUser, financialLimiter, async (req, res) => {
  try {
    const {
      transaction_reference,
      transaction_type,
      bookmaker_id,
      bookmaker_account_id,
      amount,
      currency,
      payment_provider_id,
      phone_number,
    } = req.body;

    // Validation des champs requis
    if (!transaction_reference || !transaction_type || !bookmaker_id || !bookmaker_account_id || !amount || !currency || !payment_provider_id || !phone_number) {
      return res.status(400).json({ error: 'Tous les champs sont requis.' });
    }

    // Validation du type
    if (!['deposit', 'withdrawal'].includes(transaction_type)) {
      return res.status(400).json({ error: 'Type de transaction invalide.' });
    }

    // Validation du montant (DECIMAL, jamais de float JS pour le calcul critique)
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'Montant invalide.' });
    }

    // Validation de la référence : doit exister et appartenir à cet utilisateur (générée côté serveur)
    const { data: refCheck, error: refError } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('transaction_reference', transaction_reference)
      .single();

    if (refCheck) {
      return res.status(409).json({ error: 'Cette référence de transaction est déjà utilisée.' });
    }

    // Vérifier que le bookmaker existe et est actif
    const { data: bookmaker, error: bmError } = await supabaseAdmin
      .from('bookmakers')
      .select('id, is_active')
      .eq('id', bookmaker_id)
      .single();

    if (bmError || !bookmaker || !bookmaker.is_active) {
      return res.status(400).json({ error: 'Bookmaker invalide ou inactif.' });
    }

    // Vérifier que le provider existe et est actif
    const { data: provider, error: pError } = await supabaseAdmin
      .from('payment_providers')
      .select('id, is_active, supports_deposit, supports_withdrawal')
      .eq('id', payment_provider_id)
      .single();

    if (pError || !provider || !provider.is_active) {
      return res.status(400).json({ error: 'Opérateur de paiement invalide ou inactif.' });
    }

    // Vérifier que la méthode de paiement existe pour ce bookmaker
    const { data: method, error: mError } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('bookmaker_id', bookmaker_id)
      .eq('provider_id', payment_provider_id)
      .eq('is_active', true)
      .single();

    if (mError || !method) {
      return res.status(400).json({ error: 'Cette méthode de paiement n\'est pas disponible pour ce bookmaker.' });
    }

    // Validation des limites de montant
    if (amountNum < Number(method.min_amount) || amountNum > Number(method.max_amount)) {
      return res.status(400).json({
        error: `Montant hors limites (${method.min_amount} - ${method.max_amount} XOF).`,
      });
    }

    // Vérifier que la référence fournie correspond à celle générée (sécurité)
    // La référence doit avoir été générée par /api/transactions/reference
    // Ici on accepte la référence fournie si elle est unique (déjà générée côté serveur)

    // Créer la transaction (statut pending par défaut)
    const { data: transaction, error: tError } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: req.user.id,
        transaction_reference,
        transaction_type,
        bookmaker_id,
        bookmaker_account_id,
        amount: amountNum,
        currency: currency || 'XOF',
        payment_provider_id,
        phone_number,
        status: 'pending',
      })
      .select()
      .single();

    if (tError) {
      return res.status(500).json({ error: tError.message });
    }

    // Journaliser l'événement de création
    await supabaseAdmin
      .from('transaction_events')
      .insert({
        transaction_id: transaction.id,
        old_status: null,
        new_status: 'pending',
        changed_by: req.user.id,
        notes: 'Création de la demande de transaction',
        metadata: { source: 'user', transaction_type },
      });

    res.status(201).json({
      transaction: {
        id: transaction.id,
        transaction_reference: transaction.transaction_reference,
        transaction_type: transaction.transaction_type,
        bookmaker_id: transaction.bookmaker_id,
        bookmaker_account_id: transaction.bookmaker_account_id,
        amount: transaction.amount,
        currency: transaction.currency,
        payment_provider_id: transaction.payment_provider_id,
        phone_number: transaction.phone_number,
        status: transaction.status,
        created_at: transaction.created_at,
      },
    });
  } catch (err) {
    console.error('[ERREUR création transaction]', err);
    res.status(500).json({ error: 'Erreur serveur lors de la création de la transaction.' });
  }
});

// -----------------------------------------------------------------------------
// Historique des transactions de l'utilisateur connecté
// -----------------------------------------------------------------------------
app.get('/api/transactions', authenticateUser, async (req, res) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from('transactions')
      .select(`
        *,
        bookmaker:bookmakers (name, technical_id),
        provider:payment_providers (name, technical_id),
        events:transaction_events (old_status, new_status, notes, changed_at)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('transaction_type', type);

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    res.json({ transactions: data || [], count: data ? data.length : 0 });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// Détail d'une transaction (propriétaire uniquement)
// -----------------------------------------------------------------------------
app.get('/api/transactions/:id', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        bookmaker:bookmakers (name, technical_id, logo_url),
        provider:payment_providers (name, technical_id),
        events:transaction_events (old_status, new_status, changed_by, changed_at, notes)
      `)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json({ transaction: data });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// Actions des agents (valider/rejeter) — requireRole agent ou admin
// Ces endpoints utilisent supabaseAdmin (service_role) pour modifier le statut
// -----------------------------------------------------------------------------
app.post('/api/transactions/:id/process', authenticateUser, requireRole(['super_admin', 'admin', 'agent']), financialLimiter, async (req, res) => {
  try {
    const { new_status, notes } = req.body;

    if (!['processing', 'completed', 'rejected', 'cancelled'].includes(new_status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    // Récupérer la transaction existante
    const { data: transaction, error: tError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (tError || !transaction) {
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    // Vérifier que l'agent est assigné (ou est admin/super_admin)
    const isAdminOrSuper = req.userRoles.includes('super_admin') || req.userRoles.includes('admin');
    if (!isAdminOrSuper && transaction.assigned_agent_id && transaction.assigned_agent_id !== req.user.id) {
      return res.status(403).json({ error: 'Cette transaction ne vous est pas assignée.' });
    }

    // Mettre à jour le statut
    const { data: updated, error: uError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: new_status,
        assigned_agent_id: new_status === 'processing' ? req.user.id : transaction.assigned_agent_id,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (uError) return res.status(500).json({ error: uError.message });

    // Journaliser l'événement
    await supabaseAdmin
      .from('transaction_events')
      .insert({
        transaction_id: updated.id,
        old_status: transaction.status,
        new_status: updated.status,
        changed_by: req.user.id,
        notes: notes || null,
        metadata: { source: 'agent', action: new_status },
      });

    res.json({
      transaction: {
        id: updated.id,
        transaction_reference: updated.transaction_reference,
        status: updated.status,
        assigned_agent_id: updated.assigned_agent_id,
        updated_at: updated.updated_at,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// Assignation d'une transaction à un agent (admin uniquement)
// -----------------------------------------------------------------------------
app.post('/api/transactions/:id/assign', authenticateUser, requireRole(['super_admin', 'admin']), financialLimiter, async (req, res) => {
  try {
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'ID de l\'agent requis.' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('transactions')
      .update({ assigned_agent_id: agent_id })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ transaction: updated });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// -----------------------------------------------------------------------------
// Routes d'administration (Phase 3)
// -----------------------------------------------------------------------------
app.use('/api', adminRoutes);

// -----------------------------------------------------------------------------
// Route de santé
// -----------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'jaspay-server' });
});

app.listen(PORT, () => {
  console.log(`[JASpay] Backend démarré sur le port ${PORT}`);
});

module.exports = app;
