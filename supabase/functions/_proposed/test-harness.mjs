// Banc d'essai local — SIMULATION, pas un test en production.
// Exécute les fonctions proposées sous Node avec un PostgREST simulé en mémoire.
// Objectif : valider le routage, les validations, les codes HTTP et les formats
// de réponse AVANT tout déploiement.

import { readFileSync } from 'node:fs';

const BASE = 'https://fake.supabase.co';
const USER_ID = '11111111-2222-3333-4444-555555555555';

// ---------------- Données simulées ----------------
const db = {
  bookmakers: [
    { id: 'bm-1', name: '1xBet', technical_id: '1xbet', logo_url: 'x.png', is_active: true, display_order: 1 },
    { id: 'bm-2', name: 'Inactif', technical_id: 'off', logo_url: 'y.png', is_active: false, display_order: 2 },
  ],
  payment_providers: [
    { id: 'pp-1', name: 'Flooz', technical_id: 'flooz', is_active: true, supports_deposit: true, supports_withdrawal: true, ussd_instructions: '*155#' },
    { id: 'pp-2', name: 'Off', technical_id: 'off', is_active: false, supports_deposit: false, supports_withdrawal: false, ussd_instructions: null },
  ],
  payment_methods: [
    { id: 'pm-1', bookmaker_id: 'bm-1', provider_id: 'pp-1', is_active: true, min_amount: 500, max_amount: 100000, fee_percent: 1, fee_fixed: 0 },
    { id: 'pm-2', bookmaker_id: 'bm-2', provider_id: 'pp-1', is_active: false, min_amount: 500, max_amount: 100000, fee_percent: 1, fee_fixed: 0 },
  ],
  transactions: [],
  transaction_events: [],
};

let fetchLog = [];

// ---------------- Faux PostgREST ----------------
function parseQuery(qs) {
  const out = [];
  for (const [k, v] of new URLSearchParams(qs)) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    const m = v.match(/^(eq|gte|lte|neq)\.(.*)$/);
    if (m) out.push({ col: k, op: m[1], val: m[2] });
  }
  return out;
}

function applyFilters(rows, filters) {
  return rows.filter((r) =>
    filters.every((f) => {
      if (f.op === 'eq') return String(r[f.col]) === f.val;
      if (f.op === 'gte') return new Date(r[f.col]) >= new Date(f.val);
      return true;
    })
  );
}

function projectEmbedded(rows, select) {
  // Gère les embeds simples : "provider:payment_providers(...)"
  const embeds = [...select.matchAll(/(\w+):(\w+)\(([^)]*)\)/g)];
  return rows.map((r) => {
    const copy = { ...r };
    for (const [, alias, table, cols] of embeds) {
      const fk = table === 'payment_providers' ? 'provider_id' : table === 'bookmakers' ? 'bookmaker_id' : null;
      const target = db[table]?.find((t) => t.id === r[fk]);
      if (target) {
        copy[alias] = Object.fromEntries(cols.split(',').map((c) => [c, target[c]]));
      }
    }
    return copy;
  });
}

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const method = options.method || 'GET';
  const auth = options.headers?.Authorization || '';

  // --- Service Auth simulé ---
  if (u.pathname === '/auth/v1/user') {
    fetchLog.push({ method: 'AUTH', path: u.pathname });
    const token = auth.replace('Bearer ', '');
    if (token === 'valid-token') {
      return new Response(JSON.stringify({ id: USER_ID }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'invalid' }), { status: 401 });
  }

  // --- PostgREST simulé ---
  const table = u.pathname.replace('/rest/v1/', '');
  fetchLog.push({ method, table, search: u.search, auth: auth.slice(0, 30) });

  if (!db[table]) return new Response('[]', { status: 404 });

  if (method === 'GET') {
    let rows = db[table];
    if (table === 'transactions') {
      rows = rows.filter((r) =>
        options.headers?.Authorization?.includes('SERVICE') ? true : true
      );
    }
    rows = applyFilters(rows, parseQuery(u.search));
    const select = u.searchParams.get('select') || '*';
    if (select !== '*') rows = projectEmbedded(rows, select);
    const limit = u.searchParams.get('limit');
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...body };
    db[table].push(row);
    if (options.headers?.Prefer === 'return=representation') {
      return new Response(JSON.stringify([row]), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return new Response(null, { status: 201 });
  }

  if (method === 'DELETE') {
    db[table] = applyFilters(db[table], parseQuery(u.search)).length
      ? db[table].filter((r) => !applyFilters([r], parseQuery(u.search)).length)
      : db[table];
    return new Response(null, { status: 204 });
  }

  return new Response('[]', { status: 200 });
};

// ---------------- Chargement des fonctions ----------------
function loadFunction(path) {
  const source = readFileSync(path, 'utf-8');
  let captured = null;
  globalThis.Deno = {
    env: {
      get: (k) => {
        if (k === 'SUPABASE_URL') return BASE;
        if (k === 'SUPABASE_ANON_KEY') return 'ANON';
        if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'SERVICE';
        return undefined;
      },
    },
    serve: (h) => {
      captured = h;
    },
  };
  const fn = new Function(source + '\nreturn (typeof handler !== "undefined" ? handler : null);');
  fn();
  return captured;
}

// ---------------- Assertions ----------------
let pass = 0;
let fail = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    results.push(`  ✅ ${name}`);
  } else {
    fail++;
    results.push(`  ❌ ${name} ${detail}`);
  }
}

function makeReq(path, opts = {}) {
  const { method = 'GET', origin = 'https://jaspay.vercel.app', token, body } = opts;
  const headers = { origin };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  return new Request(`${BASE}/functions/v1/tmp${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ================= TESTS jaspay-config =================
console.log('\n══════════ jaspay-config ══════════');
const config = loadFunction('./jaspay-config/index.js');
check('handler capturé via Deno.serve', typeof config === 'function');

let r = await config(makeReq('/api/bookmakers', { method: 'OPTIONS' }));
check('OPTIONS → 204', r.status === 204, `reçu ${r.status}`);
check('OPTIONS → allow-origin correct', r.headers.get('access-control-allow-origin') === 'https://jaspay.vercel.app');

r = await new Response(null);
r = await config(makeReq('/api/bookmakers', { method: 'OPTIONS', origin: 'https://evil.com' }));
check('OPTIONS origine non autorisée → pas de allow-origin', r.headers.get('access-control-allow-origin') === null);

r = await config(makeReq('/api/bookmakers'));
let j = await r.json();
check('GET bookmakers sans token → 401', r.status === 401, `reçu ${r.status} ${JSON.stringify(j)}`);

r = await config(makeReq('/api/bookmakers', { token: 'valid-token' }));
j = await r.json();
check('GET bookmakers avec token → 200', r.status === 200, `reçu ${r.status}`);
check('bookmakers : clé "bookmakers" présente', Array.isArray(j.bookmakers));
check('bookmakers : 1 seul actif renvoyé (filtre is_active)', j.bookmakers.length === 1, `reçu ${j.bookmakers.length}`);
check('bookmakers : champs conformes', j.bookmakers[0] && 'display_order' in j.bookmakers[0] && 'technical_id' in j.bookmakers[0]);

r = await config(makeReq('/api/payment-providers', { token: 'valid-token' }));
j = await r.json();
check('GET payment-providers → 200', r.status === 200);
check('providers : clé "providers" présente', Array.isArray(j.providers));
check('providers : 1 seul actif', j.providers.length === 1, `reçu ${j.providers.length}`);
check('providers : ussd_instructions présent', 'ussd_instructions' in j.providers[0]);

r = await config(makeReq('/api/payment-methods?bookmakerId=bm-1', { token: 'valid-token' }));
j = await r.json();
check('GET payment-methods → 200', r.status === 200);
check('methods : clé "methods" présente', Array.isArray(j.methods));
check('methods : embed provider présent', j.methods[0] && j.methods[0].provider && j.methods[0].provider.name === 'Flooz', JSON.stringify(j.methods[0]?.provider));

r = await config(makeReq('/api/health', { token: 'valid-token' }));
j = await r.json();
check('GET health → 200 status ok', r.status === 200 && j.status === 'ok');

r = await config(makeReq('/api/inconnu', { token: 'valid-token' }));
check('route inconnue → 404', r.status === 404, `reçu ${r.status}`);

r = await config(makeReq('/api/bookmakers', { token: 'mauvais-token' }));
check('token invalide → 401', r.status === 401, `reçu ${r.status}`);

r = await config(makeReq('/api/bookmakers', { method: 'POST', token: 'valid-token' }));
check('POST → 405', r.status === 405, `reçu ${r.status}`);

// ================= TESTS jaspay-transactions =================
console.log('\n══════════ jaspay-transactions ══════════');
const tx = loadFunction('./jaspay-transactions/index.js');
check('handler capturé via Deno.serve', typeof tx === 'function');

r = await tx(makeReq('/api/transactions', { method: 'OPTIONS' }));
check('OPTIONS → 204', r.status === 204, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'GET' }));
check('GET sans token → 401', r.status === 401, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'GET', token: 'mauvais' }));
check('GET token invalide → 401', r.status === 401, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'GET', token: 'valid-token' }));
j = await r.json();
check('GET liste → 200', r.status === 200, `reçu ${r.status}`);
check('liste : clé "transactions"', Array.isArray(j.transactions));

r = await tx(makeReq('/api/transactions/reference', { method: 'POST', token: 'valid-token', body: { transaction_type: 'deposit' } }));
j = await r.json();
check('reference deposit → 200', r.status === 200, `reçu ${r.status}`);
check('reference préfixe DEP', typeof j.transaction_reference === 'string' && j.transaction_reference.startsWith('DEP-'), j.transaction_reference);
const refDeposit = j.transaction_reference;

r = await tx(makeReq('/api/transactions/reference', { method: 'POST', token: 'valid-token', body: { transaction_type: 'withdrawal' } }));
j = await r.json();
check('reference withdrawal → préfixe WDR', r.status === 200 && j.transaction_reference.startsWith('WDR-'), j.transaction_reference);

r = await tx(makeReq('/api/transactions/reference', { method: 'POST', token: 'valid-token', body: { transaction_type: 'invalide' } }));
check('reference type invalide → 400', r.status === 400, `reçu ${r.status}`);

const validBody = {
  transaction_reference: refDeposit,
  transaction_type: 'deposit',
  bookmaker_id: 'bm-1',
  bookmaker_account_id: 'acct-123',
  amount: '5000',
  currency: 'XOF',
  payment_provider_id: 'pp-1',
  phone_number: '+22670000000',
};

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, amount: '0' } }));
check('montant 0 → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, amount: '-10' } }));
check('montant négatif → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, amount: '12.345' } }));
check('montant 3 décimales → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, amount: 'abc' } }));
check('montant non numérique → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, amount: '100' } }));
j = await r.json();
check('montant sous le minimum 500 → 400', r.status === 400, `reçu ${r.status} ${JSON.stringify(j)}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, amount: '999999999' } }));
check('montant au-dessus du maximum → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, transaction_type: 'autre' } }));
check('type invalide → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, bookmaker_id: 'bm-2' } }));
check('bookmaker inactif → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, payment_provider_id: 'pp-2' } }));
check('provider inactif → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: { ...validBody, phone_number: undefined } }));
check('champ requis manquant → 400', r.status === 400, `reçu ${r.status}`);

// ---- Nouveaux cas : validation stricte du format de reference ----
const refBase = {
  transaction_type: 'deposit',
  bookmaker_id: 'bm-1',
  bookmaker_account_id: 'acct-123',
  amount: '5000',
  currency: 'XOF',
  payment_provider_id: 'pp-1',
  phone_number: '+22670000000',
};

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_reference: '' } }));
check('référence vide → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_reference: 'nimportequoi' } }));
check('référence sans format → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_reference: 'DEP-2511-A1B2C3D4' } }));
check('référence date trop courte → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_reference: 'DEP-251121-A1B2C3D' } }));
check('référence hex trop court → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_reference: 'DEP-251121-a1b2c3d4' } }));
check('référence hex minuscule → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_reference: 'XYZ-251121-A1B2C3D4' } }));
check('préfixe inconnu → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_type: 'deposit', transaction_reference: 'WDR-251121-A1B2C3D4' } }));
check('préfixe WDR sur deposit → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_type: 'withdrawal', transaction_reference: 'DEP-251121-A1B2C3D4' } }));
check('préfixe DEP sur withdrawal → 400', r.status === 400, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions/reference', { method: 'POST', token: 'valid-token',
  body: { transaction_type: 'deposit' } }));
const freshRef = (await r.json()).transaction_reference;

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token',
  body: { ...refBase, transaction_reference: freshRef } }));
check('référence serveur valide acceptée → 201', r.status === 201, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: validBody }));
j = await r.json();
check('création valide → 201', r.status === 201, `reçu ${r.status} ${JSON.stringify(j)}`);
check('réponse contient transaction', !!j.transaction);
check('statut forcé à pending', j.transaction?.status === 'pending', j.transaction?.status);
check('user_id = celui du JWT', db.transactions[0]?.user_id === USER_ID);
check('montant normalisé "5000.00"', db.transactions[0]?.amount === '5000.00', db.transactions[0]?.amount);
check('événement de création journalisé',
  db.transaction_events.length === db.transactions.length &&
  db.transaction_events.every((e) => e.new_status === 'pending' && e.old_status === null),
  `${db.transaction_events.length} événements pour ${db.transactions.length} transactions`);

r = await tx(makeReq('/api/transactions', { method: 'POST', token: 'valid-token', body: validBody }));
check('référence déjà utilisée → 409', r.status === 409, `reçu ${r.status}`);

r = await tx(makeReq(`/api/transactions/${db.transactions[0].id}`, { method: 'GET', token: 'valid-token' }));
j = await r.json();
check('GET détail existant → 200', r.status === 200, `reçu ${r.status}`);
check('détail : clé "transaction"', !!j.transaction);

r = await tx(makeReq('/api/transactions/00000000-0000-0000-0000-000000000000', { method: 'GET', token: 'valid-token' }));
check('GET détail inexistant → 404', r.status === 404, `reçu ${r.status}`);

r = await tx(makeReq('/api/transactions', { method: 'PUT', token: 'valid-token' }));
check('PUT non supporté → 404', r.status === 404, `reçu ${r.status}`);

// ================= BILAN =================
console.log(results.join('\n'));
console.log(`\n══════════ BILAN : ${pass} réussis / ${fail} échoués ══════════`);
process.exit(fail === 0 ? 0 : 1);
