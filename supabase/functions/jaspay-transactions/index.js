/**
 * JASpay — Edge Function : jaspay-transactions
 * Remplace les routes Express :
 *   POST /api/transactions/reference
 *   POST /api/transactions
 *   GET /api/transactions
 *   GET /api/transactions/:id
 *
 * Gestion des transactions utilisateur (création, lecture, détail).
 * L'user_id est injecté depuis le JWT, jamais depuis le frontend.
 * service_role utilisé uniquement côté serveur pour l'insertion.
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

  // Client avec clé service_role pour les opérations nécessitant des privilèges élevés
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  );

  // --- Validation décimale stricte (sans parseFloat) ---
  function isValidDecimal(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    const str = String(value).trim();
    // Regex : nombre positif, optionnellement avec décimales (max 2)
    const decimalRegex = /^\d+(\.\d{1,2})?$/;
    if (!decimalRegex.test(str)) return false;
    const num = Number(str);
    return Number.isFinite(num) && num > 0;
  }

  function formatDecimal(value) {
    // Retourne le nombre avec exactement 2 décimales pour PostgreSQL DECIMAL(12,2)
    return Number(String(value).trim()).toFixed(2);
  }

  try {
    // --- GET /api/transactions ---
    if (path === '/api/transactions' && req.method === 'GET') {
      const { status, type, limit = 50, offset = 0 } = Object.fromEntries(url.searchParams);

      let query = supabaseAdmin
        .from('transactions')
        .select(`
          *,
          bookmaker:bookmakers (name, technical_id),
          provider:payment_providers (name, technical_id),
          events:transaction_events (old_status, new_status, notes, changed_at)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (status) query = query.eq('status', status);
      if (type) query = query.eq('transaction_type', type);

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ transactions: data || [], count: data ? data.length : 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/transactions/:id ---
    const idMatch = path.match(/^\/api\/transactions\/([a-f0-9-]+)$/);
    if (idMatch && req.method === 'GET') {
      const transactionId = idMatch[1];

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select(`
          *,
          bookmaker:bookmakers (name, technical_id, logo_url),
          provider:payment_providers (name, technical_id),
          events:transaction_events (old_status, new_status, changed_by, changed_at, notes)
        `)
        .eq('id', transactionId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return new Response(
            JSON.stringify({ error: 'Transaction introuvable' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }

      return new Response(
        JSON.stringify({ transaction: data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/transactions/reference ---
    if (path === '/api/transactions/reference' && req.method === 'POST') {
      const body = await req.json();
      const { transaction_type } = body;

      if (!transaction_type || !['deposit', 'withdrawal'].includes(transaction_type)) {
        return new Response(
          JSON.stringify({ error: 'Type de transaction invalide' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Génération référence côté serveur (jamais par le frontend)
      const prefix = transaction_type === 'deposit' ? 'DEP' : 'WDR';
      const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const random = crypto.randomUUID().substring(0, 8).toUpperCase();
      const reference = `${prefix}-${date}-${random}`;

      // Vérifier l'unicité (défense en profondeur)
      const { data: existing } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('transaction_reference', reference)
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Référence déjà existante, réessayez' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ transaction_reference: reference }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- POST /api/transactions ---
    if (path === '/api/transactions' && req.method === 'POST') {
      const body = await req.json();
      const {
        transaction_reference,
        transaction_type,
        bookmaker_id,
        bookmaker_account_id,
        amount,
        currency,
        payment_provider_id,
        phone_number,
      } = body;

      // Validation des champs requis
      if (!transaction_reference || !transaction_type || !bookmaker_id || !bookmaker_account_id || !amount || !currency || !payment_provider_id || !phone_number) {
        return new Response(
          JSON.stringify({ error: 'Tous les champs sont requis' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validation du type
      if (!['deposit', 'withdrawal'].includes(transaction_type)) {
        return new Response(
          JSON.stringify({ error: 'Type de transaction invalide' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validation décimale stricte du montant (pas de parseFloat)
      if (!isValidDecimal(amount)) {
        return new Response(
          JSON.stringify({ error: 'Montant invalide' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const amountNum = formatDecimal(amount);

      // Vérifier que la référence n'existe pas déjà
      const { data: refCheck } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('transaction_reference', transaction_reference)
        .single();

      if (refCheck) {
        return new Response(
          JSON.stringify({ error: 'Cette référence de transaction est déjà utilisée' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Vérifier que le bookmaker existe et est actif
      const { data: bookmaker, error: bmError } = await supabaseAdmin
        .from('bookmakers')
        .select('id, is_active')
        .eq('id', bookmaker_id)
        .single();

      if (bmError || !bookmaker || !bookmaker.is_active) {
        return new Response(
          JSON.stringify({ error: 'Bookmaker invalide ou inactif' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Vérifier que le provider existe et est actif
      const { data: provider, error: pError } = await supabaseAdmin
        .from('payment_providers')
        .select('id, is_active, supports_deposit, supports_withdrawal')
        .eq('id', payment_provider_id)
        .single();

      if (pError || !provider || !provider.is_active) {
        return new Response(
          JSON.stringify({ error: 'Opérateur de paiement invalide ou inactif' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
        return new Response(
          JSON.stringify({ error: 'Cette méthode de paiement n\'est pas disponible pour ce bookmaker' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validation des limites de montant (comparaison décimale stricte)
      const minAmount = Number(method.min_amount);
      const maxAmount = Number(method.max_amount);
      if (amountNum < minAmount || amountNum > maxAmount) {
        return new Response(
          JSON.stringify({ error: `Montant hors limites (${method.min_amount} - ${method.max_amount} XOF)` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Créer la transaction (statut pending par défaut)
      // L'user_id est injecté depuis le JWT, jamais depuis le frontend
      const { data: transaction, error: tError } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: userId,
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
        return new Response(
          JSON.stringify({ error: tError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Journaliser l'événement de création
      await supabaseAdmin
        .from('transaction_events')
        .insert({
          transaction_id: transaction.id,
          old_status: null,
          new_status: 'pending',
          changed_by: userId,
          notes: 'Création de la demande de transaction',
          metadata: { source: 'user', transaction_type },
        });

      return new Response(
        JSON.stringify({
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
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route non trouvée' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[jaspay-transactions] Erreur:', err.message);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur lors du traitement de la transaction' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}