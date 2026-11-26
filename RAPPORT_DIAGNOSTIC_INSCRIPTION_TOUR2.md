# JASpay — DIAGNOSTIC INSCRIPTION (LECTURE SEULE) — Tour 2

**Date :** 16 novembre 2026
**Statut :** ⏸ Gel respecté — aucune écriture, aucun déploiement, aucun push

---

## 0. NON-ACTION

Aucun déploiement. Aucun push. Aucune migration. Aucun secret modifié. Aucun GRANT appliqué.
Toutes les requêtes SQL de ce tour sont des `SELECT`.

---

## 🔴 INCIDENT SÉCURITÉ À TRAITER EN PREMIER

L'outil `get_auth_config` m'a renvoyé le champ **`smtp_pass` en clair** dans sa réponse. Je ne l'ai **ni lu, ni recopié, ni réutilisé**. Il ne figure nulle part dans ce rapport ni dans aucun fichier du workspace.

Mais le fait qu'il soit retourné par l'API est un problème : **le mot de passe SMTP transitige et s'affiche en clair à chaque lecture de la configuration Auth.** Rotation recommandée dans Brevo. Votre consigne de ne jamais lire ce champ est la bonne — c'est l'outil lui-même qu'il faut contourner, et je n'avais pas de moyen de filtrer côté appel.

---

# 1. CONFIGURATION AUTH — CHAMPS DEMANDÉS

| Champ | Valeur | Verdict |
| --- | --- | --- |
| `smtp_host` | `smtp-relay.brevo.com` | ✅ cohérent (relais Brevo) |
| `smtp_port` | `587` | ✅ correct (STARTTLS) |
| `smtp_user` | `c4466f001@smtp-brevo.com` | ✅ format attendu Brevo (login seul) |
| **`smtp_admin_email`** | **`jasonhome7010@gmail.com`** | 🔴 **incohérent — voir ci-dessous** |
| `smtp_sender_name` | `JASpay` | ✅ corrigé, confirmé |
| `mailer_autoconfirm` | `false` | ⚠️ confirmation e-mail obligatoire |
| `site_url` | `https://jaspay.vercel.app` | ✅ exact |
| `uri_allow_list` | `https://jaspay.vercel.app/auth/callback`, `https://jaspay.vercel.app/**`, `http://localhost:5173/**`, `https://jaspay.vercel.app/reset-password` | ✅ callback présent |
| `rate_limit_email_sent` | `30` | ✅ normal |
| `external_email_enabled` | `true` | ✅ |
| `mailer_secure_email_change_enabled` | `true` | ✅ |

**Réponses directes à vos trois questions :**

1. **`site_url` vaut bien `https://jaspay.vercel.app`** ✅
2. **`https://jaspay.vercel.app/auth/callback` est bien dans `uri_allow_list`** ✅ — et même en première position. `/**` couvre le reste.
3. **L'adresse d'expéditeur n'a PAS un domaine cohérent** 🔴

## 1.1 Pourquoi `jasonhome7010@gmail.com` est problématique

Le compte de relais est `c4466f001@smtp-brevo.com` (identité Brevo n° 4466f001). L'expéditeur déclaré est une adresse **Gmail**.

Brevo n'autorise pas à expédier depuis un domaine quel qu'il soit : l'expéditeur doit être soit une adresse **vérifiée individuellement**, soit appartenir à un **domaine authentifié** dans Brevo (SPF + DKIM). Or **`gmail.com` ne peut pas être authentifié par vous** — vous n'en êtes pas propriétaire, vous ne pouvez pas y publier d'enregistrements DNS.

**Indice fort trouvé dans la boîte mail** : un e-mail Brevo réellement délivré par ce même compte, en août 2026, provenait de :

```
JobiFacile <isaacamegan10@11875397.brevosend.com>
```

C'est-à-dire un expéditeur sur **`11875397.brevosend.com`** — un domaine Brevo attribué au compte. **L'envoi qui fonctionnait utilisait un domaine Brevo, pas une adresse Gmail.**

Cela suggère que la configuration qui marchait a été remplacée par une adresse Gmail non vérifiée. **Hypothèse — non confirmée :** Brevo refuse l'envoi avec un rejet du type « sender not verified / 550 », ce qui remonte en 500 sur `/signup`.

**Je ne peux pas le vérifier** : le seul endroit où le rejet apparaîtrait est le journal Brevo (dashboard, côté utilisateur) ou les logs Auth — inaccessibles (§2a).

**Vérification à faire de votre côté (30 secondes, sans me donner aucun secret) :** dans Brevo → *Senders & IP* → vérifier si `jasonhome7010@gmail.com` apparaît comme **« Verified »**. S'il ne l'est pas, c'est une seconde cause indépendante.

---

# 2. DIAGNOSTIC INSCRIPTION

## 2a) Logs Auth 60 min — ⛔ NON EXÉCUTÉ, et j'ai trouvé pourquoi

Le connecteur Supabase **n'expose aucun outil de logs**. J'ai listé ses 30 outils : `get_logs` n'existe pas. Aucune variante (`get_project_health` ne retourne que des états de service).

**Mais j'ai trouvé la raison mécanique de votre « 500 sans message lisible » :**

```json
"audit_log_disable_postgres": true
```

Et la table de journalisation Auth est **totalement vide** :

```json
{"rows": [], "row_count": 0}
```

Requête : `SELECT created_at, payload->>'action', payload->>'msg', payload->>'error' FROM auth.audit_log_entries ORDER BY created_at DESC LIMIT 40;`

**Conclusion : les événements Auth ne sont pas écrits en base.** GoTrue est configuré pour ne pas journaliser dans Postgres. C'est cohérent avec le fait que ni vous ni moi ne parvenons à obtenir un message d'erreur lisible : **l'information n'est pas conservée en base, elle n'existe que dans les logs du conteneur Auth**, auxquels je n'ai pas accès.

⚠️ **`audit_log_disable_postgres = true` est en soi un problème de sécurité** : aucune trace des connexions, échecs d'authentification ou créations de comptes n'est conservée. À réactiver dans un lot ultérieur — mais cela génère du volume, donc pas à la légère.

## 2b) Triggers sur `auth.users` — corps et analyse

**Un seul trigger :**

```json
{"tgname":"on_auth_user_created","tgenabled":"O","proname":"handle_new_user",
 "fn_owner":"postgres","security_definer":true,
 "auth_admin_exec":false,"auth_users_owner":"supabase_auth_admin"}
```

Il est **activé** (`tgenabled = O`, donc pas en `DISABLE`).

**Recherche de causes d'échec, une par une :**

| Piste | Résultat |
| --- | --- |
| Contrainte sur `profiles` | ❌ **Écartée.** 3 contraintes seulement : PK sur `id`, FK vers `auth.users`, UNIQUE sur `public_id`. |
| `public_id` NOT NULL sans défaut ? | ❌ **Écartée.** `public_id` est **nullable**, aucun défaut requis. |
| `profiles.email` NOT NULL | ❌ **Écartée.** Le trigger fournit `NEW.email`, qui est NOT NULL côté `auth.users`. |
| RLS sur `profiles` | ❌ **Écartée.** Le trigger est `SECURITY DEFINER` propriété de `postgres` ; `postgres` n'est pas soumis à RLS, et aucune policy ne s'applique au propriétaire. |
| Référence à `transactions` | ❌ **Écartée.** Le corps ne fait qu'un INSERT dans `profiles`. |
| **Privilège EXECUTE** | ✅ **SEULE CAUSE POSSIBLE** — voir ci-dessous. |

Les policies RLS de `profiles` pour `authenticated` (aucun INSERT/DELETE direct, lecture de son propre profil, mise à jour de ses coordonnées) **ne concerne pas** le trigger : celui-ci ne s'exécute pas en tant qu'`authenticated`.

## 2b-bis) Vos deux objections techniques — réponse argumentée

Vous avez soulevé deux points. **L'un est exact et important, l'autre ne protège pas le trigger.** Je réponds sur le fond, sans complaisance.

### Objection 1 : « le privilège EXECUTE n'est vérifié qu'à `CREATE TRIGGER` »

**Pas tout à fait.** `CREATE TRIGGER` exige le privilège `TRIGGER` **sur la table**, pas `EXECUTE` **sur la fonction**. En PostgreSQL, le contrôle `EXECUTE` sur une fonction de trigger s'effectue **au moment où le trigger se déclenche**, contre le rôle courant de l'instruction.

Conséquence ici : GoTrue insère dans `auth.users` sous le rôle `supabase_auth_admin` (c'est le propriétaire de la table). Le trigger se déclenche, l'EXECUTE est vérifié contre `supabase_auth_admin` → **refusé** (`42501`).

C'est d'ailleurs cohérent avec votre propre observation : le trigger a bien été créé sans erreur en migration 002, **et pourtant** aucune inscription n'a jamais abouti. Si le privilège n'était contrôlé qu'à la création, la panne serait inexplicable.

### Objection 2 : « `handle_new_user` est `SECURITY DEFINER` »

**Exact, mais cela ne change rien.** `SECURITY DEFINER` détermine les privilèges **à l'intérieur** du corps de la fonction (ici : écrire dans `profiles` avec les droits de `postgres`). Cela **ne dispense pas** du contrôle `EXECUTE` sur la fonction elle-même, qui est toujours effectué contre l'appelant.

Vérifié en base — c'est le point décisif :

```
security_definer : true
auth_admin_exec  : false      ← supabase_auth_admin n'a pas EXECUTE
```

Le seul moyen de contourner le contrôle serait d'être superutilisateur ou propriétaire de la fonction. Or :

```json
{"rolname":"supabase_auth_admin","rolsuper":false,"rolbypassrls":false,"rolcanlogin":true}
```

Ni l'un ni l'autre — et `supabase_auth_admin` **n'est pas** propriétaire de `handle_new_user()` (le propriétaire est `postgres`).

### Objection 3 : « GoTrue envoie l'e-mail dans la même transaction ; un échec SMTP annule le compte »

**Vous avez raison, et je retire ma formulation du tour précédent.** J'avais écrit qu'un échec SMTP « n'explique pas cette panne » ; c'est trop catégorique. Un rejet SMTP **peut** annuler la transaction et produire exactement les mêmes symptômes (500 + aucune ligne).

**En revanche**, cela ne disculpe pas le privilège manquant, pour une raison d'**ordre d'exécution** :

```
BEGIN
  1. INSERT INTO auth.users      ← trigger se déclenche ICI
       └─ EXECUTE refusé → 42501 → échec immédiat
  2. envoi de l'e-mail SMTP      ← JAMAIS ATTEINT
  3. COMMIT
```

Le trigger s'exécute **avant** l'envoi de l'e-mail. Tant que l'EXECUTE est refusé, **le code SMTP n'est jamais atteint** : le problème SMTP est masqué par le problème de privilège.

**Donc : deux défauts indépendants peuvent coexister, et le privilège est le premier dans la chaîne.** Corriger le GRANT ne suffira pas si l'expéditeur Brevo est refusé — c'est précisément pourquoi je signale les deux.

## 2c) SMTP et hooks

| Élément | Constat |
| --- | --- |
| Échec d'envoi visible dans les logs | ⛔ **Indéterminable** — logs inaccessibles, et `audit_log_disable_postgres = true` |
| Hook d'authentification configuré | ❌ **Aucun.** `hook_send_email_enabled: false`, `hook_before_user_created_enabled: false`, `hook_after_user_created_enabled: false` |
| Jeu de modèles d'e-mail | Par défaut Supabase (gabarits standards, aucun personnalisé) |
| Expéditeur probablement non vérifié | ⚠️ Voir §1.1 |

**Test complémentaire exécuté :** recherche dans la boîte Gmail connectée (`kiraamegan10@gmail.com`), **spam et corbeille incluses**, sur les sujets de confirmation et les expéditeurs Brevo.

Résultat — `search_scope.complete: true`, **4 messages, aucun provenant de JASpay** :

| Date | Expéditeur | Sujet |
| --- | --- | --- |
| 16/11/2026 | Supabase `<welcome@supabase.com>` | Confirmation du **compte Supabase** (pas une inscription JASpay) |
| 23/08/2026 | JobiFacile `<isaacamegan10@11875397.brevosend.com>` | Confirm your email address |
| 12/07/2026 | Emploiburkina.com | Confirmation de compte |
| 03/07/2026 | Supabase Auth `<noreply@mail.app.supabase.io>` | Confirm your email address |

**Aucun e-mail de confirmation JASpay n'a jamais été délivré.** Le compte Supabase lui-même a bien été confirmé le 16/11. Le relais Brevo fonctionne (preuve : août 2026), mais sur un **domaine `brevosend.com`**, pas sur Gmail.

⚠️ **Note :** l'adresse de la boîte connectée est `kiraamegan10@gmail.com`, alors que l'expéditeur configuré est `jasonhome7010@gmail.com`. Ce ne sont pas les mêmes comptes. Si vous attendiez les e-mails sur la boîte connectée, ils n'y arriveraient pas de toute façon.

## 2d) Volumétrie 24 h

```json
{"total_users": 2, "users_24h": 0, "total_profiles": 2, "profiles_24h": 0}
```

**Correction d'interprétation par rapport à mon tour précédent :** les 2 comptes existants portent `created_at = 2026-11-17 06:55:54`, soit une date **postérieure à aujourd'hui (16/11/2026)**. Le compteur « 0 sur 24 h » est donc en partie un artefact de cette datation future anormale, et **ne prouve pas à lui seul** que les insertions échouent.

Détail des deux comptes :

| id | email_confirmed_at | confirmation_sent_at | last_sign_in_at |
| --- | --- | --- | --- |
| `11111111-…` | 2026-11-17 06:55:54 | **null** | **null** |
| `22222222-…` | 2026-11-17 06:55:54 | **null** | **null** |

`confirmation_sent_at = null` **sur les deux** : **aucun e-mail de confirmation n'a jamais été envoyé pour ces comptes**. Ils ont été créés confirmés d'emblée, par un seed SQL (UUID séquentiels, horodatage identique à la microseconde, jamais connectés).

**Preuve conservée :** aucun e-mail JASpay dans la boîte (§2c) + `confirmation_sent_at` nul + 2 seuls comptes, tous deux des seeds. **Aucune inscription réelle n'a jamais abouti.**

## 2e) 406 — grep `.single()`

Recherche exhaustive dans `client/src` :

```
client/src/hooks/useAuth.js:66:        .single();
client/src/pages/TransactionDetail.jsx:54:        .single();
```

**Deux occurrences seulement. Aucun `maybeSingle()` dans le projet.**

| Fichier | Ligne | Table | Peut renvoyer 0 ligne ? | S'exécute sur `/register` ? |
| --- | --- | --- | --- | --- |
| `useAuth.js` | 66 | `profiles` | **Oui** | Non — seulement dans `fetchProfile`, appelé si une session existe |
| `TransactionDetail.jsx` | 54 | `transactions` | Oui | Non — page `/transactions/:id` |

La garde existante :

```js
// useAuth.js:68
if (error && error.code !== 'PGRST116') {
  console.error('[useAuth] Erreur récupération profil :', error.message);
}
```

**Nuance importante :** cette garde ne fait que **supprimer le log**. Elle n'empêche pas le 406 — la requête a déjà été rejetée par PostgREST au moment où le code s'exécute.

**D'où vient alors le 406 observé ?** Explication la plus probable : **une session périmée subsiste dans `localStorage`**. Le point d'entrée de l'app déclenche `onAuthStateChange`, `fetchProfile` s'exécute avec un `user_id` qui n'existe plus dans `profiles` → 0 ligne → **406**. Cela se produit au chargement de l'application, donc aussi quand on arrive sur `/register` avec un ancien jeton.

**Ce 406 est un symptôme, pas la cause.** Il n'empêche pas l'inscription. Il disparaîtra en vidant le `localStorage` ou en corrigeant `fetchProfile` (voir proposition §2f-bis).

**406 dans les logs PostgREST :** ⛔ non exécuté — même absence d'accès aux logs.

## 2f) Pourquoi `"{}"` s'affiche, et proposition

```js
// Register.jsx:42
setError(err.message || 'Une erreur est survenue lors de l\'inscription.');
```

`AuthRetryableFetchError` est levée par `supabase-js` quand la réponse est un **5xx sans corps JSON exploitable**. La propriété `message` vaut alors littéralement la chaîne `"{}"`.

Cette chaîne étant **truthy**, l'opérateur `||` ne déclenche jamais le message de repli. L'utilisateur voit `{}`.

### 2f-bis) Proposition — sans push

```js
// client/src/utils/authErrors.js  (nouveau fichier)
const MESSAGES_PAR_STATUT = {
  400: "Les informations saisies ne sont pas valides.",
  422: "Cet email ou ce mot de passe n'est pas accepté. Choisissez un mot de passe plus robuste.",
  429: "Trop de tentatives. Réessayez dans quelques minutes.",
  500: "Le service d'inscription est momentanément indisponible. Réessayez dans quelques instants.",
  503: "Service temporairement indisponible. Réessayez plus tard.",
};

export function messageInscription(err) {
  const defaut = "Le service d'inscription est momentanément indisponible. Réessayez dans quelques instants.";
  if (!err) return defaut;
  if (err.status && MESSAGES_PAR_STATUT[err.status]) return MESSAGES_PAR_STATUT[err.status];
  const m = typeof err.message === 'string' ? err.message.trim() : '';
  // Ne jamais afficher '{}', '[]' ou une chaîne vide
  if (!m || m === '{}' || m === '[]') return defaut;
  return m;
}
```

Puis, dans `Register.jsx:42` :

```js
setError(messageInscription(err));
```

Et pour le 406, dans `useAuth.js`, remplacer `.single()` par une lecture tolérante :

```js
const { data, error } = await supabase
  .from('profiles').select('*').eq('id', userId).maybeSingle();
// 0 ligne => data === null, plus de 406
```

*Note : `maybeSingle()` est la méthode prévue par `supabase-js` pour ce cas et ne produit pas de 406. Elle n'est utilisée nulle part dans le projet actuellement.*

---

# 3. VÉRIFICATIONS SUR LE DÉPLOYÉ

## 3a) `jaspay-transactions` — `trim()` TOUJOURS PRÉSENT

**Je ne peux pas confirmer l'absence de `trim()` : il est toujours là.** Le corps déployé (version 2, ACTIVE, `verify_jwt: false`) contient :

```js
function validateReference(reference, transactionType) {
  if (typeof reference !== 'string') {
    return 'Référence de transaction invalide';
  }
  const trimmed = reference.trim();          // ← PRÉSENT
  if (!REFERENCE_REGEX.test(trimmed)) {
    return 'Format de référence invalide';
  }
  const expected = REFERENCE_PREFIX_BY_TYPE[transactionType];
  if (expected && !trimmed.startsWith(expected + '-')) {
    return 'Référence incompatible avec le type de transaction';
  }
  return null;
}
```

Et dans `isValidDecimal` / `formatDecimal` : `const str = String(value).trim();` et `Number(String(value).trim()).toFixed(2)`.

**Il n'y a donc pas eu de suppression de `trim()` entre la source et le déploiement.** Si vous attendiez cette correction, elle n'a jamais été appliquée — ni par moi, ni avant.

### ⚠️ RÉTRACTION : je retire ma conclusion sur les regex

Au tour précédent j'ai affirmé que les regex étaient **doublement échappées** et que toutes les références seraient rejetées. **Je retire cette affirmation : elle n'est pas prouvée.**

Ce que j'ai vérifié depuis :

| Source | `REFERENCE_REGEX` | Backslashes |
| --- | --- | --- |
| Fichier local | `/^(DEP\|WDR)-\d{6}-[0-9A-F]{8}$/` | **1** (correct) |
| `origin/main` (git) | idem | **1** (correct) |

Test sémantique exécuté en Node, pour établir ce que chaque forme produirait :

```
1 backslash  -> DEP-251121-A1B2C3D4 : true      (fonctionne)
2 backslashes-> DEP-251121-A1B2C3D4 : false     (rejette tout)
montant 5000, 1 backslash   -> true
montant 5000, 2 backslashes -> false
```

Le comptage de backslashes dans le corps retourné par `get_edge_function` n'est **pas fiable** : le payload est sérialisé plusieurs fois, et j'obtiens des compteurs incohérents entre deux lignes de la même fonction (une regex de chemin ressort à 1 backslash, la regex de référence à 2).

**Statut honnête : indéterminé.** La cause probable de cette incohérence est un artefact de ré-encodage du connecteur, pas forcément un défaut du code déployé — le fichier local, qui est la source du déploiement, est correct. **Je ne peux pas trancher sans un JWT valide** (la validation du format s'exécute après l'authentification). À vérifier au premier test de dépôt réel.

## 3b) `jaspay-admin-surveillance` — contrôle du rôle

### Chaîne complète, avec numéros de ligne

```js
// L164-167 — 1. JWT présent
const authHeader = req.headers.get('Authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return jsonResponse({ error: "Token d'authentification manquant" }, 401, cors);
}

// L169-174 — 2. JWT vérifié auprès du service Auth
const token = authHeader.substring(7);
const userId = await getUserIdFromToken(token);
if (!userId) {
  return jsonResponse({ error: 'Token invalide ou expiré' }, 401, cors);
}

// L178-183 — 3. Rôles lus et calculés
const roleRows = await restGet(
  'user_roles?select=role&user_id=eq.' + encodeURIComponent(userId)
);
const roles = roleRows.map((r) => r.role);
const isSuperAdmin = roles.includes('super_admin');
const isAdmin = roles.includes('admin');

// L186-192 — 4. Compte actif
const profile = await restGetOne(
  'profiles?select=is_active&id=eq.' + encodeURIComponent(userId)
);
if (!profile || !profile.is_active) {
  return jsonResponse({ error: 'Compte suspendu ou inactif' }, 403, cors);
}

// L195-211 — 5. Session administrative active
const session = await restGetOne(
  'admin_sessions?select=id,revoked_at,expires_at,last_activity' +
    '&admin_user_id=eq.' + encodeURIComponent(userId) +
    '&revoked_at=is.null' +
    '&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) +
    '&order=last_activity.desc'
);
if (!session) {
  return jsonResponse(
    { error: 'Aucune session administrative active. Veuillez vous reconnecter.' },
    403, cors
  );
}
```

Puis, par route :

```js
// L253-258  GET  /api/admin/sessions
if (!isSuperAdmin) return jsonResponse({ error: 'Accès refusé : super administrateur requis' }, 403, cors);

// L275-280  DELETE /api/admin/sessions/:id
if (!isSuperAdmin) return jsonResponse({ error: 'Accès refusé : super administrateur requis' }, 403, cors);

// L309-314  GET  /api/admin/audit-logs
if (!isSuperAdmin && !isAdmin) return jsonResponse({ error: 'Accès refusé : administrateur requis' }, 403, cors);
```

**Deux contrôles indépendants avant toute lecture** : (a) les rôles sont chargés et testés par route **avant** la requête de données, (b) la session administrative active est exigée en L195-211, **avant** également.

### un utilisateur sans rôle obtient-il 403 ?

**Par le code : oui, deux fois.** Il échoue d'abord en L205-211 (aucune session administrative), et s'il en avait une, il échouerait en L253/275/309 (rôle absent).

**Statut du test : ⚠️ NON TESTÉ — mais j'ai la donnée.** J'ai vérifié la composition des rôles :

```json
{"users_sans_role": 2, "total_roles": 0}
```

**`user_roles` est vide et les 2 comptes existants n'ont aucun rôle.** Un compte sans rôle existe donc bel et bien, mais je ne peux pas déclencher le test — il faudrait un JWT valide, et je n'ai pas les identifiants. Je marque **non testé**, conformément à votre consigne, tout en notant que le cas est disponible pour quand vous fournirez un jeton.

### Privilèges `service_role` utilisés

```js
// L60
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
```

| Usage | Détail |
| --- | --- |
| Lecture `user_roles` | `service_role` → contourne RLS |
| Lecture `profiles.is_active` | `service_role` |
| Lecture `admin_sessions` | `service_role` |
| `PATCH admin_sessions` (last_activity, revoked_at) | `service_role` |
| Lecture `admin_actions` | `service_role` |
| `POST` → `rpc/log_admin_action` | `service_role` |
| `GET /auth/v1/admin/users` (résolution des e-mails) | `service_role` |

⚠️ `service_role` **ignore RLS** : les contrôles L164-211 sont **les seuls garde-fous**. Ils sont présents et correctement ordonnés, mais aucun filet de sécurité en base ne les double.

## 3c) Tableau — fonctions déployées

| Fonction | Route | Méthode | Contrôle d'identité | Contrôle de rôle | Client |
| --- | --- | --- | --- | --- | --- |
| **jaspay-rate-limit** | `/functions/v1/jaspay-rate-limit` | OPTIONS | — (preflight) | — | aucun |
| | | POST | ❌ aucun (appelée avant connexion) | — | `service_role` |
| **jaspay-config** | `/api/health` | GET | ❌ aucun (public, d'origine) | — | `anon` |
| | `/api/bookmakers` | GET | ✅ JWT → `/auth/v1/user` → 401 | ❌ aucun rôle requis | `anon` (RLS) |
| | `/api/payment-providers` | GET | ✅ idem | ❌ aucun | `anon` (RLS) |
| | `/api/payment-methods` | GET | ✅ idem | ❌ aucun | `anon` (RLS) |
| **jaspay-transactions** | `/api/transactions` | GET | ✅ JWT → 401 | ❌ aucun | `service_role` + filtre `user_id=eq.<uid>` |
| | `/api/transactions/:id` | GET | ✅ JWT | ❌ aucun | `service_role` + filtre `user_id` |
| | `/api/transactions/reference` | POST | ✅ JWT | ❌ aucun | `service_role` |
| | `/api/transactions` | POST | ✅ JWT | ❌ aucun | `service_role`, `user_id` depuis JWT, `status:'pending'` forcé |
| **jaspay-admin-surveillance** | `/api/admin/sessions` | GET | ✅ JWT | ✅ **super_admin** | `service_role` |
| | `/api/admin/sessions/:id` | DELETE | ✅ JWT | ✅ **super_admin** | `service_role` |
| | `/api/admin/audit-logs` | GET | ✅ JWT | ✅ **admin ou super_admin** | `service_role` |

**Fonctions en 503, non déployées, non touchées :** `jaspay-agent`, `jaspay-admin-config`, `jaspay-admin-users`.

---

# 4. CONCLUSION — UNE CAUSE PROBABLE, UN CORRECTIF PROPOSÉ

## La hiérarchie des causes, après vos objections

Vos objections m'ont conduit à réexaminer le diagnostic. Résultat : **le privilège manquant reste la cause première, mais il n'est pas forcément la seule.**

| # | Cause | Certitude | Preuve |
| --- | --- | --- | --- |
| 1 | `supabase_auth_admin` sans `EXECUTE` sur `handle_new_user()` | ✅ **Certaine** | `has_function_privilege → false`, trigger actif, ni superuser ni propriétaire |
| 2 | Expéditeur Brevo `jasonhome7010@gmail.com` probablement non vérifié | ⚠️ **Forte suspicion** | Domaine non authentifiable ; envoi qui marchait utilisait `brevosend.com` |

**Cause probable retenue (§2, la seule à traiter maintenant) :**

> **La fonction de trigger `public.handle_new_user()` n'accorde pas le privilège `EXECUTE` à `supabase_auth_admin`. Le contrôle a lieu au déclenchement, pas à la création du trigger, et `SECURITY DEFINER` ne l'en dispense pas. L'`INSERT` de GoTrue dans `auth.users` échoue donc en `42501` avant même d'atteindre l'envoi de l'e-mail, d'où un 500 et aucune inscription possible.**

## Correctif proposé — NON APPLIQUÉ

```sql
-- ⚠️ NON EXÉCUTÉ — EN ATTENTE DE VOTRE AUTORISATION
-- supabase_auth_admin est un rôle interne : aucun accès PostgREST, jamais exposé au navigateur.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- Vérification attendue :
--   SELECT has_function_privilege('supabase_auth_admin','public.handle_new_user()','EXECUTE');
--   → true

-- Retour arrière :
--   REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM supabase_auth_admin;
```

## Ordre de traitement recommandé

1. **Vérifier l'expéditeur Brevo** (dashboard, sans me donner aucun secret) — 30 s, aucune modification.
2. Appliquer le `GRANT` — il faut de toute façon le faire, même si Brevo est correct.
3. Tester **une** inscription avec un e-mail réel, et me transmettre le message d'erreur exact.
4. Si le 500 persiste, le second verrou est SMTP et le test 3 l'aura isolé.

**Point d'honnêteté :** je ne peux pas vous garantir que le `GRANT` suffira. Le défaut de privilège est certain et bloquant, mais si l'expéditeur Brevo est refusé, l'inscription échouera encore — avec cette fois un message d'erreur visible dans les logs du conteneur. C'est le seul moyen de progresser sans déroger au gel.

---

# 5. TESTS EXÉCUTÉS VS NON EXÉCUTÉS

## Exécutés (lecture seule)

| Test | Résultat |
| --- | --- |
| `get_auth_config` — 11 champs demandés | ✅ obtenus (hors `smtp_pass`, écarté) |
| `site_url` = vercel | ✅ conforme |
| `uri_allow_list` contient `/auth/callback` | ✅ conforme |
| Cohérence du domaine expéditeur | 🔴 **incohérent** (Gmail vs Brevo) |
| Trigger sur `auth.users` + état | ✅ 1 seul, activé, `SECURITY DEFINER`, owner `postgres` |
| Privilège EXECUTE `supabase_auth_admin` | ✅ **false** |
| Rôle `supabase_auth_admin` (superuser/BYPASSRLS) | ✅ ni l'un ni l'autre |
| Contraintes `profiles` | ✅ 3, aucune bloquante |
| Colonnes `profiles` (nullable) | ✅ `public_id` nullable |
| Policies RLS `profiles` | ✅ 6, sans effet sur le trigger |
| `auth.audit_log_entries` | ✅ **vide** + `audit_log_disable_postgres: true` |
| Volumétrie 24 h | ⚠️ 0 — **artefact de datation future** |
| `confirmation_sent_at` des 2 comptes | ✅ **null pour les deux** |
| Recherche e-mails de confirmation (spam+corbeille) | ✅ `complete: true`, **aucun JASpay** |
| Composition des rôles | ✅ **`user_roles` vide**, 2 comptes sans rôle |
| Grep `.single()` / `maybeSingle()` | ✅ 2 occurrences, 1 garde |
| `get_edge_function` `jaspay-transactions` | ✅ `trim()` présent |
| Regex — source locale et git | ✅ **1 backslash (correct)** |
| Regex — test sémantique Node | ✅ 2 backslashes rejetteraient tout |
| Chaîne de contrôle `jaspay-admin-surveillance` | ✅ lignes 164-314 |
| Structure `admin_sessions` / `user_roles` | ✅ `admin_user_id` (pas `user_id`) |

## Non exécutés

| Test | Raison |
| --- | --- |
| Logs Auth 60 min (`get_logs`) | ⛔ **outil inexistant dans le connecteur** ; journal Postgres désactivé |
| Logs Postgres / PostgREST autour du 500 | ⛔ idem |
| 406 dans les logs PostgREST | ⛔ idem |
| Échec d'envoi SMTP | ⛔ pas de logs ; à voir dans le dashboard Brevo |
| 403 `jaspay-admin-surveillance` avec compte sans rôle | ⛔ **le compte existe** (`user_roles` vide) mais sans JWT |
| Lecture avec JWT valide (toutes fonctions) | ⛔ identifiants A/B jamais transmis |
| Inscription de test | ⛔ serait une écriture + gel en vigueur |
| Comptage fiable des backslashes du corps déployé | ⛔ payload re-sérialisé par le connecteur |

---

## ⏸ EN ATTENTE

Rien n'a été appliqué. Deux actions possibles, à votre décision :

1. Vérifier dans Brevo que `jasonhome7010@gmail.com` est un expéditeur validé.
2. M'autoriser à exécuter le `GRANT` unique sur `handle_new_user()`.

Les trois fonctions gelées restent en 503 et n'ont pas été touchées.
