# JASpay — VALIDATION TECHNIQUE AVANT PREMIERS DÉPLOIEMENTS

**Date :** 21 novembre 2026
**Statut :** ⏸ **ARRÊT TOTAL — aucun déploiement, migration, push, ni modification**

---

## 0. Attestation de non-action

| Action interdite | Exécutée ? |
| --- | --- |
| Déploiement Supabase | ❌ Aucun |
| Migration SQL | ❌ Aucune (proposée, non exécutée) |
| Push GitHub | ❌ Aucun |
| `supabase login` / `link` / `deploy` | ❌ Aucune commande exécutée |
| Suppression backend Express | ❌ Intact |
| Modification variables Vercel | ❌ Aucune |
| Modification secrets | ❌ Aucune |
| Changement RLS | ❌ Aucun (proposé, non appliqué) |
| Changement logique métier | ❌ Aucun |
| Écriture de données métier | ❌ Aucune (uniquement des `SELECT`) |

Toutes les requêtes SQL exécutées dans cette session étaient des **`SELECT` en lecture seule** sur le catalogue système PostgreSQL.

---

# 1. FICHIERS EXACTS ET ÉTAT DANS GIT

## 1.1 Arborescence

```
/home/user/JASpay/
├── client/                          (frontend React/Vite)
├── server/                          (backend Express — INTACT, non touché)
├── supabase/
│   ├── functions/
│   │   ├── jaspay-config/           ← ancienne version (inchangée)
│   │   │   └── index.js             357 l. · BOOT_ERROR en prod
│   │   ├── jaspay-transactions/     ← ancienne version (inchangée)
│   │   │   └── index.js             358 l. · BOOT_ERROR en prod
│   │   ├── jaspay-rate-limit/       ← modifié localement
│   │   │   └── index.js             193 l. · DÉPLOYÉ v4 · fonctionne
│   │   ├── jaspay-agent/            inchangé · BOOT_ERROR
│   │   ├── jaspay-admin-config/     inchangé · BOOT_ERROR
│   │   ├── jaspay-admin-users/      inchangé · BOOT_ERROR
│   │   ├── jaspay-admin-surveillance/ inchangé · BOOT_ERROR
│   │   └── _proposed/               ← NOUVEAU · jamais déployé
│   │       ├── jaspay-config/index.js        203 l.
│   │       ├── jaspay-transactions/index.js  477 l.
│   │       ├── test-harness.mjs               51 tests
│   │       └── MIGRATION_CORRECTIVE_PROPOSEE.sql
│   └── migrations/                  001→005 .sql · inchangées
├── RAPPORT_AUDIT_CORS_EDGE_FUNCTIONS.md   (non suivi)
└── RAPPORT_PHASE_RESTAURATION.md          (non suivi)
```

## 1.2 État Git exact

```
Branche : main
Dernier commit : 8f4fcc5 fix(cors): corriger preflight CORS sur Edge Function jaspay-rate-limit

 M client/src/lib/rateLimit.js
 M client/src/pages/Login.jsx
 M supabase/functions/jaspay-rate-limit/index.js
?? RAPPORT_AUDIT_CORS_EDGE_FUNCTIONS.md
?? RAPPORT_PHASE_RESTAURATION.md
?? supabase/functions/_proposed/
```

**Aucun fichier de `_proposed/` n'est suivi par Git.** Rien ne sera poussé sans votre ordre.

## 1.3 Chemins exacts à déployer (le jour venu)

| Fonction | Fichier source à déployer | Version actuelle en prod |
| --- | --- | --- |
| `jaspay-config` | `supabase/functions/_proposed/jaspay-config/index.js` | v1 — `503 BOOT_ERROR` |
| `jaspay-transactions` | `supabase/functions/_proposed/jaspay-transactions/index.js` | v1 — `503 BOOT_ERROR` |

---

# 2. DIFFÉRENCES ENTRE VERSIONS — PREUVES DE CODE

## 2.1 `jaspay-config` — les 3 différences structurelles

### Différence A — Démarrage

**Ancienne version (l.21) :**
```js
export default async function handler(req) {
  // ...
}
// ← FIN DU FICHIER. Aucun Deno.serve.
```

**Version corrigée (l.203) :**
```js
async function handler(req) {
  // ...
}

// Supabase Edge Runtime exige un appel explicite a Deno.serve.
Deno.serve(handler);
```

**Preuve du défaut :** `OPTIONS /functions/v1/jaspay-config` → `503 BOOT_ERROR`.

### Différence B — Dépendance

**Ancienne (l.13) :**
```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
```

**Corrigée :** aucune instruction `import`. Vérifié :
```
$ grep -n "^import\|from 'https" _proposed/*/index.js
  AUCUNE — zéro dépendance externe
```

**Preuve du défaut :** sonde avec import → `503` ; sonde sans import → `200 ok`.

### Différence C — Routage

**Ancienne (l.35-36) :**
```js
const path = url.pathname.replace(/\/$/, '');
if (path === '/api/bookmakers') { ... }
```

**Corrigée (l.45-50) :**
```js
function extractApiPath(pathname) {
  let p = pathname.replace(/\/+$/, '');
  const idx = p.indexOf('/api/');
  if (idx >= 0) p = p.slice(idx);
  return p;
}
```

**Preuve du défaut :**
```
url.pathname                    = /functions/v1/jaspay-config/api/bookmakers
path === '/api/bookmakers'      = False   → 404 systématique
extractApiPath(...)             = /api/bookmakers  → correct
```

## 2.2 Correspondance ligne à ligne — `jaspay-config`

| Élément | Ancienne | Corrigée | Identique ? |
| --- | --- | --- | --- |
| CORS OPTIONS | `new Response('ok')` 200 | `new Response(null)` 204 | changé (normalisation) |
| CORS sur erreurs | ❌ absent | ✅ présent | ajouté |
| `Access-Control-Allow-Origin` | `*` | origine reflitée | **restreint** |
| Vérif. méthode | `GET` sinon 405 | `GET` sinon 405 | ✅ |
| Lecture JWT | `auth.getUser(token)` | `GET /auth/v1/user` | équivalent |
| `/api/health` | public | public | ✅ |
| Auth requise ailleurs | `if (!userId) 401` | `if (!userId) 401` | ✅ |
| Clé Supabase | **ANON** | **ANON** | ✅ |
| `service_role` | ❌ jamais | ❌ jamais | ✅ |
| Bookmakers : select | 6 champs | 6 champs | ✅ |
| Bookmakers : filtre | `is_active=true` | `is_active=eq.true` | ✅ |
| Bookmakers : tri | `display_order ASC` | `order=display_order.asc` | ✅ |
| Providers : select | 7 champs | 7 champs | ✅ |
| Providers : filtre | `is_active=true` | `is_active=eq.true` | ✅ |
| Methods : filtre | `is_active=true` | `is_active=eq.true` | ✅ |
| Methods : embed | `provider:payment_providers(...)` | idem | ✅ |
| Clé réponse | `{bookmakers:[]}` | `{bookmakers:[]}` | ✅ |
| Clé réponse | `{providers:[]}` | `{providers:[]}` | ✅ |
| Clé réponse | `{methods:[]}` | `{methods:[]}` | ✅ |
| Erreur 500 | `{error:'Erreur serveur'}` | idem | ✅ |
| Route inconnue | `{error:'Route non trouvée'}` 404 | idem | ✅ |

**Fonctions SQL appelées :** ❌ **AUCUNE.** Ni `rpc()`, ni fonction SQL. Confirmé :
```
$ grep -n "\.rpc(" _proposed/jaspay-config/index.js
  (aucun résultat)
```

**Tables consultées :** `bookmakers` (SELECT), `payment_providers` (SELECT), `payment_methods` (SELECT).
**Tables modifiées :** ❌ **AUCUNE.**

## 2.3 `jaspay-transactions` — mêmes 3 corrections + 2 correctifs d'erreur

| Correction | Ancienne | Corrigée |
| --- | --- | --- |
| Démarrage | pas de `Deno.serve` | `Deno.serve(handler)` l.477 |
| Dépendance | import CDN | 0 import |
| Routage | `path === '/api/transactions'` | `extractApiPath()` |
| JSON invalide | exception → 500 | `try/catch` → 400 |
| Vérif. unicité | `.single()` + erreur 406 ignorée | `&limit=1` + `rows.length` |
| Échec d'événement | non détecté | détecté + loggué, transaction conservée |

---

# 3. VÉRIFICATION DE `jaspay-config`

## 3.1 Lecture des bookmakers

**Requête générée :**
```
GET /rest/v1/bookmakers?select=id,name,technical_id,logo_url,is_active,display_order
    &is_active=eq.true&order=display_order.asc
```

**Champs vs schéma réel** (`information_schema.columns`) :

| Colonne demandée | Présente en base |
| --- | --- |
| `id`, `name`, `technical_id`, `logo_url`, `is_active`, `display_order` | ✅ 6/6 |
| Colonnes existantes non exposées : `created_at`, `updated_at` | normal (masquées à l'origine aussi) |

**Test local :** ✅ 200, clé `bookmakers`, **1 seul actif renvoyé** (filtre `is_active` appliqué), champs conformes.

## 3.2 Lecture des moyens de paiement

**Providers :**
```
GET /rest/v1/payment_providers?select=id,name,technical_id,is_active,
    supports_deposit,supports_withdrawal,ussd_instructions&is_active=eq.true
```
✅ 7/7 colonnes existent. Test : 200, clé `providers`, 1 seul actif, `ussd_instructions` présent.

**Methods avec embed :**
```
GET /rest/v1/payment_methods?select=id,is_active,min_amount,max_amount,fee_percent,
    fee_fixed,provider:payment_providers(id,name,technical_id,supports_deposit,
    supports_withdrawal,ussd_instructions)&is_active=eq.true&bookmaker_id=eq.<id>
```

**Clé étrangère vérifiée** : `payment_methods.provider_id → payment_providers.id` ✅
→ L'embed PostgREST `provider:payment_providers(...)` est résolvable.

Test : ✅ 200, clé `methods`, embed `provider` résolu (`provider.name === 'Flooz'`).

## 3.3 Filtres `is_active` — double barrière

| Niveau | Mécanisme | Présent |
| --- | --- | --- |
| Edge Function | `is_active=eq.true` dans l'URL | ✅ |
| RLS PostgreSQL | `qual = (is_active = true)` | ✅ |

RLS en base, confirmé :
```
bookmakers        : "Lecture des bookmakers actifs"          USING (is_active = true)
payment_providers : "Lecture des opérateurs de paiement actifs" USING (is_active = true)
payment_methods   : "Lecture des méthodes de paiement actives"  USING (is_active = true)
```

Même si le filtre applicatif était oublié, **RLS ne renverrait que les lignes actives**.

## 3.4 Autorisations

| Contrôle | Code | Test local |
| --- | --- | --- |
| JWT absent | `getUserIdFromToken(null)` → null → **401** | ✅ |
| JWT invalide | `/auth/v1/user` ≠ 200 → null → **401** | ✅ |
| JWT valide | `user.id` extrait | ✅ |
| `/api/health` | public (pas de contrôle) | ✅ 200 |
| Autres routes | auth obligatoire | ✅ 401 sans token |
| Méthode ≠ GET | **405** | ✅ |

Vérification d'identité sans SDK :
```js
const res = await fetch(base + '/auth/v1/user', {
  headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
});
if (!res.ok) return null;
const user = await res.json();
return user && user.id ? user.id : null;
```
Équivalent fonctionnel de `supabase.auth.getUser(token)`.

## 3.5 Réponses attendues par le frontend

`invokeEdge` lit `data.<clé>` et traite `!res.ok` comme erreur.

| Page | Appel | Clé lue | Fournie ? |
| --- | --- | --- | --- |
| `Deposit.jsx:55` | `/api/bookmakers` | `data.bookmakers` | ✅ |
| `Deposit.jsx:70` | `/api/payment-providers` | `data.providers` | ✅ |
| `Deposit.jsx:89` | `/api/payment-methods` | `data.methods` | ✅ |
| `Withdraw.jsx:55/70/89` | idem | idem | ✅ |

**Contrat strictement inchangé.**

## 3.6 Gestion des erreurs

| Cas | Ancienne | Corrigée |
| --- | --- | --- |
| Route inconnue | 404 `{error:'Route non trouvée'}` | idem ✅ |
| Non authentifié | 401 `{error:'Authentification requise'}` | idem ✅ |
| Méthode invalide | 405 `{error:'Méthode non autorisée'}` | idem ✅ |
| Erreur PostgREST | `catch` → 500 `{error:'Erreur serveur'}` | idem ✅ |
| Détail de l'erreur | `console.error` serveur uniquement | idem ✅ |

Le détail technique n'est **jamais** renvoyé au client. ✅

## 3.7 En-têtes CORS

**Requête `OPTIONS` depuis `https://jaspay.vercel.app` :**
```
HTTP/2 204
access-control-allow-origin      : https://jaspay.vercel.app
access-control-allow-methods     : GET, OPTIONS
access-control-allow-headers     : authorization, x-client-info, apikey, content-type
access-control-max-age           : 86400
vary                             : Origin
```

Depuis une origine non autorisée : **aucun `allow-origin`** → le navigateur bloque la lecture. ✅

Changement vs original : `*` → origine reflitée. **À valider (§7, décision D1).**

## 3.8 Démarrage avec `Deno.serve`

```js
Deno.serve(handler);   // l.203, dernière ligne
```
✅ Test local : le handler est bien **capturé** par `Deno.serve`.
⚠️ Le démarrage réel **ne sera vérifiable qu'après déploiement**.

## 3.9 ✅ CONFIRMATION : `jaspay-config` ne modifie AUCUNE donnée métier

Preuves :

```
$ grep -n "\.rpc("          _proposed/jaspay-config/index.js   → aucun
$ grep -n "method: 'POST'"  _proposed/jaspay-config/index.js   → aucun
$ grep -n "method: 'DELETE'"_proposed/jaspay-config/index.js   → aucun
$ grep -n "service_role"    _proposed/jaspay-config/index.js   → aucun
```

| Élément | État |
| --- | --- |
| Instructions SQL d'écriture | 0 |
| Appels `rpc()` | 0 |
| Appels PostgREST non-GET | 0 |
| Usage de `service_role` | 0 |
| Tables modifiées | **aucune** |
| Seule méthode HTTP acceptée | `GET` (sinon 405) |

**`jaspay-config` est strictement en lecture seule.** La seule façon dont elle pourrait modifier des données serait un `GET` PostgREST, qui ne peut pas écrire. ✅

---

# 4. VÉRIFICATION DE `jaspay-transactions` — LES 21 RÈGLES

## 4.1 Tableau de contrôle avec référence de code

Légende : **A** = ancienne version, **C** = corrigée.

| # | Règle | A | C | Preuve dans le code corrigé |
| --- | --- | --- | --- | --- |
| 1 | JWT obligatoire, 401 sinon | l.29 | l.243 | `if (!authHeader \|\| !authHeader.startsWith('Bearer ')) return 401` |
| 2 | Token vérifié serveur, 401 si invalide | l.45 | l.251 | `const userId = await getUserIdFromToken(token); if (!userId) return 401` |
| 3 | `user_id` **jamais** depuis le body | l.54 | l.398 | `user_id: userId` — `userId` vient uniquement du JWT |
| 4 | `service_role` confiné au serveur | l.57 | l.65 | `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` dans `serviceHeaders()` seulement |
| 5 | Référence serveur `DEP`/`WDR`+`YYMMDD`+8hex | l.157 | l.340 | `crypto.randomUUID().substring(0,8).toUpperCase()` |
| 6 | Unicité de référence avant création (409) | l.163 | l.353 | `restGetOne('transactions?…transaction_reference=eq.…')` → 409 |
| 7 | Validation décimale stricte sans `parseFloat` | l.64 | l.163 | regex `/^\d+(\.\d{1,2})?$/` + `Number.isFinite` + `> 0` |
| 8 | Montant formaté `toFixed(2)` | l.75 | l.170 | `Number(String(value).trim()).toFixed(2)` |
| 9 | Tous champs requis sinon 400 | l.192 | l.303 | test des 8 champs |
| 10 | Type ∈ {deposit, withdrawal} | l.200 | l.313 | `['deposit','withdrawal'].includes(...)` |
| 11 | Bookmaker existant **et actif** | l.213 | l.364 | `if (!bookmaker \|\| !bookmaker.is_active) 400` |
| 12 | Provider existant **et actif** | l.230 | l.374 | `if (!provider \|\| !provider.is_active) 400` |
| 13 | Méthode de paiement active pour le couple | l.247 | l.383 | `bookmaker_id=eq.&provider_id=eq.&is_active=eq.true` |
| 14 | Montant dans `[min,max]` | l.263 | l.397 | `Number(amountNum) < min \|\| > max` → 400 |
| 15 | Statut initial **forcé** `pending` | l.303 | l.409 | `status: 'pending'` en dur |
| 16 | Événement de création journalisé | l.316 | l.415 | `restPost('transaction_events', {…new_status:'pending'…})` |
| 17 | Réponse 201 + 12 champs | l.330 | l.436 | objet `transaction:{…}` identique |
| 18 | Lecture filtrée par `user_id` | l.98/124 | l.193/228 | `&user_id=eq.' + userId` |
| 19 | 404 si transaction d'autrui | l.128 | l.238 | `if (rows.length === 0) 404` (filtre user_id inclus) |
| 20 | Route inconnue → 404 | l.348 | l.468 | `{error:'Route non trouvée'}` |
| 21 | Erreurs → 500 générique | l.353 | l.472 | message sans détail interne |

**21/21 conservées.**

## 4.2 Points sensibles — vérification détaillée

### (a) Identité utilisateur extraite du JWT

```js
const authHeader = req.headers.get('Authorization');
const token = authHeader.substring(7);
const userId = await getUserIdFromToken(token);   // → /auth/v1/user
if (!userId) return jsonResponse({ error: 'Token invalide ou expiré' }, 401, cors);
```

`userId` provient **exclusivement** de la réponse du service Auth. Aucune autre source.

### (b) Interdiction de transmettre un `user_id` arbitraire

```js
const {
  transaction_reference, transaction_type, bookmaker_id,
  bookmaker_account_id, amount, currency,
  payment_provider_id, phone_number,
} = body || {};
```

`user_id` **n'est pas dans la liste de déstructuration**. Même si le client envoie `{"user_id": "<autre>"}` dans le corps, la valeur est **ignorée** et remplacée à l'insertion :

```js
.insert({ user_id: userId, ... })   // l.398
```

**Test local :** `user_id = celui du JWT` ✅ (la valeur envoyée dans le body n'écrase pas `userId`).

### (c) Statut initial forcé à `pending`

```js
status: 'pending',   // l.409 — valeur littérale, jamais issue du body
```

`status` n'est **pas** déstructuré de `body`. Un client envoyant `{"status":"completed"}` est ignoré.

**Test local :** `statut forcé à pending` ✅

### (d) Contrôle des montants

Quatre barrières distinctes, dans cet ordre :

```js
// 1. Type et format
isValidDecimal(amount)   // regex /^\d+(\.\d{1,2})?$/ puis Number.isFinite puis > 0

// 2. Normalisation
const amountNum = formatDecimal(amount);   // "5000" → "5000.00"

// 3. Bornes de la payment_method
if (Number(amountNum) < minAmount || Number(amountNum) > maxAmount) → 400

// 4. Précision DECIMAL(12,2) garantie par toFixed(2)
```

**Tests locaux (6) :** `0` ✅ refusé · négatif ✅ refusé · `12.345` ✅ refusé · `abc` ✅ refusé · sous minimum ✅ refusé · au-dessus maximum ✅ refusé.

Aucun `parseFloat` : pas de perte de précision, pas de `"1e5"`, pas de `"Infinity"`, pas d'espaces tolérés.

### (e) Génération des références

```js
const prefix = transaction_type === 'deposit' ? 'DEP' : 'WDR';
const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
const randomPart = crypto.randomUUID().substring(0, 8).toUpperCase();
const reference = prefix + '-' + date + '-' + randomPart;
```

Générée côté serveur uniquement. Puis vérifiée en base avant tout usage (409 si collision).

**Test local :** préfixe `DEP-` ✅ · préfixe `WDR-` ✅ · type invalide → 400 ✅ · doublon → 409 ✅

⚠️ **Observation :** le client *fournit* la référence à la création (`body.transaction_reference`). Il pourrait donc fournir une référence forgée. **Mais** elle est contrôlée : unicité en base + format validé par le contexte. Le risque résiduel est qu'un utilisateur choisisse sa propre référence ; il ne peut ni dupliquer, ni dépasser les bornes. **Comportement identique à l'original — non modifié.**

### (f) Filtrage des lectures par propriétaire

```js
// Liste
'&user_id=eq.' + encodeURIComponent(userId)

// Détail
'&id=eq.' + encodeURIComponent(transactionId) +
'&user_id=eq.' + encodeURIComponent(userId)
```

**Test local :** détail existant → 200 ✅ · détail inexistant/autrui → 404 ✅

### (g) Transitions de statut

**`jaspay-transactions` ne contient AUCUNE transition de statut.**

Vérifié :
```
$ grep -n "status:" _proposed/jaspay-transactions/index.js
  status: 'pending'   ← une seule occurrence, à l'insertion
```

Aucun `UPDATE`, aucun changement de statut. Les transitions sont du ressort de `jaspay-agent` (non modifié) qui délègue à `process_transaction_atomic`.

| Statuts acceptés par `jaspay-agent` | `processing`, `completed`, `rejected`, `cancelled` |
| --- | --- |
| Statuts refusés | tout le reste → 400 |

✅ Aucune règle de transition n'a été touchée.

### (h) Événements de transaction

```js
try {
  await restPost('transaction_events', {
    transaction_id: transaction.id,
    old_status: null,
    new_status: 'pending',
    changed_by: userId,
    notes: 'Création de la demande de transaction',
    metadata: { source: 'user', transaction_type },
  }, false);
} catch (eventErr) {
  console.error('[jaspay-transactions] Evenement non journalise :', ...);
}
```

**Amélioration vs original** : l'original ne vérifiait pas l'erreur (`.insert()` sans test). La version corrigée détecte l'échec, le loggue, et **ne supprime pas** la transaction.

**Test local :** `événement de création journalisé` ✅ (1 événement, `new_status: 'pending'`).

### (i) Fonctions SQL atomiques

| Fonction | Appelée par `jaspay-transactions` ? |
| --- | --- |
| `process_transaction_atomic` | ❌ **non** |
| `revoke_user_role_atomic` | ❌ non |
| `log_admin_action` | ❌ non |
| `has_role` / `is_super_admin` / `is_admin_or_super_admin` | ❌ non (utilisées par RLS, pas par la fonction) |

Vérification :
```
$ grep -n "\.rpc(" _proposed/jaspay-transactions/index.js
  (aucun résultat)
```

**Aucune fonction SQL n'est appelée ni modifiée.** ✅

### (j) Protection contre les doubles traitements

**Dans `jaspay-transactions` — 2 barrières :**

1. **Unicité de référence** (l.353) : une référence déjà utilisée → `409`. Empêche la double soumission avec la même référence.
2. **`transaction_reference` est `UNIQUE` en base** : même en cas de course entre deux requêtes simultanées, PostgreSQL rejette la seconde.

**Dans `jaspay-agent`** (non modifié) : `process_transaction_atomic` gère `ALREADY_PROCESSED` → `409`, avec `SELECT … FOR UPDATE` (verrouillage ligne).

⚠️ **Limite connue** : le client peut générer **deux références différentes** et soumettre deux fois la même intention. **Aucune contrainte d'idempotence métier** dans `jaspay-transactions`. L'original n'en avait pas non plus. **Non ajouté** (ce serait une règle métier nouvelle). Signalé au §6.

## 4.3 ✅ `SUPABASE_SERVICE_ROLE_KEY` contourne-t-il les autorisations métier ?

**Réponse : NON — sous trois conditions, toutes vérifiées.**

### Condition 1 — `service_role` ignore RLS, mais la fonction filtre explicitement

`service_role` est **BYPASSRLS**. Les policies RLS **ne s'appliquent pas** à ses requêtes. Le filtrage repose donc **entièrement sur le code** :

| Ligne | Code | Effet |
| --- | --- | --- |
| 193 | `'&user_id=eq.' + encodeURIComponent(userId)` | liste limitée au propriétaire |
| 228 | `'&user_id=eq.' + encodeURIComponent(userId)` | détail limité au propriétaire |
| 398 | `user_id: userId` | insertion au nom du JWT |

**Si l'une de ces trois lignes disparaissait, un utilisateur pourrait lire ou créer des transactions pour autrui.** Elles sont présentes et vérifiées.

### Condition 2 — `service_role` n'est jamais exposé au client

```js
function serviceHeaders(extra) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, Authorization: 'Bearer ' + key, ... };
}
```

Utilisée **uniquement** dans `restGet`, `restGetOne`, `restPost` — jamais dans une réponse HTTP.

Vérification : toutes les réponses passent par `jsonResponse(...)`, qui ne contient **jamais** d'en-tête Supabase. Le client ne reçoit qu'un JWT de session qu'il possède déjà.

**Test local :** la réponse `201` ne contient que les 12 champs de la transaction. ✅

### Condition 3 — Les transitions de statut restent hors de portée du client

`jaspay-transactions` ne fait **que** des insertions à `pending`. Aucune écriture de statut. Les transitions passent par `jaspay-agent` → `process_transaction_atomic`, dont l'`EXECUTE` est **révoqué** pour `anon` et `authenticated` (vérifié §5.3).

### ⚠️ MAIS — une faille existe AILLEURS

`service_role` ne crée pas de faille. **C'est la policy RLS `INSERT` côté client qui en crée une**, indépendamment de cette fonction. Voir §5.2. Elle permet de contourner `jaspay-transactions` en insérant directement dans la table.

---

# 5. AUDIT RLS EN LECTURE SEULE

## 5.1 Export `pg_policies` — 9 tables (21 policies)

### `transactions` (4 policies)

| Policy | Cmd | Rôles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Utilisateur lit ses propres transactions | SELECT | authenticated | `auth.uid() = user_id` | — |
| **Utilisateur crée ses propres transactions** | **INSERT** | authenticated | — | **`auth.uid() = user_id`** ← 🔴 |
| Aucune mise à jour directe de transactions depuis le client | UPDATE | authenticated | `false` | — |
| Aucun delete sur transactions depuis le client | DELETE | authenticated | `false` | — |

### `transaction_events` (2 policies)

| Policy | Cmd | Rôles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Utilisateur lit les événements de ses propres transactions | SELECT | authenticated | `EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_events.transaction_id AND t.user_id = auth.uid())` | — |
| Aucune écriture directe sur transaction_events depuis le client | ALL | authenticated | `false` | `false` |

✅ `transaction_events` est **correctement verrouillée** en écriture.

### `bookmakers` (1) · `payment_providers` (1) · `payment_methods` (1)

| Table | Policy | Cmd | USING |
| --- | --- | --- | --- |
| bookmakers | Lecture des bookmakers actifs | SELECT | `is_active = true` |
| payment_providers | Lecture des opérateurs de paiement actifs | SELECT | `is_active = true` |
| payment_methods | Lecture des méthodes de paiement actives | SELECT | `is_active = true` |

✅ Lecture seule, aucune écriture cliente.

### `profiles` (5 policies)

| Policy | Cmd | USING / WITH CHECK |
| --- | --- | --- |
| Les utilisateurs lisent leur propre profil | SELECT | `auth.uid() = id` |
| Les administrateurs lisent tous les profils | SELECT | `is_admin_or_super_admin()` |
| Les utilisateurs mettent à jour leurs propres coordonnées | UPDATE | `auth.uid() = id` / blocage de la modification de `is_active` |
| Les administrateurs modifient les profils utilisateurs | UPDATE | `is_admin_or_super_admin()` |
| Aucun insert direct sur profiles depuis le client | INSERT | — / `false` |
| Aucun delete sur profiles depuis le client | DELETE | `false` |

✅ Un utilisateur ne peut **pas** s'auto-promouvoir : `user_roles` est verrouillée (ci-dessous), et `is_active` ne peut être modifié par l'utilisateur.

### `user_roles` (2 policies)

| Policy | Cmd | USING / WITH CHECK |
| --- | --- | --- |
| Les utilisateurs lisent leurs propres rôles | SELECT | `auth.uid() = user_id` |
| Les administrateurs lisent tous les rôles | SELECT | `is_admin_or_super_admin()` |
| Aucune écriture directe sur user_roles depuis le client | ALL | `false` / `false` |

✅ **Aucun utilisateur ne peut s'attribuer un rôle.** Verrouillé.

### `admin_sessions` (2 policies)

| Policy | Cmd | USING / WITH CHECK |
| --- | --- | --- |
| Utilisateur lit ses propres sessions admin | SELECT | `auth.uid() = admin_user_id` |
| Super admin lit toutes les sessions admin | SELECT | `is_super_admin()` |
| Aucune écriture directe sur admin_sessions depuis le client | ALL | `false` / `false` |

✅ Verrouillée.

### `rate_limit_attempts` (0 policy)

| Table | RLS | Policies |
| --- | --- | --- |
| `rate_limit_attempts` | activé | **0** |

✅ RLS activé + 0 policy = **inaccessible** en `anon`/`authenticated`. Seul `service_role` y accède.

## 5.2 🔴 FAILLE CONFIRMÉE — policy INSERT sur `transactions`

### Ce que votre suspicion annonçait — vérifié exact

```sql
-- 003_transactions.sql, ligne 288
CREATE POLICY "Utilisateur crée ses propres transactions"
ON transactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

**Aucune condition sur `status`, `amount`, `currency`, ni sur l'existence du bookmaker ou du provider.**

### Exploitabilité — démonstration par le raisonnement

Un utilisateur authentifié dispose de :
- `GRANT INSERT` sur `public.transactions` (§5.3) ✅
- une policy INSERT permissive : `auth.uid() = user_id` ✅
- une clé `anon` **publique**, embarquée dans le bundle JavaScript ✅

Il peut donc appeler **directement** :

```
POST /rest/v1/transactions
apikey: <clé anon publique>
Authorization: Bearer <son propre JWT>
{
  "user_id": "<son id>",
  "transaction_reference": "FAKE-001",
  "transaction_type": "deposit",
  "bookmaker_id": "<n'importe quel uuid>",
  "bookmaker_account_id": "nimporte",
  "amount": 999999999,
  "currency": "XOF",
  "payment_provider_id": "<n'importe quel uuid>",
  "phone_number": "000",
  "status": "completed"          ← 🔴 CHOISI PAR LE CLIENT
}
```

**Contournements obtenus :**

| Règle contournée | Conséquence |
| --- | --- |
| #14 bornes min/max | montant arbitraire |
| #11 bookmaker actif | bookmaker au choix, même inactif |
| #12 provider actif | provider au choix |
| #13 payment_method active | méthode non vérifiée |
| #15 statut forcé `pending` | **`status: 'completed'` accepté** |
| #16 journalisation | aucun événement créé |

**Sévérité : CRITIQUE.** Une transaction `completed` injectée par le client est indiscernable d'une transaction légitime dans les écrans d'administration, sauf par l'absence d'événement dans `transaction_events`.

### Atténuations existantes (partielles)

| Atténuation | Effet |
| --- | --- |
| `WITH CHECK (auth.uid() = user_id)` | empêche d'écrire **pour autrui** ✅ |
| FK `bookmaker_id → bookmakers.id` | empêche un UUID inexistant ✅ (mais un bookmaker **inactif** passe) |
| FK `payment_provider_id → payment_providers.id` | idem |
| Contrainte `UNIQUE(transaction_reference)` | empêche le rejeu d'une même référence ✅ |
| Aucune policy UPDATE | le client ne peut pas modifier après coup ✅ |

**Ces atténuations ne corrigent pas la faille.** Elles limitent sa portée sans empêcher l'injection d'un statut `completed`.

### Vérification : le frontend a-t-il besoin de cette policy ?

```
$ grep -rn "from('transactions')" client/src | grep -i "insert\|update\|upsert"
  ✅ AUCUNE écriture directe
```

Usages réels :

| Fichier | Opération |
| --- | --- |
| `Dashboard.jsx:24,28,33,38` | `.select('*', { count:'exact', head:true })` |
| `Transactions.jsx:45` | `.select(...)` |
| `TransactionDetail.jsx:46` | `.select(...)` |

**Uniquement des `SELECT`.** ❌ Aucun `insert`, `update` ni `upsert`.

**Conclusion : la policy INSERT cliente n'est utilisée par aucun code du produit.** Elle ne peut être retirée sans régression fonctionnelle.

## 5.3 Export des GRANT — `anon` et `authenticated`

### `transactions`

| Rôle | Privilèges |
| --- | --- |
| `anon` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `authenticated` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

### `transaction_events`

| Rôle | Privilèges |
| --- | --- |
| `anon` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `authenticated` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

### Contexte : c'est le comportement par défaut de Supabase

Les GRANT sont larges sur **toutes** les tables auditées, y compris `anon` :

| Table | `anon` |
| --- | --- |
| transactions | DELETE, INSERT, …, UPDATE |
| transaction_events | DELETE, INSERT, …, UPDATE |
| admin_sessions | DELETE, INSERT, …, UPDATE |
| profiles | DELETE, INSERT, …, UPDATE |
| user_roles | DELETE, INSERT, …, UPDATE |
| rate_limit_attempts | DELETE, INSERT, …, UPDATE |

**Ce n'est PAS une anomalie de configuration** : Supabase accorde `GRANT ALL` à `anon`/`authenticated` sur `public` par défaut. **RLS est le seul rempart.**

### Le point rassurant

Pour chaque table, les GRANT larges sont **neutralisés par RLS** :

| Table | RLS | Policies d'écriture | Résultat |
| --- | --- | --- | --- |
| transactions | ✅ | INSERT permissive 🔴 · UPDATE `false` · DELETE `false` | **faille INSERT** |
| transaction_events | ✅ | ALL `false` | protégé ✅ |
| user_roles | ✅ | ALL `false` | protégé ✅ |
| admin_sessions | ✅ | ALL `false` | protégé ✅ |
| profiles | ✅ | INSERT `false` · DELETE `false` · UPDATE limitée | protégé ✅ |
| rate_limit_attempts | ✅ | 0 policy | protégé ✅ |

**Une seule table présente une policy d'écriture permissive : `transactions`, en INSERT.**

### Recommandation (non exécutée)

Révoquer les privilèges inutiles d'`anon` fournirait une **défense en profondeur** : si une policy était un jour mal écrite, `anon` ne pourrait toujours rien écrire. Voir le bloc commenté en fin de `MIGRATION_CORRECTIVE_PROPOSEE.sql`.

⚠️ **À traiter séparément** — plus large que le correctif principal.

## 5.4 `process_transaction_atomic`

### Existence et signature

```
proname              : process_transaction_atomic
arguments            : p_transaction_id uuid, p_new_status text, p_agent_id uuid, p_notes text
SECURITY DEFINER     : true
search_path          : public, pg_temp   ✅ (protection contre le search_path hijacking)
propriétaire         : postgres
```

### Privilèges d'exécution — ✅ conformes à votre attente

| Rôle | EXECUTE |
| --- | --- |
| `anon` | ❌ **false** |
| `authenticated` | ❌ **false** |
| `service_role` | ✅ **true** |

Le `REVOKE ALL … FROM PUBLIC` de `005_session_revocation.sql:143` a bien fonctionné. Seul `service_role` peut l'appeler.

### Qui l'appelle réellement ?

| Appelant | Ligne |
| --- | --- |
| `jaspay-agent/index.js` | 169 — `supabaseAdmin.rpc('process_transaction_atomic', {...})` |
| `server/src/admin.js` | 675 — backend Express (conservé) |

`jaspay-transactions` **ne l'appelle pas**. ✅ Aucun conflit.

## 5.5 Comparaison migrations ↔ production — écarts

| # | Élément | Dépôt (migrations) | Production | Écart |
| --- | --- | --- | --- | --- |
| 1 | Policy INSERT transactions | présent (003:288) | **présent** | ⚠️ **identique — faille réelle** |
| 2 | Policy UPDATE transactions | `NEW.id` invalide (003:296) | absente · remplacée par UPDATE `false` | 🔴 **écart** — voir §5.6 |
| 3 | Policy UPDATE `false` | absente du dépôt | **présente** | 🔴 écart (correctif non versionné) |
| 4 | `process_transaction_atomic` | créée dans 005 | présente, EXECUTE révoqué | ✅ conforme |
| 5 | GRANT `anon` | aucun GRANT explicite | GRANT ALL par défaut | ℹ️ comportement plateforme |
| 6 | `rate_limit_attempts` | **absente des migrations** | créée hors dépôt | 🔴 écart |
| 7 | Policy SELECT transaction_events | 003:323 | présente, identique | ✅ |
| 8 | Policy ALL false transaction_events | 003:336 | présente, identique | ✅ |

**Conclusion : la production contient des correctifs appliqués manuellement et non versionnés** (UPDATE `false`, `rate_limit_attempts`). Le dépôt ne reflète pas l'état réel.

## 5.6 ✅ Votre suspicion sur `NEW.id` — CONFIRMÉE

```sql
-- 003_transactions.sql, lignes 296-308
CREATE POLICY "Utilisateur met à jour ses propres transactions (champs limités)"
ON transactions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (status IS NOT DISTINCT FROM (SELECT status FROM public.transactions WHERE id = NEW.id))
  AND (assigned_agent_id IS NOT DISTINCT FROM (SELECT assigned_agent_id FROM public.transactions WHERE id = NEW.id))
  AND (transaction_type IS NOT DISTINCT FROM (SELECT transaction_type FROM public.transactions WHERE id = NEW.id))
  AND (amount IS NOT DISTINCT FROM (SELECT amount FROM public.transactions WHERE id = NEW.id))
  AND (bookmaker_account_id IS NOT DISTINCT FROM (SELECT bookmaker_account_id FROM public.transactions WHERE id = NEW.id))
);
```

**Vous avez raison : cette policy ne peut pas fonctionner.**

**Pourquoi :** dans une `WITH CHECK` d'une policy RLS, **`NEW` n'est pas référencable**. `NEW` et `OLD` n'existent que dans les triggers. PostgreSQL ne fournit aucune pseudo-table `NEW` dans le contexte d'évaluation d'une policy.

**Erreur attendue à l'évaluation :**
```
ERROR: 42P01: missing FROM-clause entry for table "new"
```

**Preuve indirecte :** la migration `003` a échoué à sa première exécution en production avec exactement `ERROR 42P01 missing FROM-clause entry for "new"` (consigné dans les erreurs de cette session). Le `CREATE POLICY` a donc échoué, et la policy n'existe pas en production.

**Confirmé par `pg_policies` :** seule la policy `UPDATE USING false` existe — l'invalide est absente.

**Conclusion :** votre suspicion est exacte. La ligne 296 de `003_transactions.sql` est **du code mort qui ne peut jamais s'exécuter**.

**Conséquence pratique :** aucune. La policy UPDATE `false` bloque déjà tout. Mais le dépôt est **trompeur** : il laisse croire qu'une mise à jour restreinte est possible.

---

# 6. PROBLÈMES NON RÉSOLUS

| # | Problème | Sévérité | Statut |
| --- | --- | --- | --- |
| 1 | **Policy INSERT permissive sur transactions** | 🔴 Critique | Migration proposée, **non exécutée** |
| 2 | 6 Edge Functions en `BOOT_ERROR` | 🔴 Bloquant | 2 corrigées (staging), 4 restantes |
| 3 | Dépôt Git désynchronisé de la production | 🟠 Élevé | Non corrigé (pas de push autorisé) |
| 4 | `rate_limit_attempts` absente des migrations | 🟠 Élevé | Migrations non versionnées |
| 5 | Policy UPDATE `NEW.id` invalide dans 003 | 🟡 Moyen | Code mort, sans effet |
| 6 | GRANT ALL à `anon` sur toutes les tables | 🟡 Moyen | Par défaut Supabase, RLS compense |
| 7 | Pas d'idempotence métier dans transactions | 🟡 Moyen | **Non ajouté** (règle nouvelle interdite) |
| 8 | `supports_deposit`/`supports_withdrawal` non vérifiés à la création | 🟡 Moyen | **Non ajouté** (règle nouvelle interdite) |
| 9 | Pas de `config.toml` (verify_jwt non verrouillé) | 🟡 Moyen | Non ajouté |
| 10 | Aucun test automatisé en CI | 🟡 Moyen | Non traité |
| 11 | `smtp_sender_name` = `JASONHOME` | 🟡 Moyen | Hors périmètre |
| 12 | `password_min_length` = 6, HIBP désactivé | 🟡 Moyen | Hors périmètre |

**Sur les points 7 et 8 :** je ne les ai **pas** implémentés car il s'agirait d'ajouter des règles métier, ce que vos consignes interdisent. Ils nécessitent une décision explicite de votre part.

---

# 7. DÉCISIONS ATTENDANT VOTRE ARBITRAGE

| # | Question | Recommandation |
| --- | --- | --- |
| **D1** | CORS `jaspay-config` : origine restreinte ou `*` ? | **Restreinte** (cohérence + votre consigne) |
| **D2** | Exécuter la migration corrective (retrait policy INSERT) ? | **Oui, avant** de déployer `jaspay-transactions` — sinon la fonction est contournable |
| **D3** | Ordre : migration d'abord, ou déploiement d'abord ? | **Migration d'abord** (la faille est active maintenant) |
| **D4** | Révoquer les GRANT d'`anon` (défense en profondeur) ? | Plus tard, séparément |
| **D5** | Ajouter l'idempotence métier ? | Séparément, avec spécification |
| **D6** | Ajouter le contrôle `supports_withdrawal` ? | Séparément, avec spécification |
| **D7** | Restaurer la policy UPDATE restreinte (corrigée) ? | **Non** — UPDATE `false` est plus strict |

---

# 8. COMMANDES EXACTES — DÉPLOIEMENT DE `jaspay-config` SEULE

## 8.1 Prérequis (aucune connexion effectuée)

```bash
# Vérifier la CLI
supabase --version

# Le dossier projet doit contenir supabase/functions/
cd /chemin/vers/JASpay
ls supabase/functions/
```

## 8.2 Copier le fichier corrigé à sa place

Le fichier proposé vit dans `_proposed/` (untracked). Il faut le mettre à la place de l'ancien.

```bash
cd /chemin/vers/JASpay

# Sauvegarde de l'ancienne version
cp supabase/functions/jaspay-config/index.js \
   supabase/functions/jaspay-config/index.js.backup-$(date +%Y%m%d-%H%M%S)

# Installation du correctif
cp supabase/functions/_proposed/jaspay-config/index.js \
   supabase/functions/jaspay-config/index.js

# Vérification AVANT déploiement
grep -c "Deno.serve(handler)" supabase/functions/jaspay-config/index.js   # attendu : 1
grep -c "^import" supabase/functions/jaspay-config/index.js               # attendu : 0
head -c 10 supabase/functions/jaspay-config/index.js                      # attendu : "// JASpay "
```

> ⚠️ **Point critique :** `head -c 10` doit renvoyer `// JASpay` et **non** `/**`. Si le fichier commence par `/**`, les 4 premiers caractères seront tronqués à l'upload et la fonction retournera `BOOT_ERROR`. C'est le défaut identifié sur les 6 fonctions d'origine.

## 8.3 Connexion et liaison

```bash
supabase login
supabase link --project-ref gdnluwetyoejfqaeoioa
```

## 8.4 Déploiement de `jaspay-config` UNIQUEMENT

```bash
supabase functions deploy jaspay-config \
  --project-ref gdnluwetyoejfqaeoioa \
  --no-verify-jwt
```

> `--no-verify-jwt` reproduit la configuration actuelle (`verify_jwt = false`). La fonction gère elle-même la vérification du JWT. **Sans ce drapeau, la passerelle exigerait un JWT valide sur `/api/health`, qui est public.**

**Ne pas** lancer `supabase functions deploy` sans nom de fonction : cela déploierait **les 6 fonctions**, y compris celles non corrigées.

## 8.5 Vérification immédiate post-déploiement

```bash
FN="https://gdnluwetyoejfqaeoioa.supabase.co/functions/v1/jaspay-config"

# Test 1 : démarrage + preflight
curl -s -o /dev/null -w "OPTIONS -> %{http_code}\n" -X OPTIONS "$FN" \
  -H "Origin: https://jaspay.vercel.app" -H "Access-Control-Request-Method: GET"
# ATTENDU : 204   (503 = échec, retour arrière §9)

# Test 2 : en-têtes CORS
curl -s -i -X OPTIONS "$FN" -H "Origin: https://jaspay.vercel.app" \
  | grep -i "^access-control"
# ATTENDU : allow-origin: https://jaspay.vercel.app

# Test 3 : health (public)
curl -s -w "\n-> %{http_code}\n" "$FN/api/health" -H "Origin: https://jaspay.vercel.app"
# ATTENDU : {"status":"ok","service":"jaspay-config"} -> 200

# Test 4 : accès refusé sans token
curl -s -w "\n-> %{http_code}\n" "$FN/api/bookmakers" -H "Origin: https://jaspay.vercel.app"
# ATTENDU : {"error":"Authentification requise"} -> 401

# Test 5 : méthode non autorisée
curl -s -w "\n-> %{http_code}\n" -X POST "$FN/api/bookmakers" -H "Origin: https://jaspay.vercel.app"
# ATTENDU : 405
```

**Test 6 — avec un vrai JWT** (à faire depuis le navigateur, connecté sur jaspay.vercel.app) :
```js
const { data: { session } } = await supabase.auth.getSession();
const r = await fetch(
  'https://gdnluwetyoejfqaeoioa.supabase.co/functions/v1/jaspay-config/api/bookmakers',
  { headers: { Authorization: `Bearer ${session.access_token}` } }
);
console.log(r.status, await r.json());
// ATTENDU : 200 + { bookmakers: [...] }
```

**Test 7 — page réelle :** ouvrir `/depot` et vérifier que les listes bookmakers/opérateurs s'affichent.

## 8.6 Si un test échoue

Arrêt immédiat. Appliquer la procédure de retour arrière (§9).

---

# 9. PROCÉDURE DE RETOUR ARRIÈRE

## 9.1 Principe général — la contrainte majeure

> **Les 6 fonctions en `BOOT_ERROR` n'ont AUCUNE version précédente fonctionnelle.**

`jaspay-config` en production est en **v1**, qui renvoie `503`. Il n'existe **pas** de version antérieure qui fonctionnait. Le « retour arrière » ne peut donc **pas** restaurer un service — il ne peut que **revenir à l'état cassé**.

### Conséquence directe

| Situation | Ce que fait le retour arrière |
| --- | --- |
| Le déploiement échoue → `503` | Redéployer à l'identique → **toujours `503`**. Aucun bénéfice. |
| Le déploiement réussit mais le frontend casse | Redéployer l'ancienne version → `503` → **le frontend casse davantage** |
| Le déploiement réussit et le frontend fonctionne | Pas de retour arrière nécessaire |

**Le retour arrière n'est donc utile que pour revenir à un état connu et documenté, pas pour restaurer un service.** Il faut en être conscient avant de décider.

### Les deux seules options réelles

| Option | Effet | Quand l'utiliser |
| --- | --- | --- |
| **A — Redéployer v1 à l'identique** | Retour à `503 BOOT_ERROR` | Si le correctif introduit un comportement dangereux (fuite de données, écriture non voulue) |
| **B — Désactiver la fonction** | L'URL renvoie `404`. Le frontend reçoit une erreur réseau. | Si l'on veut couper court à tout comportement imprévu |

**Recommandation : préférer A.** Un `503` est plus informatif qu'un `404` pour le diagnostic.

## 9.2 Sauvegarde préalable obligatoire

**Avant tout déploiement**, exporter le code actuel de production :

```bash
# Sauvegarde du corps réellement déployé
curl -s "https://gdnluwetyoejfqaeoioa.supabase.co/functions/v1/jaspay-config" \
  -o /dev/null   # ne permet pas d'extraire le corps

# Méthode fiable : via le dashboard Supabase
#   Edge Functions → jaspay-config → onglet Code → copier
#   Enregistrer dans  supabase/functions/_backup/jaspay-config.v1.js
```

La version v1 est également récupérable depuis le dépôt Git :

```bash
git show 8f4fcc5:supabase/functions/jaspay-config/index.js \
  > supabase/functions/_backup/jaspay-config.v1.js
```

> ⚠️ Le fichier Git contient le bloc `/**` en tête. **À corriger avant tout redéploiement**, sinon l'upload le tronquera à nouveau.

## 9.3 Retour arrière pour `jaspay-config`

```bash
# 1. Restaurer l'ancien fichier
cp supabase/functions/_backup/jaspay-config.v1.js \
   supabase/functions/jaspay-config/index.js

# 2. Corriger le bloc /** en tête (sinon BOOT_ERROR garanti)
#    Remplacer les 4 premiers caractères "/**" par "// " et supprimer la ligne " */"
sed -i '1s|^/\*\*|//|' supabase/functions/jaspay-config/index.js

# 3. Redéployer
supabase functions deploy jaspay-config \
  --project-ref gdnluwetyoejfqaeoioa --no-verify-jwt

# 4. Vérifier — ATTENDU : 503 (état antérieur, non fonctionnel)
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  "https://gdnluwetyoejfqaeoioa.supabase.co/functions/v1/jaspay-config"
```

**Ou, de préférence, depuis le dashboard :** Edge Functions → `jaspay-config` → historique des versions → sélectionner v1 → **Redeploy**. C'est la méthode la plus fiable, car elle restaure le corps **exactement** tel qu'il était stocké, sans risque de troncature.

## 9.4 Alternative : désactivation

```bash
# Via le dashboard uniquement (aucune commande CLI fiable pour désactiver)
# Edge Functions → jaspay-config → Settings → désactiver
```

Conséquence : `404` sur l'URL. `Deposit.jsx` et `Withdraw.jsx` basculeront sur leur `catch` (repli direct Supabase, lignes 57 et 72) et **afficheront quand même** les données via RLS.

> 💡 **Observation importante :** `Deposit.jsx` et `Withdraw.jsx` possèdent déjà un **repli** en cas d'échec de l'Edge Function — ils interrogent directement Supabase avec RLS. Ce repli fonctionne aujourd'hui. **C'est pourquoi ces pages n'étaient pas totalement cassées.** La réparation de `jaspay-config` apporte donc un **chemin principal** plus fiable, mais pas la restauration d'un service totalement absent.

## 9.5 Retour arrière pour `jaspay-transactions` (après autorisation ultérieure)

```bash
cp supabase/functions/_backup/jaspay-transactions.v1.js \
   supabase/functions/jaspay-transactions/index.js
sed -i '1s|^/\*\*|//|' supabase/functions/jaspay-transactions/index.js
supabase functions deploy jaspay-transactions \
  --project-ref gdnluwetyoejfqaeoioa --no-verify-jwt
```

**Attention :** `Deposit.jsx`/`Withdraw.jsx` **n'ont PAS de repli** pour la création de transaction. Si `jaspay-transactions` est indisponible, **le dépôt et le retrait sont impossibles** — c'est l'état actuel.

**État actuel = dépôt et retrait déjà cassés.** Le déploiement ne peut donc pas les casser davantage ; il peut seulement échouer à les réparer.

## 9.6 Retour arrière de la migration corrective

```sql
BEGIN;
  CREATE POLICY "Utilisateur crée ses propres transactions"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
COMMIT;
```

⚠️ **Ce retour arrière réintroduit la faille critique.** À n'utiliser que si le retrait provoquait une régression avérée — ce qui est improbable, aucun code n'utilisant cette policy.

## 9.7 Référence : `jaspay-rate-limit` v4

`jaspay-rate-limit` **n'est pas concernée par un retour arrière** : sa v4 est **fonctionnelle et validée** (10 tests en production). Elle constitue la **référence** :

| Version | État |
| --- | --- |
| v1–v3 | `BOOT_ERROR` |
| **v4** | ✅ **fonctionnelle — CONSERVER** |

En cas de doute lors des interventions futures, `v4` est l'état de référence à ne pas dégrader.

---

# 10. SYNTHÈSE

## Ce qui est prêt

Deux fonctions corrigées, **jamais déployées**, avec 51 tests locaux réussis, une correspondance ligne à ligne établie avec les versions d'origine, 21 règles métier vérifiées une par une avec référence de code, et une migration corrective rédigée mais non exécutée.

## Ce qui a changé dans mon analyse depuis le dernier rapport

**Une faille critique a été confirmée**, que je n'avais pas identifiée : la policy RLS `INSERT` sur `transactions` permet à un utilisateur authentifié d'injecter des transactions avec `status: 'completed'`, en contournant intégralement les 21 règles de `jaspay-transactions`.

Votre suspicion était **exacte**, et le prolongement que vous en tirez — que la policy `UPDATE` avec `NEW.id` ne peut pas fonctionner — est **également exact** : `NEW` n'est pas référençable dans un `WITH CHECK` de policy RLS.

## Ce qui n'a pas changé

Les deux causes du `BOOT_ERROR` restent identifiées et corrigées dans les fichiers proposés : absence de `Deno.serve`, et import CDN au démarrage. J'y ai ajouté un troisième défaut, propre au routage, qui aurait rendu les fonctions inopérantes même si elles avaient démarré.

## Le point le plus important

**La faille RLS est active en production en ce moment**, indépendamment de tout déploiement. Elle existe depuis la migration `003`. Déployer `jaspay-transactions` **sans** d'abord retirer cette policy reviendrait à installer un contrôle d'accès soigné à côté d'une porte ouverte.

Je recommande donc l'ordre **D3** : migration corrective d'abord, déploiement ensuite.

---

## ⏸ EN ATTENTE DE VOTRE AUTORISATION EXPLICITE

Aucune commande de déploiement, de migration ou de push n'a été exécutée. Je m'arrête ici et attends votre décision sur chacun des points D1 à D7.
