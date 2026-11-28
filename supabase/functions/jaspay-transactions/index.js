// JASpay — Edge Function : jaspay-transactions (VERSION PROPOSÉE)
// Remplace les routes Express :
//   POST /api/transactions/reference
//   POST /api/transactions
//   GET  /api/transactions
//   GET  /api/transactions/:id
//
// LOGIQUE METIER CONSERVEE A L'IDENTIQUE :
//   - user_id injecte depuis le JWT, jamais depuis le frontend
//   - generation de reference cote serveur (prefixe DEP/WDR + date + alea)
//   - validation decimale stricte (sans parseFloat)
//   - verifications bookmaker actif, provider actif, methode de paiement active
//   - controle des limites min/max de la methode de paiement
//   - statut initial force a 'pending' : le client ne peut pas le choisir
//   - journalisation dans transaction_events a la creation
//   - lecture filtree par user_id (aucun acces aux transactions d'autrui)
//
// MODELE D'ACCES CONSERVE A L'IDENTIQUE :
//   - JWT verifie serveur via /auth/v1/user (ex supabase.auth.getUser)
//   - service_role utilise UNIQUEMENT dans cette fonction, jamais renvoye
//
// DIFFERENCES TECHNIQUES (obligatoires pour corriger le BOOT_ERROR) :
//   1. Deno.serve(handler) en fin de fichier (absent = BOOT_ERROR)
//   2. Aucun import CDN (l'import esm.sh casse le demarrage)
//   3. Routage : extraction du suffixe /api/... (l'original renvoyait 404)
//   4. Correction du bug .single() sur verification d'unicite : PostgREST
//      renvoie 406 quand 0 ligne ; l'original ignorait l'erreur.

const ALLOWED_ORIGINS = [
  'https://jaspay.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function buildCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// Extrait /api/... du chemin complet.
function extractApiPath(pathname) {
  let p = pathname.replace(/\/+$/, '');
  const idx = p.indexOf('/api/');
  if (idx >= 0) p = p.slice(idx);
  return p;
}

// En-tetes PostgREST avec service_role (usage strictement interne).
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
// Remplace .single() en tolerant 0 ligne.
async function restGetOne(pathWithQuery) {
  const rows = await restGet(pathWithQuery + '&limit=1');
  return rows.length > 0 ? rows[0] : null;
}

// POST PostgREST. Renvoie les lignes creees.
async function restPost(table, payload, represent) {
  const res = await fetch(restBase() + table, {
    method: 'POST',
    headers: serviceHeaders({
      Prefer: represent ? 'return=representation' : 'return=minimal',
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('PostgREST POST ' + res.status + ' : ' + text);
  }

  if (!represent) return null;
  return await res.json();
}

// Verifie le JWT aupres du service Auth.
// Equivalent de supabase.auth.getUser(token) sans le SDK.
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

// --- Validation decimale stricte (identique a l'original, sans parseFloat) ---
function isValidDecimal(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const str = String(value).trim();
  const decimalRegex = /^[0-9]+([.][0-9]{1,2})?$/;
  if (!decimalRegex.test(str)) return false;
  const num = Number(str);
  return Number.isFinite(num) && num > 0;
}

function formatDecimal(value) {
  return Number(String(value).trim()).toFixed(2);
}

// --- Validation stricte du format de reference ---
// Format impose : PREFIXE-YYMMDD-8HEX   ex. DEP-251121-A1B2C3D4
const REFERENCE_REGEX = /^(DEP|WDR)-[0-9]{6}-[0-9A-F]{8}$/;
const REFERENCE_PREFIX_BY_TYPE = { deposit: 'DEP', withdrawal: 'WDR' };

// Retourne null si la reference est valide, sinon un message d'erreur.
//
// La reference est testee BRUTE, sans trim() : une reference entouree
// d'espaces est refusee. Le format impose ne contient aucun espace.
function validateReference(reference, transactionType) {
  if (typeof reference !== 'string') {
    return 'Référence de transaction invalide';
  }
  if (!REFERENCE_REGEX.test(reference)) {
    return 'Format de référence invalide';
  }
  const expected = REFERENCE_PREFIX_BY_TYPE[transactionType];
  if (expected && !reference.startsWith(expected + '-')) {
    return 'Référence incompatible avec le type de transaction';
  }
  return null;
}

async function handler(req) {
  const origin = req.headers.get('origin');
  const cors = buildCorsHeaders(origin);

  // Preflight CORS : avant toute logique metier.
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
    // --- GET /api/transactions ---
    if (path === '/api/transactions' && req.method === 'GET') {
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');

      const limit = parseInt(limitParam || '50', 10);
      const offset = parseInt(offsetParam || '0', 10);

      const select =
        '*,bookmaker:bookmakers(name,technical_id),' +
        'provider:payment_providers(name,technical_id),' +
        'events:transaction_events(old_status,new_status,notes,changed_at)';

      let query =
        'transactions?select=' +
        encodeURIComponent(select) +
        '&user_id=eq.' +
        encodeURIComponent(userId) +
        '&order=created_at.desc' +
        '&limit=' +
        limit +
        '&offset=' +
        offset;

      if (status) query += '&status=eq.' + encodeURIComponent(status);
      if (type) query += '&transaction_type=eq.' + encodeURIComponent(type);

      const rows = await restGet(query);

      return jsonResponse(
        { transactions: rows || [], count: rows ? rows.length : 0 },
        200,
        cors
      );
    }

    // --- GET /api/transactions/:id ---
    const idMatch = path.match(/^\/api\/transactions\/([a-f0-9-]+)$/);
    if (idMatch && req.method === 'GET') {
      const transactionId = idMatch[1];

      const select =
        '*,bookmaker:bookmakers(name,technical_id,logo_url),' +
        'provider:payment_providers(name,technical_id),' +
        'events:transaction_events(old_status,new_status,changed_by,changed_at,notes)';

      const query =
        'transactions?select=' +
        encodeURIComponent(select) +
        '&id=eq.' +
        encodeURIComponent(transactionId) +
        '&user_id=eq.' +
        encodeURIComponent(userId) +
        '&limit=1';

      const rows = await restGet(query);

      if (rows.length === 0) {
        return jsonResponse({ error: 'Transaction introuvable' }, 404, cors);
      }

      return jsonResponse({ transaction: rows[0] }, 200, cors);
    }

    // --- POST /api/transactions/reference ---
    if (path === '/api/transactions/reference' && req.method === 'POST') {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: 'Corps JSON invalide' }, 400, cors);
      }

      const { transaction_type } = body || {};

      if (!transaction_type || !['deposit', 'withdrawal'].includes(transaction_type)) {
        return jsonResponse({ error: 'Type de transaction invalide' }, 400, cors);
      }

      // Generation de reference cote serveur (jamais par le frontend)
      const prefix = transaction_type === 'deposit' ? 'DEP' : 'WDR';
      const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const randomPart = crypto.randomUUID().substring(0, 8).toUpperCase();
      const reference = prefix + '-' + date + '-' + randomPart;

      // Verification d'unicite (defense en profondeur)
      const existing = await restGetOne(
        'transactions?select=id&transaction_reference=eq.' + encodeURIComponent(reference)
      );

      if (existing) {
        return jsonResponse({ error: 'Référence déjà existante, réessayez' }, 409, cors);
      }

      return jsonResponse({ transaction_reference: reference }, 200, cors);
    }

    // --- POST /api/transactions ---
    if (path === '/api/transactions' && req.method === 'POST') {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: 'Corps JSON invalide' }, 400, cors);
      }

      const {
        transaction_reference,
        transaction_type,
        bookmaker_id,
        bookmaker_account_id,
        amount,
        currency,
        payment_provider_id,
        phone_number,
        // Retrait en especes : l'agent ne traite que sa zone, et le code OTP
        // vient du bookmaker. Preuve de paiement : capture du recu pour les
        // depots vers un numero marchand sans prelevement automatique.
        withdrawal_city,
        withdrawal_point,
        bookmaker_otp_code,
        payment_proof_path,
      } = body || {};

      // 1. Validation des champs requis
      if (
        !transaction_reference ||
        !transaction_type ||
        !bookmaker_id ||
        !bookmaker_account_id ||
        !amount ||
        !currency ||
        !payment_provider_id ||
        !phone_number
      ) {
        return jsonResponse({ error: 'Tous les champs sont requis' }, 400, cors);
      }

      // 2. Validation du type
      if (!['deposit', 'withdrawal'].includes(transaction_type)) {
        return jsonResponse({ error: 'Type de transaction invalide' }, 400, cors);
      }

      // 2ter. Un retrait se fait en especes chez l'agent : la localite et le
      // point de retrait sont obligatoires (un agent ne traite que sa zone),
      // et le code OTP du bookmaker est la preuve que la demande a bien ete
      // initiee par le titulaire du compte.
      const clean = (v) => (typeof v === 'string' ? v.trim() : '');
      if (transaction_type === 'withdrawal') {
        if (!clean(withdrawal_city) || !clean(withdrawal_point)) {
          return jsonResponse(
            { error: 'Localite et point de retrait obligatoires pour un retrait en especes' },
            400,
            cors
          );
        }
        if (!clean(bookmaker_otp_code)) {
          return jsonResponse(
            { error: 'Code OTP du bookmaker obligatoire pour un retrait en especes' },
            400,
            cors
          );
        }
      }

      // 2quater. La preuve de paiement doit rester dans le dossier de
      // l'utilisateur : on refuse tout chemin qui sortirait de son prefixe.
      const proofPath = clean(payment_proof_path);
      if (proofPath && !proofPath.startsWith(`${userId}/`)) {
        return jsonResponse({ error: 'Chemin de preuve de paiement invalide' }, 400, cors);
      }

      // 2bis. Validation stricte du format de reference
      const referenceError = validateReference(transaction_reference, transaction_type);
      if (referenceError) {
        return jsonResponse({ error: referenceError }, 400, cors);
      }

      // 3. Validation decimale stricte du montant
      if (!isValidDecimal(amount)) {
        return jsonResponse({ error: 'Montant invalide' }, 400, cors);
      }

      const amountNum = formatDecimal(amount);

      // 4. Reference deja utilisee ?
      const refCheck = await restGetOne(
        'transactions?select=id&transaction_reference=eq.' +
          encodeURIComponent(transaction_reference)
      );

      if (refCheck) {
        return jsonResponse(
          { error: 'Cette référence de transaction est déjà utilisée' },
          409,
          cors
        );
      }

      // 5. Bookmaker existant et actif
      const bookmaker = await restGetOne(
        'bookmakers?select=id,is_active&id=eq.' + encodeURIComponent(bookmaker_id)
      );

      if (!bookmaker || !bookmaker.is_active) {
        return jsonResponse({ error: 'Bookmaker invalide ou inactif' }, 400, cors);
      }

      // 6. Provider existant et actif
      const provider = await restGetOne(
        'payment_providers?select=id,is_active,supports_deposit,supports_withdrawal&id=eq.' +
          encodeURIComponent(payment_provider_id)
      );

      if (!provider || !provider.is_active) {
        return jsonResponse(
          { error: 'Opérateur de paiement invalide ou inactif' },
          400,
          cors
        );
      }

      // 7. Methode de paiement active pour ce couple bookmaker/provider
      const method = await restGetOne(
        'payment_methods?select=*' +
          '&bookmaker_id=eq.' +
          encodeURIComponent(bookmaker_id) +
          '&provider_id=eq.' +
          encodeURIComponent(payment_provider_id) +
          '&is_active=eq.true'
      );

      if (!method) {
        return jsonResponse(
          { error: "Cette méthode de paiement n'est pas disponible pour ce bookmaker" },
          400,
          cors
        );
      }

      // 8. Limites de montant
      const minAmount = Number(method.min_amount);
      const maxAmount = Number(method.max_amount);

      if (Number(amountNum) < minAmount || Number(amountNum) > maxAmount) {
        return jsonResponse(
          {
            error:
              'Montant hors limites (' +
              method.min_amount +
              ' - ' +
              method.max_amount +
              ' XOF)',
          },
          400,
          cors
        );
      }

      // 9. Creation : user_id depuis le JWT, statut force a pending
      const inserted = await restPost(
        'transactions',
        {
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
          ...(transaction_type === 'withdrawal'
            ? {
                withdrawal_city: clean(withdrawal_city),
                withdrawal_point: clean(withdrawal_point),
                bookmaker_otp_code: clean(bookmaker_otp_code),
              }
            : {}),
          ...(proofPath ? { payment_proof_path: proofPath } : {}),
        },
        true
      );

      const transaction = Array.isArray(inserted) ? inserted[0] : inserted;

      if (!transaction) {
        return jsonResponse({ error: 'Création de transaction échouée' }, 500, cors);
      }

      // 10. Journalisation de l'evenement de creation
      try {
        await restPost(
          'transaction_events',
          {
            transaction_id: transaction.id,
            old_status: null,
            new_status: 'pending',
            changed_by: userId,
            notes: 'Création de la demande de transaction',
            metadata: { source: 'user', transaction_type },
          },
          false
        );
      } catch (eventErr) {
        // La transaction existe deja : on ne la supprime pas, on journalise.
        console.error(
          '[jaspay-transactions] Evenement non journalise :',
          eventErr && eventErr.message ? eventErr.message : eventErr
        );
      }

      // 11. Reponse : meme format qu'a l'origine (201 + transaction)
      return jsonResponse(
        {
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
        },
        201,
        cors
      );
    }

    return jsonResponse({ error: 'Route non trouvée' }, 404, cors);
  } catch (err) {
    console.error(
      '[jaspay-transactions] Erreur:',
      err && err.message ? err.message : err
    );
    return jsonResponse(
      { error: 'Erreur serveur lors du traitement de la transaction' },
      500,
      cors
    );
  }
}

// Supabase Edge Runtime exige un appel explicite a Deno.serve.
Deno.serve(handler);
