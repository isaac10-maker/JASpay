# JASpay — GEL RESPECTÉ + DIAGNOSTIC INSCRIPTION (LECTURE SEULE)

**Date :** 21 novembre 2026
**Statut :** ⏸ Gel total respecté — aucune écriture, aucun déploiement, aucun push

---

## 0. DÉCLARATION DE NON-ACTION

| Action | Exécutée ? |
| --- | --- |
| Déploiement `jaspay-agent` | ❌ Aucun |
| Déploiement `jaspay-admin-config` | ❌ Aucun |
| Déploiement `jaspay-admin-users` | ❌ Aucun |
| Modification d'une fonction déjà déployée | ❌ Aucune |
| Push GitHub | ❌ Aucun |
| Migration | ❌ Aucune |
| Secret / SMTP / design | ❌ Aucune |

**Toutes les requêtes SQL de cette session sont des `SELECT`.**

Réserve explicite : je n'ai pas pu lire les logs (`get_logs` absent du connecteur). Voir §5, tests non exécutés.

---

# 1. BUG D'INSCRIPTION — CAUSE IDENTIFIÉE

## 1.1 La réponse est dans les données

```json
{"total_users": 2, "users_24h": 0, "total_profiles": 2, "profiles_24h": 0}
```

**Deux comptes existent. Aucun n'a été créé dans les 24 dernières heures.**

Chronologie des deux comptes :

```
id                                    created_at                    confirmé
11111111-1111-1111-1111-111111111111  2026-11-17 06:55:54.316333Z   true
22222222-2222-2222-2222-222222222222  2026-11-17 06:55:54.316333Z   true
```

UUID séquentiels, **timestamp identique à la microseconde** → ce sont des **seeds SQL directs**, pas des inscriptions.

`profiles` contient exactement les deux mêmes lignes, mêmes IDs, même timestamp.

> **Conclusion : aucune inscription réelle n'a jamais abouti depuis la création du projet. Le blocage n'est pas intermittent — il est permanent et antérieur à toutes mes interventions.**

## 1.2 Cause exacte : `supabase_auth_admin` n'a pas le droit d'exécuter `handle_new_user()`

### Le mécanisme

Un trigger est attaché à `auth.users` :

```
tgname     : on_auth_user_created
définition : CREATE TRIGGER on_auth_user_created
             AFTER INSERT ON auth.users
             FOR EACH ROW EXECUTE FUNCTION handle_new_user()
```

### Les privilèges réels

```json
{"rolname":"authenticated",       "peut_executer":true}
{"rolname":"anon",                "peut_executer":true}
{"rolname":"service_role",        "peut_executer":true}
{"rolname":"postgres",            "peut_executer":true}
{"rolname":"authenticator",       "peut_executer":false}
{"rolname":"supabase_auth_admin", "peut_executer":false}   ← 🔴
```

Grants effectifs sur la fonction :

```
service_role  : EXECUTE
authenticated : EXECUTE
anon          : EXECUTE
postgres      : EXECUTE
(supabase_auth_admin : ABSENT)
```

Et son rôle :

```json
{"rolname":"supabase_auth_admin","rolsuper":false,"rolbypassrls":false,"rolcanlogin":true}
```

Ni superutilisateur, ni `BYPASSRLS`. Il ne bénéficie d'aucune exemption.

### L'origine

`supabase/migrations/002_security_hardening.sql`, lignes 85-86 :

```sql
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
```

Le `REVOKE ... FROM PUBLIC` a été appliqué **à la fois au rôle `PUBLIC` et implicitement à `supabase_auth_admin`**, qui n'était pas membre de `PUBLIC` pour cette fonction et à qui aucun `GRANT` explicite n'a été redonné.

**Le `GRANT` a été donné à `authenticated` — le mauvais rôle.** Le rôle qui déclenche réellement le trigger est `supabase_auth_admin`, celui sous lequel GoTrue écrit dans `auth.users`.

### La chaîne d'échec

```
POST /auth/v1/signup
  └─ GoTrue (rôle supabase_auth_admin)
      └─ INSERT INTO auth.users
          └─ TRIGGER on_auth_user_created
              └─ EXECUTE public.handle_new_user()
                  └─ ERROR 42501: permission denied for function handle_new_user
                      └─ transaction annulée → auth.users inchangé
                          └─ GoTrue renvoie HTTP 500
                              └─ supabase-js : AuthRetryableFetchError, message '{}'
```

Cela explique **pourquoi aucun compte n'est créé** : l'erreur survient dans la transaction d'insertion, qui est annulée en totalité.

### Pourquoi le message est `'{}'`

`AuthRetryableFetchError` est levée par le client quand la réponse est un **5xx sans corps JSON exploitable**. Le client ne reçoit pas de champ `message`, d'où la chaîne vide.

Et `Register.jsx:42` fait :

```js
setError(err.message || 'Une erreur est survenue lors de l\'inscription.');
```

`err.message` vaut littéralement `'{}'`, qui est **truthy** → le fallback n'est jamais utilisé → l'utilisateur voit `{}`.

## 1.3 Le 406 signalé — piste secondaire, non bloquante

Recherche `.single()` dans `client/src` :

| Fichier | Ligne | Table | Peut renvoyer 0 ligne ? | S'exécute sur /register ? |
| --- | --- | --- | --- | --- |
| `useAuth.js` | 66 | `profiles` | **Oui** si le profil n'existe pas | Non — seulement dans `fetchProfile`, appelé depuis `onAuthStateChange` **si une session existe** |
| `TransactionDetail.jsx` | 54 | `transactions` | Oui | Non — page `/transactions/:id` |

`useAuth.js:66` **gère déjà** le 406 :

```js
if (error && error.code !== 'PGRST116') {   // PGRST116 = 0 ligne
  console.error(...);
}
```

**Analyse :** sur `/register`, aucune session n'existe, donc `fetchProfile` n'est jamais appelé. Le 406 observé ne peut pas provenir de `/register` lui-même. Il vient très probablement du chargement de l'application avec une session résiduelle, ou d'une navigation post-inscription.

**Ce 406 est un symptôme, pas la cause.** Il n'empêche pas l'inscription. Une fois le trigger corrigé, il pourra subsister sans bloquer.

## 1.4 Cause probable retenue

> **`supabase_auth_admin` n'a pas le privilège `EXECUTE` sur `public.handle_new_user()`, parce que `002_security_hardening.sql` a fait `REVOKE ALL ... FROM PUBLIC` puis accordé le droit au seul rôle `authenticated`. Le trigger `on_auth_user_created` échoue donc à chaque insertion dans `auth.users`, GoTrue renvoie 500, et aucune inscription ne peut aboutir.**

## 1.5 Correctif proposé — NON APPLIQUÉ

```sql
-- =============================================================================
-- CORRECTIF PROPOSÉ — autoriser le rôle Auth à exécuter le trigger de profil
-- ⚠️ NON EXÉCUTÉ — EN ATTENTE D'AUTORISATION
-- =============================================================================
--
-- Ce correctif n'ouvre AUCUN accès client :
-- supabase_auth_admin est un rôle interne, sans capacite de connexion
-- PostgREST. Il n'est jamais expose au navigateur.

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- Vérification attendue après application :
--   SELECT has_function_privilege('supabase_auth_admin',
--                                 'public.handle_new_user()', 'EXECUTE');
--   → true

-- =============================================================================
-- RETOUR ARRIÈRE
-- =============================================================================
--
-- REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM supabase_auth_admin;
-- =============================================================================
```

**Portée :** trois mots-clés ajoutés, aucune autre fonction, aucune table, aucune policy, aucun secret.

**Test de validation après application :** tenter une inscription avec un email de test. Attendu : `200`, une ligne dans `auth.users`, une ligne dans `profiles`.

**Message d'erreur lisible — proposition, sans push**

`Register.jsx` et `Login.jsx` devraient traduire le cas 5xx générique :

```js
const MESSAGES = {
  400: "Les informations saisies ne sont pas valides.",
  422: "Cet email ou ce mot de passe n'est pas accepté. Essayez un mot de passe plus robuste.",
  429: "Trop de tentatives. Réessayez dans quelques minutes.",
  500: "Le service d'inscription est momentanément indisponible. Réessayez dans quelques instants.",
  503: "Service temporairement indisponible. Réessayez plus tard.",
};

function messageInscription(err) {
  if (!err) return "Une erreur est survenue lors de l'inscription.";
  if (err.status && MESSAGES[err.status]) return MESSAGES[err.status];
  // Ne jamais afficher '{}' ni un message vide
  const m = typeof err.message === 'string' ? err.message.trim() : '';
  if (!m || m === '{}' || m === '[]') {
    return "Le service d'inscription est momentanément indisponible. Réessayez dans quelques instants.";
  }
  return m;
}
```

Puis dans `Register.jsx:42` : `setError(messageInscription(err));`

## 1.6 SMTP — constat sans aucune valeur secrète

| Élément | Constat |
| --- | --- |
| Hôte SMTP | configuré (`smtp-relay.brevo.com`, port 587) |
| Expéditeur | `JASONHOME` — nom affiché non conforme à la marque |
| Hooks d'authentification | **aucun activé** (`hook_send_email_enabled: false`, `hook_before_user_created_enabled: false`) |
| Échec d'envoi constatable | **Non déterminable sans logs** |

**Je n'ai lu ni affiché aucun mot de passe ni aucune clé.**

Point important : **un échec SMTP n'explique pas cette panne.** Un rejet SMTP se produit *après* l'insertion dans `auth.users` et n'annule pas la transaction. Or ici, **aucune ligne n'est créée**. Le blocage est en amont, dans le trigger.

---

# 2. VÉRIFICATIONS SUR CE QUI EST DÉJÀ DÉPLOYÉ

## 2.1 a) `jaspay-transactions` — `validateReference` contient toujours `trim()`

**Votre demande était de confirmer l'absence de `trim()`. Le corps déployé le contient toujours.** Je le signale au lieu de confirmer une suppression qui n'a pas eu lieu.

Corps réellement déployé (version 2), extrait de `validateReference` :

```js
function validateReference(reference, transactionType) {
  if (typeof reference !== 'string') {
    return 'Référence de transaction invalide';
  }
  const trimmed = reference.trim();          // ← PRÉSENT
  if (!REFERENCE_REGEX.test(trimmed)) {      // ← teste la valeur tronquée
    return 'Format de référence invalide';
  }
  const expected = REFERENCE_PREFIX_BY_TYPE[transactionType];
  if (expected && !trimmed.startsWith(expected + '-')) {
    return 'Référence incompatible avec le type de transaction';
  }
  return null;
}
```

| Attendu | Réel |
| --- | --- |
| `trim()` absent | **présent** |
| `?` (optional chaining) | présent |
| `\d{6}` correctement échappé | **déformé** — voir §2.1.1 |

### 2.1.1 🔴 DÉCOUVERTE : les regex sont doublement échappées dans le code stocké

Le corps retourné contient :

```
const REFERENCE_REGEX = /^(DEP|WDR)-\\\\d{6}-[0-9A-F]{8}$/;
```

Après décodage JSON, le code réellement exécuté est :

```js
const REFERENCE_REGEX = /^(DEP|WDR)-\\d{6}-[0-9A-F]{8}$/;
```

**`\\d` dans une regex littérale signifie « un antislash suivi de la lettre d »**, pas « un chiffre ».

Conséquence : **le format `DEP-251121-A1B2C3D4` serait REJETÉ**, et `validateReference` renverrait `Format de référence invalide` pour **toutes** les références légitimes.

Même problème sur `isValidDecimal` : le corps déployé contient `/^\\\\d+(\\\\.\\\\d{1,2})?$/` → après décodage : `/^\\d+(\\.\\d{1,2})?$/`

**Impact : aucun aujourd'hui**, car la branche `POST /api/transactions` n'est atteinte par personne — mais dès qu'un utilisateur créera un dépôt, **tous les montants et toutes les références seront rejetés en 400**.

**Cause probable :** le double échappement a été introduit par la sérialisation du corps lors du déploiement via le connecteur (le `\\` du littéral JS a été ré-échappé en `\\\\`).

**Ceci doit être corrigé avant que `jaspay-transactions` ne soit réellement utilisée.** Je ne l'ai pas modifié (gel en vigueur).

## 2.2 b) `jaspay-admin-surveillance` — contrôle du rôle

### Chaîne d'identité, dans l'ordre

| Étape | Code déployé | Effet si absent |
| --- | --- | --- |
| 1. Preflight | `if (req.method === 'OPTIONS') return 204` | avant toute logique |
| 2. JWT présent | `if (!authHeader \|\| !authHeader.startsWith('Bearer '))` → **401** | refus |
| 3. JWT vérifié serveur | `getUserIdFromToken(token)` via `/auth/v1/user` → **401** si null | refus |
| 4. Rôles lus | `restGet('user_roles?select=role&user_id=eq.<uid>')` | — |
| 5. Rôles calculés | `isSuperAdmin = roles.includes('super_admin')` · `isAdmin = roles.includes('admin')` | — |
| 6. Compte actif | `profiles?select=is_active` → **403** si absent ou false | refus |
| 7. Session admin active | `admin_sessions?revoked_at=is.null&expires_at=gt.now` → **403** si absente | refus |
| 8. Contrôle par route | voir ci-dessous | **403** |

### Contrôle de rôle par route

| Route | Méthode | Contrôle |
| --- | --- | --- |
| `/api/admin/sessions` | GET | `if (!isSuperAdmin) → 403 'Accès refusé : super administrateur requis'` |
| `/api/admin/sessions/:id` | DELETE | `if (!isSuperAdmin) → 403` |
| `/api/admin/audit-logs` | GET | `if (!isSuperAdmin && !isAdmin) → 403 'Accès refusé : administrateur requis'` |

### Un utilisateur sans rôle obtient-il 403 ?

**Oui — par le code, à deux niveaux :**

1. `isSuperAdmin === false` et `isAdmin === false` ⇒ toute route renvoie **403**.
2. Même avant cela, l'étape 7 exige une **session administrative active**. Un compte sans rôle n'en a pas ⇒ **403** dès l'étape 7.

**Statut du test : ⚠️ NON TESTÉ.** Il n'existe aucun compte sans rôle en base — les 2 seuls comptes (UUID `1111…`/`2222…`) sont des seeds dont les rôles ne peuvent pas être vérifiés sans exposer la table. Je m'abstiens de conclure sur un test que je n'ai pas exécuté.

### Privilèges `service_role` utilisés

La fonction s'authentifie avec `SUPABASE_SERVICE_ROLE_KEY` pour **toutes** ses lectures et écritures :

| Usage | Détail |
| --- | --- |
| Lecture `user_roles` | service_role → contourne RLS |
| Lecture `profiles` | service_role |
| Lecture `admin_sessions` | service_role |
| `PATCH admin_sessions` (last_activity, revoked_at) | service_role |
| Lecture `admin_actions` | service_role |
| `POST rpc/log_admin_action` | service_role |
| `GET /auth/v1/admin/users` (résolution emails) | service_role |

⚠️ **Point de vigilance :** comme `service_role` ignore RLS, **les contrôles 4 à 7 sont les seuls garde-fous**. Ils sont présents et cochés dans le code, mais ils ne bénéficient d'aucun filet de sécurité côté base.

⚠️ **Deuxième point :** la résolution des emails charge jusqu'à 1000 utilisateurs par appel via l'API Admin, à **chaque** requête. Fonctionnellement correct, mais coûteux.

## 2.3 c) Tableau récapitulatif des 4 fonctions déployées

| Fonction | Route | Méthode | Contrôle d'identité | Contrôle de rôle | Client utilisé |
| --- | --- | --- | --- | --- | --- |
| **jaspay-rate-limit** | `/functions/v1/jaspay-rate-limit` | OPTIONS | — (preflight) | — | **aucun** |
| | | POST | ❌ **aucun** — appelée avant connexion | — | `service_role` |
| **jaspay-config** | `/api/health` | GET | ❌ aucun (public, comportement d'origine) | — | **anon** |
| | `/api/bookmakers` | GET | ✅ JWT via `/auth/v1/user` → 401 | ❌ aucun rôle requis | **anon** (RLS active) |
| | `/api/payment-providers` | GET | ✅ idem | ❌ aucun | **anon** (RLS) |
| | `/api/payment-methods` | GET | ✅ idem | ❌ aucun | **anon** (RLS) |
| **jaspay-transactions** | `/api/transactions` | GET | ✅ JWT → 401 | ❌ aucun | `service_role` + filtre `user_id=eq.<uid>` |
| | `/api/transactions/:id` | GET | ✅ JWT | ❌ aucun | `service_role` + filtre `user_id` |
| | `/api/transactions/reference` | POST | ✅ JWT | ❌ aucun | `service_role` |
| | `/api/transactions` | POST | ✅ JWT | ❌ aucun | `service_role`, `user_id` depuis JWT, `status:'pending'` forcé |
| **jaspay-admin-surveillance** | `/api/admin/sessions` | GET | ✅ JWT | ✅ **super_admin** | `service_role` |
| | `/api/admin/sessions/:id` | DELETE | ✅ JWT | ✅ **super_admin** | `service_role` |
| | `/api/admin/audit-logs` | GET | ✅ JWT | ✅ **admin ou super_admin** | `service_role` |

**Observations :**

- `jaspay-rate-limit` est **la seule sans contrôle d'identité**, par nécessité : elle est appelée avant la connexion. C'est justifié mais mérite d'être su.
- `jaspay-config` est la seule à utiliser **anon**, donc la seule où RLS reste le garde-fou.
- Aucune fonction n'utilise un JWT utilisateur pour écrire — les écritures passent toutes par `service_role` avec des contrôles applicatifs.

---

# 3. CE QUI EST DÉJÀ DÉPLOYÉ — ÉTAT

| Fonction | Version | OPTIONS | État |
| --- | --- | --- | --- |
| `jaspay-rate-limit` | v4 | 204 | ✅ |
| `jaspay-config` | v2 | 204 | ✅ |
| `jaspay-transactions` | v2 | 204 | ⚠️ **regex cassées — inutilisable en écriture** |
| `jaspay-admin-surveillance` | v2 | 204 | ✅ (non testé en succès) |
| `jaspay-agent` | v1 | 503 | ⛔ gelé |
| `jaspay-admin-config` | v1 | 503 | ⛔ gelé |
| `jaspay-admin-users` | v1 | 503 | ⛔ gelé |

---

# 4. SYNTHÈSE

## Cause probable de l'échec d'inscription — UNE

**`supabase_auth_admin` n'a pas `EXECUTE` sur `public.handle_new_user()`.** Le trigger `on_auth_user_created` échoue à chaque insertion dans `auth.users`, la transaction est annulée, GoTrue renvoie 500, et le client affiche `'{}'`.

Preuve : `has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'EXECUTE')` → **false**, alors que le trigger l'appelle ; et **0 utilisateur créé en 24 h** malgré des tentatives.

Origine : `002_security_hardening.sql:85-86` — `REVOKE ALL FROM PUBLIC` puis `GRANT ... TO authenticated` (mauvais rôle).

## Correctif proposé — un seul `GRANT`

```sql
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
```

## Second problème, découvert en chemin

**Les regex déployées dans `jaspay-transactions` sont doublement échappées** (`\\d` au lieu de `\d`). Aucun impact aujourd'hui car la route d'écriture est inutilisée, mais **tout dépôt et tout retrait seraient rejetés en 400** dès la mise en service. À corriger avant d'autoriser l'usage réel de cette fonction.

## Ce qui reste incertain

- **Logs Auth et Postgres non consultés** : pas d'accès via le connecteur. La cause est établie par les privilèges et l'absence de comptes créés, **pas** par une trace de log. Une confirmation par log reste souhaitable.
- **Test 403 sans rôle non exécuté** : aucun compte sans rôle disponible.
- **Test de lecture avec JWT valide toujours impossible** : les identifiants des comptes A/B n'ont jamais été transmis.

---

# 5. TESTS — EXÉCUTÉS VS NON EXÉCUTÉS

## Exécutés (lecture seule)

| Test | Résultat |
| --- | --- |
| Comptage `auth.users` / `profiles` (24 h) | ✅ 2 total, **0 dans les 24 h** |
| Chronologie des 2 comptes | ✅ UUID seeds, timestamp identique |
| Triggers sur `auth.users` | ✅ `on_auth_user_created` → `handle_new_user()` |
| Corps de `handle_new_user()` | ✅ INSERT profiles uniquement, aucun lien avec `transactions` |
| Colonnes de `profiles` | ✅ 7/7 conformes au trigger |
| Triggers `public` | ✅ 1 seul utile : `update_profiles_updated_at` |
| Privilèges EXECUTE sur `handle_new_user` | ✅ **`supabase_auth_admin` = false** |
| Rôle `supabase_auth_admin` | ✅ ni superuser ni BYPASSRLS |
| Source du REVOKE dans les migrations | ✅ `002`, lignes 85-86 |
| Grep `.single()` dans `client/src` | ✅ 2 occurrences, analysées |
| GRANT sur `profiles` | ✅ anon/authenticated/service_role/postgres en ALL |
| `get_edge_function` `jaspay-transactions` | ✅ corps examiné, **regex doublement échappées** |
| Code de contrôle de rôle `jaspay-admin-surveillance` | ✅ chaîne complète vérifiée |

## Non exécutés

| Test | Raison |
| --- | --- |
| Logs Auth 60 min (`get_logs`) | ⛔ outil absent du connecteur |
| Logs Postgres / PostgREST | ⛔ idem |
| Logs SMTP | ⛔ idem |
| Test 403 avec compte sans rôle | ⛔ aucun compte sans rôle disponible |
| Test lecture avec JWT valide | ⛔ identifiants A/B jamais transmis |
| Inscription de test | ⛔ serait une écriture + gel en vigueur |
| Recherche de 406 dans les logs PostgREST | ⛔ pas d'accès aux logs |

---

## ⏸ EN ATTENTE DE VOTRE DÉCISION

Deux correctifs sont prêts et non appliqués :

1. `GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;` — débloque l'inscription
2. Correction du double échappement des regex dans `jaspay-transactions` — débloque dépôt/retrait

Les trois fonctions gelées (`jaspay-agent`, `jaspay-admin-config`, `jaspay-admin-users`) restent en 503 et n'ont pas été touchées.
