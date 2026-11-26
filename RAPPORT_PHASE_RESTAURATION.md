# RAPPORT — PHASE DE RESTAURATION DES SERVICES MÉTIER

**Projet :** JASpay — `gdnluwetyoejfqaeoioa`
**Date :** 21 novembre 2026
**Périmètre :** ÉTAPE 1 (synchro rate-limit) + préparation ÉTAPES 2 et 3
**Statut :** ⏸ **ARRÊT DEMANDÉ — aucun déploiement, aucun push, aucune migration**

---

## 0. Déclaration d'état

| Action | Exécutée ? |
| --- | --- |
| Déploiement Edge Function | ❌ Aucun |
| Commit / push Git | ❌ Aucun |
| Migration SQL | ❌ Aucune |
| Modification RLS | ❌ Aucune |
| Modification de secret | ❌ Aucune |
| Modification SMTP | ❌ Aucune |
| Modification de design | ❌ Aucune |
| Écriture de données métier | ❌ Aucune |

Les corrections sont écrites dans un **dossier de staging** `supabase/functions/_proposed/` qui n'est déployé par rien : aucun outil ne pousse automatiquement ce répertoire.

---

# ÉTAPE 1 — SYNCHRONISATION DU CORRECTIF RATE LIMIT

## 1.1 Comparaison des trois états

| Fichier | GitHub (`8f4fcc5`) | Local | Déployé Supabase v4 |
| --- | --- | --- | --- |
| `supabase/functions/jaspay-rate-limit/index.js` | sha `cdeb4fa4eab3` | sha `f81ad78fa1b4` | sha `f81ad78fa1b4` ✅ identique |
| `client/src/lib/rateLimit.js` | sha `5a56c98db0e9` | sha `c4b281f8eb58` | n/a (frontend) |
| `client/src/pages/Login.jsx` | sha `bec95bd57549` | sha `b3f601ae9bc8` | n/a (frontend) |

### Détail `jaspay-rate-limit/index.js`

| Marqueur | GitHub | Local | Déployé v4 |
| --- | --- | --- | --- |
| Import CDN `esm.sh` | ✅ présent | ❌ absent | ❌ absent |
| `Deno.serve(handler)` | ❌ absent | ✅ présent | ✅ présent |
| Bloc `/**` en 1ʳᵉ ligne | ✅ présent | ❌ absent | ❌ absent |
| Nombre de lignes | 58 | 193 | 193 |
| Actions `check`/`record`/`reset` | ❌ | ✅ | ✅ |

**Conclusion :** le fichier local est **rigoureusement identique** à la version déployée v4 (mêmes chaînes distinctives, même sha). Le dépôt GitHub est en retard : il contient encore l'ancienne version avec import CDN, sans `Deno.serve`, c'est-à-dire **une version qui ne démarrerait pas**.

### Ce que contient le commit `8f4fcc5` (sur GitHub)

Il s'agit d'un **état intermédiaire obsolète** : la première tentative de correction CORS, qui ajoutait les en-têtes sur toutes les réponses mais conservait l'import CDN, n'appelait pas `Deno.serve`, et n'avait aucune des corrections de logique. Il n'a jamais fonctionné (503 `BOOT_ERROR`).

**Recommandation :** committer le fichier local pour aligner GitHub sur la version qui fonctionne réellement.

## 1.2 Vérification des quatre critères demandés

### a) Le compteur augmente-t-il après un échec réel de connexion ?

**✅ Oui, mais uniquement grâce au fichier local** — le code sur GitHub ne le fait pas.

**Version GitHub (`rateLimit.js`)** — le défaut :

```js
const data = await res.json();
if (res.status === 429) { ... }
if (!res.ok) {
  return { allowed: true, remaining: 3, error: null };  // ← échec avalé
}
```

`recordFailedAttempt` appelait bien l'endpoint, **mais** la version de `Login.jsx` sur GitHub n'appelait `recordFailedAttempt` que dans la branche `if (err)` — et cette branche était atteinte. Le vrai défaut était **côté Edge Function** : `countAttempts` utilisait `head: true` puis `data.length`, or `data` vaut `null` dans ce mode. **Le compteur renvoyait donc toujours 0.** Le blocage ne pouvait jamais survenir.

**Version locale + déployée v4** — corrigé :

```js
const { count, error } = await supabase
  .from('rate_limit_attempts')
  .select('id', { count: 'exact', head: true })   // count exploité
  ...
const attemptCount = count ?? 0;
```

**Mesuré en production le 21/11 :**

```
record #1 : {"remaining":2}  [200]
record #2 : {"remaining":1}  [200]
record #3 : {"allowed":false,"remaining":0,"error":"Trop de tentatives erronées, ressayez dans 5min"} [429]
```

Le compteur monte réellement. ✅

### b) Le compteur est-il réinitialisé après une connexion réussie ?

**✅ Oui dans le fichier local, ❌ non dans GitHub.**

Version locale de `Login.jsx` :

```js
} else {
  // Connexion réussie : on remet le compteur à zéro
  await resetRateLimit(email, 'login');
}
```

L'action `reset` a été testée en production :

```
après 3 records  : {"allowed":false,...}   [429]
après reset      : {"ok":true,"remaining":3} [200]
check après reset: {"ok":true,"remaining":3} [200]
```

**⚠️ Sans le push du fichier local, ce comportement n'existe pas en production.** Un utilisateur qui échoue 2 fois puis réussit conserverait 2 tentatives « consommées » pendant 5 minutes.

### c) Le blocage intervient-il conformément au seuil ?

**✅ Oui.** Seuil = 3 tentatives / 5 minutes.

Semantique exacte : le 3ᵉ échec est **enregistré** puis la réponse est `429`. Autrement dit, l'utilisateur dispose de **3 essais réels** ; le blocage s'applique à la 4ᵉ tentative. Vérifié en production (tests 7 et 8 du rapport d'audit).

### d) Les erreurs réseau autorisent-elles silencieusement un nombre illimité de tentatives ?

**⚠️ Point de vigilance — réponse nuancée.**

La version locale adopte une **dégradation explicite et tracée** :

```js
} catch (err) {
  console.error('[RateLimit] Erreur :', err.message);
  return { allowed: true, remaining: null, error: null, degraded: true };
}
```

**Justification de ce choix :** si l'Edge Function est indisponible, un `allowed: false` bloquerait **tous les utilisateurs légitimes** — panne totale de connexion. Le paramètre `degraded: true` est renvoyé pour que l'appelant puisse réagir ; `remaining: null` indique explicitement que le décompte est inconnu (et non « 3 restantes », ce que faisait à tort l'ancienne version).

**Mais il faut être exact sur la conséquence :** en cas de panne de l'Edge Function, **le seul garde-fou restant est la limitation native de Supabase Auth**, qui n'est pas configurée sur ce critère (aucune limite par e-mail sur les tentatives de connexion échouées côté GoTrue dans la configuration actuelle).

**Ce n'est donc pas « illimité silencieusement », mais ce n'est pas non plus une protection forte.** Trois options, à votre arbitrage :

| Option | Comportement | Avantage | Inconvénient |
| --- | --- | --- | --- |
| **A** (actuel) | `allowed: true, degraded: true` | Aucune panne utilisateur | Protection réduite en cas de panne |
| **B** | `allowed: false` + message « service indisponible » | Sécurité maximale | Bloque tout le monde si l'Edge Function tombe |
| **C** | Compteur local `localStorage` en secours | Compromis | Contournable par un utilisateur averti |

**Recommandation : conserver A**, car une indisponibilité de l'Edge Function est bien plus probable qu'une attaque ciblée, et bloquer toute la connexion serait une régression pire que le risque. Mais je le signale explicitement plutôt que de le présenter comme pleinement sûr.

---

# ÉTAPE 2 — DIAGNOSTIC DE `jaspay-config`

## 2.1 Trois causes de panne, cumulées

### Cause 1 — `Deno.serve` absent → `BOOT_ERROR`

```js
export default async function handler(req) { ... }
// ← aucune instruction Deno.serve : le runtime ne démarre jamais de serveur
```

Constaté : `OPTIONS /functions/v1/jaspay-config` → **HTTP 503 `BOOT_ERROR`**.

### Cause 2 — Import CDN au démarrage

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
```

Résolu au chargement du module, avant toute requête. Prouvé par comparaison : fonction sans import → `200 ok` ; fonction avec import → `503`.

### Cause 3 — Routage cassé (défaut logique indépendant)

```js
const url = new URL(req.url);
const path = url.pathname.replace(/\/$/, '');

if (path === '/api/bookmakers') { ... }
```

`req.url` vaut réellement :

```
/functions/v1/jaspay-config/api/bookmakers
```

La comparaison avec `'/api/bookmakers'` est donc **toujours fausse**. Même si la fonction avait démarré, **toutes les routes (sauf `/api/health`) auraient renvoyé 404 « Route non trouvée »**.

Simulation vérifiée :

```
url.pathname                              = /functions/v1/jaspay-config/api/bookmakers
comparaison avec /api/bookmakers          = False
```

> **Ce défaut affecte aussi `jaspay-transactions`** (même construction).

## 2.2 Logique métier à préserver — inventaire

| Élément | Valeur constatée | Conservé ? |
| --- | --- | --- |
| Route `/api/health` | publique, sans auth | ✅ |
| Route `/api/bookmakers` | auth requise | ✅ |
| Route `/api/payment-providers` | auth requise | ✅ |
| Route `/api/payment-methods?bookmakerId=` | auth requise | ✅ |
| Méthodes HTTP | GET uniquement, `405` sinon | ✅ |
| Clé Supabase utilisée | **ANON** (RLS appliquée) | ✅ **anon conservée** |
| Vérification JWT | `auth.getUser(token)` | ✅ via `/auth/v1/user` |
| Filtre bookmakers | `is_active = true` | ✅ |
| Tri bookmakers | `display_order ASC` | ✅ |
| Filtre providers | `is_active = true` | ✅ |
| Filtre méthodes | `is_active = true` | ✅ |
| Clés de réponse | `bookmakers`, `providers`, `methods` | ✅ |
| Embed | `provider:payment_providers(...)` | ✅ |
| CORS | `*` | ⚠️ **restreint** (voir §2.4) |

### Champs retournés — vérification contre le schéma réel

| Table | Champs demandés par la fonction | Présents en base ? |
| --- | --- | --- |
| `bookmakers` | `id, name, technical_id, logo_url, is_active, display_order` | ✅ tous |
| `payment_providers` | `id, name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions` | ✅ tous |
| `payment_methods` | `id, is_active, min_amount, max_amount, fee_percent, fee_fixed` | ✅ tous |
| `payment_providers` (embed) | `id, name, technical_id, supports_deposit, supports_withdrawal, ussd_instructions` | ✅ tous |

Aucun champ fantôme, aucune colonne manquante.

### Clés étrangères — vérification pour les embeds PostgREST

| Source | Colonne | Cible | Embed valide ? |
| --- | --- | --- | --- |
| `payment_methods` | `bookmaker_id` | `bookmakers.id` | ✅ |
| `payment_methods` | `provider_id` | `payment_providers.id` | ✅ |
| `transactions` | `bookmaker_id` | `bookmakers.id` | ✅ |
| `transactions` | `payment_provider_id` | `payment_providers.id` | ✅ |
| `transaction_events` | `transaction_id` | `transactions.id` | ✅ |

Les embeds `bookmaker:bookmakers(...)` et `provider:payment_providers(...)` sont résolubles par PostgREST.

## 2.3 Contrat attendu par le frontend

`invokeEdge` (`client/src/lib/edgeFunctions.js`) lit `data.<clé>` et considère un `res.ok` faux comme une erreur. Consommateurs :

| Page | Appel | Clé lue |
| --- | --- | --- |
| `Deposit.jsx:53` | `GET /api/bookmakers` | `data.bookmakers` |
| `Deposit.jsx:68` | `GET /api/payment-providers` | `data.providers` |
| `Deposit.jsx:83` | `GET /api/payment-methods?bookmakerId=` | `data.methods` |
| `Withdraw.jsx:53/68/83` | idem | idem |

Les trois clés sont **strictement conservées**. Aucun changement de contrat.

## 2.4 Deux décisions qui s'écartent de l'original — à valider

### Décision 1 — CORS restreint (au lieu de `*`)

| | Original | Proposé |
| --- | --- | --- |
| `Access-Control-Allow-Origin` | `*` | origine reflétée si autorisée |

Origines autorisées : `https://jaspay.vercel.app`, `http://localhost:5173`, `http://127.0.0.1:5173`.

**Justification :** cohérence avec `jaspay-rate-limit` déjà déployée, et votre instruction de ne pas utiliser `*` aveuglément.
**Pas d'impact fonctionnel** pour le frontend JASpay : son origine est autorisée.
**Impact potentiel :** aucun consommateur connu en dehors de ces origines.

### Décision 2 — `.single()` remplacé par une lecture tolérante

L'original faisait :

```js
const { data: existing } = await supabaseAdmin.from(...).select('id').eq(...).single();
if (existing) { /* 409 */ }
```

`.single()` renvoie une **erreur 406** quand 0 ligne, et l'original **ignorait cette erreur** : `existing` était `null`, le test passait, le flux continuait — comportement correct par accident.

La version proposée utilise `&limit=1` puis teste `rows.length`. **Même comportement, sans dépendre d'un échec silencieux.**

## 2.5 Sécurité des secrets

| Secret | Utilisé par `jaspay-config` ? |
| --- | --- |
| `SUPABASE_ANON_KEY` | ✅ oui (clé publique, RLS appliquée) |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ **jamais** |

`jaspay-config` est en lecture seule ; il n'a **aucun besoin** de `service_role`. La version proposée conserve la clé **anon**, donc **RLS reste l'unique garde-fou**, exactement comme dans l'original.

Filtres RLS confirmés en base :

```
bookmakers        : SELECT authenticated  qual = (is_active = true)
payment_providers : SELECT authenticated  qual = (is_active = true)
payment_methods   : SELECT authenticated  qual = (is_active = true)
```

Le filtre `is_active=true` est présent **à deux niveaux** (fonction + RLS) — défense en profondeur conservée.

---

# ÉTAPE 3 — DIAGNOSTIC DE `jaspay-transactions`

## 3.1 Mêmes trois causes structurelles

`Deno.serve` absent, import CDN, et routage cassé (`/functions/v1/jaspay-transactions/api/transactions` ≠ `/api/transactions`). Les 357 lignes de logique métier n'ont **jamais pu s'exécuter**.

## 3.2 Règles métier à préserver — inventaire exhaustif

| # | Règle | Emplacement original | Conservée ? |
| --- | --- | --- | --- |
| 1 | JWT obligatoire, `401` sinon | l.29-36 | ✅ |
| 2 | Token vérifié serveur, `401` si invalide | l.45-52 | ✅ |
| 3 | `user_id` injecté depuis le JWT, **jamais** du body | l.54 | ✅ |
| 4 | `service_role` confiné au serveur | l.57-61 | ✅ |
| 5 | Référence générée serveur : `DEP`/`WDR` + `YYMMDD` + 8 hex | l.157-160 | ✅ identique |
| 6 | Unicité de référence avant création (`409`) | l.163-176 | ✅ |
| 7 | Validation décimale stricte, sans `parseFloat` | l.64-73 | ✅ copiée à l'identique |
| 8 | Montant formaté `toFixed(2)` | l.75-78 | ✅ |
| 9 | Tous les champs requis sinon `400` | l.192-197 | ✅ |
| 10 | Type ∈ {`deposit`,`withdrawal`} | l.200-205 | ✅ |
| 11 | Bookmaker existant **et actif** | l.213-227 | ✅ |
| 12 | Provider existant **et actif** | l.230-244 | ✅ |
| 13 | Méthode de paiement active pour le couple | l.247-260 | ✅ |
| 14 | Montant dans `[min_amount, max_amount]` | l.263-273 | ✅ |
| 15 | Statut initial **forcé** à `pending` | l.303 | ✅ |
| 16 | Événement de création journalisé | l.316-327 | ✅ |
| 17 | Réponse `201` + objet transaction (12 champs) | l.330-346 | ✅ identique |
| 18 | Lecture filtrée `user_id` (liste et détail) | l.98, 124 | ✅ |
| 19 | `404` si transaction d'autrui ou inexistante | l.128-133 | ✅ |
| 20 | Routes inconnues → `404` | l.348-351 | ✅ |
| 21 | Erreurs → `500` message générique | l.353-356 | ✅ |

**Aucune fonctionnalité supprimée. Aucune règle affaiblie.**

## 3.3 Point de sécurité central — `service_role` contourne RLS

`jaspay-transactions` utilise **nécessairement** `service_role` (insertion + journalisation). Or `service_role` **ignore RLS**. Le filtrage par `user_id` repose donc **entièrement sur le code de la fonction**.

Vérifié dans la version proposée :

```
ligne 193 : '&user_id=eq.' +  (GET liste)
ligne 228 : '&user_id=eq.' +  (GET détail)
ligne 398 : user_id: userId   (INSERT)
```

**Sans ces trois lignes, un utilisateur authentifié pourrait lire les transactions de tous les autres.** Elles sont présentes.

### État RLS en base (inchangé, pour information)

```
transactions SELECT  : auth.uid() = user_id
transactions INSERT  : auth.uid() = user_id
transactions UPDATE  : false   ← aucun client ne peut modifier le statut
transactions DELETE  : false
transaction_events ALL : false ← aucune écriture directe client
```

**Les utilisateurs ne peuvent pas modifier le statut de leurs transactions.** Confirmé au niveau base, pas seulement au niveau code. Et aucun policy UPDATE permissive n'existe pour un rôle utilisateur.

## 3.4 Défauts de l'original découverts pendant l'analyse

| # | Défaut | Gravité | Traitement |
| --- | --- | --- | --- |
| 1 | `.single()` + erreur 406 ignorée sur vérif. d'unicité | Faible (comportement correct par accident) | Remplacé par `limit=1` explicite |
| 2 | `req.json()` non protégé → exception → `500` au lieu de `400` | Moyen | `try/catch` → `400 Corps JSON invalide` |
| 3 | Échec de journalisation `transaction_events` **non traité** (pas de `if (error)`) | Moyen | Détecté et loggué, transaction **non supprimée** |
| 4 | Comparaison `amountNum < minAmount` entre `string` et `number` (coercition implicite) | Faible | `Number(amountNum)` explicite |
| 5 | Routage `path ===` cassé | **Bloquant** | Suffixe `/api/` extrait |

Aucun de ces correctifs ne change une règle métier : ils corrigent des cas limites d'erreur.

## 3.5 Un point métier non traité — à signaler

La règle 12 vérifie `provider.is_active` mais **ne vérifie pas** `supports_deposit` / `supports_withdrawal` selon le type de transaction, alors que ces colonnes existent et sont déjà sélectionnées dans la requête.

**Je n'ai pas ajouté ce contrôle**, car ce serait **introduire une règle métier nouvelle**, ce que vous avez explicitement interdit. Je le signale pour arbitrage :

> Un retrait pourrait actuellement être créé avec un opérateur `supports_withdrawal = false`, si une `payment_method` active existe pour ce couple.

À traiter dans une intervention distincte, avec votre accord.

---

# ÉTAPE 4 — TESTS

## 4.1 Tests RÉELLEMENT exécutés

### A. Tests en production — `jaspay-rate-limit` (déployée)

| # | Test | Résultat |
| --- | --- | --- |
| 1 | `OPTIONS` origine prod | `204` + `allow-origin: https://jaspay.vercel.app` |
| 2 | `OPTIONS` origine `evil.com` | `204` **sans** `allow-origin` |
| 3 | `OPTIONS` origine prod (re-test après v4) | `204`, en-têtes complets |
| 4 | `POST check` (0 tentative) | `200 {"allowed":true,"remaining":3}` |
| 5 | `record` ×1 | `200 {"remaining":2}` |
| 6 | `record` ×2 | `200 {"remaining":1}` |
| 7 | `record` ×3 | `429 Trop de tentatives…` |
| 8 | `record` ×4 | `429` (verrou maintenu) |
| 9 | Email invalide | `400 Adresse e-mail valide requise` |
| 10 | `reset` après 3 échecs | `200`, puis `check` → `3` |

### B. Tests en production — les 6 autres fonctions

| Fonction | `OPTIONS` |
| --- | --- |
| `jaspay-config` | `503 BOOT_ERROR` |
| `jaspay-transactions` | `503 BOOT_ERROR` |
| `jaspay-agent` | `503 BOOT_ERROR` |
| `jaspay-admin-config` | `503 BOOT_ERROR` |
| `jaspay-admin-users` | `503 BOOT_ERROR` |
| `jaspay-admin-surveillance` | `503 BOOT_ERROR` |

### C. Banc d'essai local — versions proposées (**simulation**)

`_proposed/test-harness.mjs` : exécute les deux fonctions sous Node avec un PostgREST simulé en mémoire. **Ce n'est pas un test de production** — c'est une validation de logique et de contrat avant déploiement.

**Résultat : `51 réussis / 0 échoués`**

#### `jaspay-config` — 20 tests

| Catégorie | Tests | Résultat |
| --- | --- | --- |
| Démarrage | handler capturé via `Deno.serve` | ✅ |
| CORS | `OPTIONS` → 204 ; origine autorisée reflitée ; origine non autorisée → pas d'en-tête | ✅✅✅ |
| Auth | sans token → 401 ; token invalide → 401 | ✅✅ |
| Bookmakers | 200 ; clé `bookmakers` ; 1 seul actif (filtre) ; champs conformes | ✅✅✅✅ |
| Providers | 200 ; clé `providers` ; 1 seul actif ; `ussd_instructions` présent | ✅✅✅✅ |
| Methods | 200 ; clé `methods` ; embed `provider` résolu | ✅✅✅ |
| Divers | `/api/health` → 200 ; route inconnue → 404 ; `POST` → 405 | ✅✅✅ |

#### `jaspay-transactions` — 31 tests

| Catégorie | Tests | Résultat |
| --- | --- | --- |
| Démarrage / CORS | `Deno.serve` ; `OPTIONS` → 204 | ✅✅ |
| Auth | sans token → 401 ; token invalide → 401 | ✅✅ |
| Lecture | liste → 200 + clé `transactions` | ✅✅ |
| Références | préfixe `DEP-` ; préfixe `WDR-` ; type invalide → 400 | ✅✅✅ |
| Montants refusés | `0` ; négatif ; 3 décimales ; non numérique ; sous min ; au-dessus max | ✅×6 |
| Validations | type invalide → 400 ; bookmaker inactif → 400 ; provider inactif → 400 ; champ manquant → 400 | ✅×4 |
| Création | 201 ; objet `transaction` ; **statut `pending`** ; **`user_id` du JWT** ; montant `"5000.00"` ; **événement journalisé** | ✅×6 |
| Conflits | référence déjà utilisée → 409 | ✅ |
| Détail | existant → 200 ; inexistant → 404 | ✅✅ |
| Méthodes | `PUT` → 404 | ✅ |

### D. Contrôle statique des fichiers proposés

```
jaspay-config/index.js        : node --check OK · 0 import · Deno.serve ✅ · 203 lignes
jaspay-transactions/index.js  : node --check OK · 0 import · Deno.serve ✅ · 477 lignes
```

## 4.2 Tests PRÉVUS mais NON exécutés

| Test | Raison de non-exécution |
| --- | --- |
| Démarrage réel des Edge Functions proposées | **Pas de déploiement autorisé** |
| `OPTIONS` depuis Vercel sur les fonctions proposées | idem |
| Requêtes métier avec un **vrai JWT** Supabase | idem |
| Écriture réelle dans `transactions` | idem + interdiction d'écrire des données |
| Lecture réelle de `bookmakers` via PostgREST | idem |
| Comportement des pages `Deposit`/`Withdraw` | dépend du déploiement |
| Vérification que le corps déployé n'est pas altéré (`/**` tronqué) | nécessite un déploiement |

**Ces tests constituent la vérification finale, à exécuter immédiatement après votre autorisation de déployer.**

## 4.3 Proposition de protocole de validation post-déploiement

Pour chaque fonction, dans cet ordre, avec arrêt si échec :

1. `OPTIONS` → attendu `204`
2. `GET /api/health` (config) → attendu `200`
3. `GET` route métier sans token → attendu `401`
4. `GET` route métier avec vrai JWT de compte de test → attendu `200` + clés attendues
5. `POST` invalide → attendu `400`
6. `POST` valide (transactions) → attendu `201`, puis **suppression** de la transaction de test
7. Vérifier sur la page `Deposit` que les listes s'affichent

---

# 5. RISQUES

## Risques liés au déploiement de `jaspay-config`

| # | Risque | Probabilité | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | CORS restreint casse un consommateur non connu | Faible | Moyen | Ajouter l'origine à `ALLOWED_ORIGINS` ; retour arrière en 1 min |
| 2 | Altération du corps à l'upload (`/**` tronqué) | **Moyenne — déjà observé** | Bloquant | Fichiers écrits sans bloc `/**` en tête ; vérification post-déploiement par `OPTIONS` |
| 3 | Embed `provider:` non résolu par PostgREST | Faible | Moyen | FK vérifiée ; sinon repli en 2 requêtes |
| 4 | Différence de comportement `/auth/v1/user` vs `auth.getUser` | Faible | Faible | Testé localement ; à re-tester avec vrai JWT |

## Risques liés au déploiement de `jaspay-transactions`

| # | Risque | Probabilité | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 5 | **Perte du filtre `user_id`** → fuite de données entre utilisateurs | Très faible (code vérifié l.193/228/398) | **Critique** | Revue de code explicite ; test avec 2 comptes distincts |
| 6 | `service_role` échoue silencieusement | Faible | Élevé | Erreurs remontées en `500` explicite |
| 7 | Transaction créée mais événement non journalisé | Faible | Faible | Détecté et loggué ; transaction conservée |
| 8 | Écriture réelle de données lors des tests | Moyenne | Faible | Utiliser un compte de test ; supprimer après |
| 9 | Régression sur `amount` (string vs number) | Faible | Moyen | `Number()` explicite ; testé |

## Risques transverses

| # | Risque | Détail |
| --- | --- | --- |
| 10 | **GitHub désynchronisé** | Le dépôt contient encore la version CDN non fonctionnelle. Un `git pull` sur une autre machine réintroduirait le bug. |
| 11 | **Pas de `config.toml`** | Aucun verrou sur `verify_jwt` ; dépend de la valeur par défaut à chaque déploiement. |
| 12 | **Aucun test automatisé en CI** | Les 6 fonctions sont tombées sans alerte. |
| 13 | **`_proposed/` dans le dépôt** | Peut prêter à confusion si quelqu'un déploie le dossier entier. Recommandation : déplacer hors du dépôt ou ajouter au `.gitignore` après validation. |

---

# 6. DIFFÉRENCES CODE SOURCE ↔ PRODUCTION

## 6.1 Edge Functions

| Fonction | GitHub | Production | Écart |
| --- | --- | --- | --- |
| `jaspay-rate-limit` | Version CDN obsolète (58 l.) | **v4 fonctionnelle** (193 l.) | 🔴 **GitHub en retard** |
| `jaspay-config` | Version CDN | v1 — `503 BOOT_ERROR` | 🟠 Les deux sont non fonctionnelles ; correctif en staging |
| `jaspay-transactions` | Version CDN | v1 — `503 BOOT_ERROR` | 🟠 idem |
| `jaspay-agent` | Version CDN | v1 — `503 BOOT_ERROR` | 🟠 idem |
| `jaspay-admin-config` | Version CDN | v1 — `503 BOOT_ERROR` | 🟠 idem |
| `jaspay-admin-users` | Version CDN | v1 — `503 BOOT_ERROR` | 🟠 idem |
| `jaspay-admin-surveillance` | Version CDN | v1 — `503 BOOT_ERROR` | 🟠 idem |

## 6.2 Frontend

| Fichier | Production (Vercel) | Local | Écart |
| --- | --- | --- | --- |
| `rateLimit.js` | Ancienne version (échecs avalés, `degraded` absent) | Version corrigée | 🔴 **non déployé** |
| `Login.jsx` | `resetRateLimit` absent, message sans décompte | Version corrigée | 🔴 **non déployé** |
| `App.jsx` / `useAuth.js` | Corrigés (`3dda480` poussé) | Identique | ✅ aligné |

## 6.3 Base de données

| Objet | État | Écart |
| --- | --- | --- |
| `rate_limit_attempts` | Créée, RLS activé, 0 policy | ✅ conforme |
| RLS `transactions` | UPDATE `false`, DELETE `false` | ✅ conforme |
| RLS `transaction_events` | ALL `false` | ✅ conforme |
| RLS `bookmakers`/`providers`/`methods` | SELECT `is_active=true` | ✅ conforme |

---

# 7. LIVRABLES PRODUITS

| Fichier | Nature | Déployé ? |
| --- | --- | --- |
| `supabase/functions/_proposed/jaspay-config/index.js` | Version proposée (203 l.) | ❌ |
| `supabase/functions/_proposed/jaspay-transactions/index.js` | Version proposée (477 l.) | ❌ |
| `supabase/functions/_proposed/test-harness.mjs` | Banc d'essai local, 51 tests | n/a |
| `RAPPORT_PHASE_RESTAURATION.md` | Le présent rapport | n/a |

---

# 8. DÉCISIONS QUI ATTENDENT VOTRE ARBITRAGE

| # | Question | Ma recommandation |
| --- | --- | --- |
| 1 | Déployer `jaspay-config` en premier ? | **Oui** — lecture seule, risque minimal, débloque `Deposit`/`Withdraw` partiellement |
| 2 | CORS restreint vs `*` ? | **Restreint** (cohérence + votre consigne) |
| 3 | Stratégie de dégradation rate-limit : A, B ou C ? | **A** (disponibilité prioritaire) |
| 4 | Ajouter le contrôle `supports_deposit`/`supports_withdrawal` ? | **Non pour l'instant** — hors périmètre, intervention séparée |
| 5 | Committer le `jaspay-rate-limit` local pour aligner GitHub ? | **Oui**, dès votre accord |
| 6 | Ajouter `config.toml` verrouillant `verify_jwt` ? | **Oui**, prévention |

---

# 9. PROCHAINES ÉTAPES PROPOSÉES

Dans l'ordre, avec arrêt et rapport après chaque étape :

1. **Votre validation** des corrections `jaspay-config` et `jaspay-transactions`
2. Déploiement de `jaspay-config` **seule** → batterie de 7 tests → rapport
3. Si succès : déploiement de `jaspay-transactions` **seule** → batterie de tests avec 2 comptes → rapport
4. Commit + push de l'ensemble (GitHub réaligné)
5. Puis `jaspay-agent` et les 3 fonctions admin, sur le même modèle

---

## Conclusion

Les deux fonctions sont **prêtes à être déployées mais ne le sont pas**. La logique métier de `jaspay-transactions` — 21 règles recensées — est intégralement préservée, y compris les trois protections critiques que sont l'injection de `user_id` depuis le JWT, le forçage du statut à `pending`, et le filtrage par `user_id` en lecture malgré l'usage de `service_role`.

Les 51 tests du banc d'essai valident le contrat, les validations et les codes HTTP. **Ils ne remplacent pas un test en production** : le démarrage réel des fonctions, l'absence d'altération du corps à l'upload et la résolution effective des embeds PostgREST demeurent non vérifiés, et ne peuvent l'être qu'après votre autorisation.

Trois points méritent une décision explicite de votre part : la stratégie de dégradation du rate limiting (§1.2 d), la restriction CORS (§2.4), et le contrôle `supports_withdrawal` non implémenté (§3.5).
