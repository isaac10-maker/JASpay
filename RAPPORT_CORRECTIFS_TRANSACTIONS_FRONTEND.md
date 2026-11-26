# JASpay — CORRECTIFS TRANSACTIONS ET FRONTEND — RAPPORT DE PRÉPARATION

**Date :** 16 novembre 2026
**Statut :** ⏸ Phase locale terminée — **rien déployé, rien poussé**

---

## 0. PÉRIMÈTRE RESPECTÉ

| Interdiction | Respectée |
| --- | --- |
| `get_auth_config` | ✅ **jamais appelé** |
| Boîte mail / connecteur Gmail | ✅ **jamais consulté** |
| Paramètre Auth ou SMTP modifié | ✅ aucun |
| GRANT sur `handle_new_user` | ✅ aucun |
| Migration / RLS / secrets / données | ✅ aucune |
| Design modifié | ✅ aucun fichier de style touché |
| `jaspay-agent` / `admin-config` / `admin-users` | ✅ non touchées |
| `TransactionDetail.jsx` | ✅ non modifié (vérifié par `git diff` vide) |
| Déploiement / push / migration | ✅ **aucun** |

Seul appel distant effectué : `get_edge_function` sur `jaspay-transactions` (lecture, §1D).

---

# 1. `jaspay-transactions` — CORRECTIONS LOCALES

## 1.1 Fichier inspecté

`supabase/functions/jaspay-transactions/index.js` (440 lignes)

## 1.2 Modifications appliquées

### A. `validateReference` — suppression de `trim()`

```js
// AVANT
function validateReference(reference, transactionType) {
  if (typeof reference !== 'string') {
    return 'Référence de transaction invalide';
  }
  const trimmed = reference.trim();
  if (!REFERENCE_REGEX.test(trimmed)) {
    return 'Format de référence invalide';
  }
  const expected = REFERENCE_PREFIX_BY_TYPE[transactionType];
  if (expected && !trimmed.startsWith(expected + '-')) {
    return 'Référence incompatible avec le type de transaction';
  }
  return null;
}

// APRÈS
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
```

La chaîne est désormais testée **brute**. L'ancre `^...$` fait le reste : un espace en tête ou en queue ne peut plus correspondre.

### B. Simplification des regex

| Avant | Après |
| --- | --- |
| `/^(DEP\|WDR)-\d{6}-[0-9A-F]{8}$/` | `/^(DEP\|WDR)-[0-9]{6}-[0-9A-F]{8}$/` |
| `/^\d+(\.\d{1,2})?$/` | `/^[0-9]+([.][0-9]{1,2})?$/` |

Plus aucun `\d`, plus aucun `\.`. `[.]` est strictement équivalent à `\.` dans une classe de caractères.

### C. Ce qui n'a PAS changé

Vérifié ligne par ligne : contrôles d'identité (JWT → `/auth/v1/user` → `userId`), filtrage `user_id=eq.<uid>` sur toutes les lectures, `user_id` injecté depuis le JWT et jamais depuis le corps, `status: 'pending'` forcé côté serveur, journalisation `transaction_events`, validations bookmaker/provider/méthode/limites, CORS restreint. **Aucun contrôle n'a été retiré ou affaibli.**

`trim()` est **conservé** dans `isValidDecimal` et `formatDecimal` : la consigne ne portait que sur les références, et je n'ai pas élargi le périmètre.

## 1.3 Tests obligatoires — résultats individuels

Banc : `supabase/functions/_proposed/test-transactions-fixes.mjs`
Les fonctions sont **extraites du fichier source réel** par analyse de code, pas recopiées : une divergence entre le fichier et le test est impossible.

Commande : `node supabase/functions/_proposed/test-transactions-fixes.mjs`

```
==========================================================================
REFERENCE_REGEX extraite du fichier source :
  const REFERENCE_REGEX = /^(DEP|WDR)-[0-9]{6}-[0-9A-F]{8}$/;
==========================================================================
PASS | C1  DEP-251121-A1B2C3D4 (reference valide)
PASS | C2  espace AVANT -> rejetee
PASS | C3  espace APRES -> rejetee
PASS | C4  minuscules -> rejetee
PASS | C5  WDR valide avec type withdrawal -> acceptee
PASS | C6  prefixe incompatible (DEP avec type withdrawal) -> rejetee
PASS | C7  WDR avec type deposit -> rejetee
PASS | C8  5 chiffres au lieu de 6 -> rejetee
PASS | C9  7 chiffres au lieu de 6 -> rejetee
PASS | C10 hexa minuscule en fin -> rejetee
PASS | C11 7 caracteres hexa au lieu de 8 -> rejetee
PASS | C12 non-chaine (number) -> rejetee
PASS | C13 non-chaine (null) -> rejetee
PASS | C14 tabulation avant -> rejetee
PASS | C15 saut de ligne apres -> rejetee
PASS | C16 type inconnu -> pas de controle de prefixe, format seul
PASS | M1  5000.00 -> accepte
PASS | M2  12.345 -> rejete
PASS | M3  abc -> rejete
PASS | M4  5000 -> accepte
PASS | M5  5000.5 -> accepte
PASS | M6  0 -> rejete (doit etre > 0)
PASS | M7  -100 -> rejete
PASS | M8  chaine vide -> rejete
PASS | M9  12. -> rejete
PASS | M10 .50 -> rejete
PASS | M11 5000.00 (number) -> accepte
PASS | M12 null -> rejete
PASS | M13 Infinity -> rejete
==========================================================================
RESULTAT : 29 PASS / 0 FAIL  (total 29)
==========================================================================
```

**Les 7 tests exigés :**

| # | Cas | Attendu | Obtenu |
| --- | --- | --- | --- |
| 1 | `DEP-251121-A1B2C3D4` | accepté | ✅ accepté (`null`) |
| 2 | espace avant | rejeté | ✅ `Format de référence invalide` |
| 3 | espace après | rejeté | ✅ `Format de référence invalide` |
| 4 | minuscules | rejeté | ✅ `Format de référence invalide` |
| 5 | montant `5000.00` | accepté | ✅ `true` |
| 6 | montant `12.345` | rejeté | ✅ `false` |
| 7 | montant `abc` | rejeté | ✅ `false` |

Les 22 tests supplémentaires couvrent les non-régressions (préfixe/type, longueurs, tabulations, sauts de ligne, types non-chaîne, montant nul, négatif, `Infinity`).

## 1.4 §1D — Comparaison déployé / source : la méthode est non fiable

### Hashes

| Objet | SHA-256 |
| --- | --- |
| Source **avant** mes modifications (= commit `84a87ec`) | `f33dd5faed711f49aa54b4ee821036a4efe2ae8ba73c5fbf98306a1cf0a06418` |
| Source **après** mes modifications (fichier de travail) | `cf76ab7b0aa38ef3bac6ba4adcfbe8cd0b5bc3251d5e6ef4a0657aeeb0d97d04` |

Taille : 16 114 octets (avant) → 16 235 octets (après), soit **+121 octets** correspondant exactement aux 3 modifications et aux commentaires ajoutés.

### Hash du corps déployé : **impossible à calculer**

Le connecteur `get_edge_function` retourne le corps **à l'intérieur d'un document JSON**, lui-même affiché dans une enveloppe JSON. Il n'expose ni champ de hash, ni contenu brut téléchargeable. **Toute empreinte que je calculerais porterait sur une ré-encodage, pas sur le texte stocké** — elle serait fausse.

### Différences constatées entre déployé et source pré-modification

Sur les éléments contrôlables indépendamment de l'encodage (structure, présence/absence de motifs, libellés) : **aucune différence fonctionnelle**. En particulier :

- `trim()` **présent** dans `validateReference` déployé **et** dans la source pré-modification → cohérent.
- `REFERENCE_REGEX` déployé et source : même intention, même ancrage, même classe `[0-9A-F]`.
- Même CORS, même `verify_jwt: false`, même `Deno.serve(handler)`, mêmes routes.

### 🔴 RÉTRACTION DÉFINITIVE de ma conclusion du tour précédent

J'avais affirmé que les regex déployées étaient **doublement échappées** (`\\d` au lieu de `\d`) et que tout dépôt serait rejeté. **Cette affirmation était fausse. Je la retire sans réserve.**

Démonstration du piège dans lequel j'étais tombé :

```
Source réelle      : let p = pathname.replace(/\/+$/, "");
  backslashes réels : 1
Après JSON x1      : "let p = pathname.replace(/\\/+$/, \"\");"        → 4 backslashes affichés
Après JSON x2      : "\"let p = pathname.replace(/\\\\/+$/, \\\"\\\");\"" → 12 backslashes affichés
```

**Un seul backslash réel apparaît comme 4 dans ce que je reçois.** J'avais lu « 4 » et conclu « 2 backslashes réels ». C'est une erreur de méthode : **le comptage visuel de backslashes dans une réponse JSON est structurellement inexploitable**, quel que soit le soin apporté.

Vérification positive faite entre-temps : après décodage JSON (ce que fait le runtime Edge), la source du commit `84a87ec` donne

```
const REFERENCE_REGEX = /^(DEP|WDR)-\d{6}-[0-9A-F]{8}$/;
  → test sur DEP-251121-A1B2C3D4 : true
```

**La source est correcte. Le double-échappement n'a jamais existé.** Il n'y avait donc pas de second défaut à corriger dans cette fonction, et ma mise en garde du tour précédent sur « tous les dépôts rejetés en 400 » était infondée.

### Limites de la méthode de récupération

| Limite | Effet |
| --- | --- |
| Corps noyé dans une double enveloppe JSON | hash impossible ; comptage de caractères d'échappement non fiable |
| Aucun hash exposé par le connecteur | comparaison binaire impossible |
| Aucun accès au contenu stocké brut | on ne peut comparer que la **structure** |

**Conclusion §1D : indéterminé sur le plan binaire, concordant sur le plan structurel.** Le seul test décisif serait un `POST /api/transactions` authentifié — **non exécuté**, faute de JWT (voir §4).

---

# 2. FRONTEND — CORRECTIONS LOCALES

## 2.1 Fichiers inspectés

| Fichier | Ce que j'y cherchais |
| --- | --- |
| `client/src/hooks/useAuth.js` (183 l.) | source de `profile`, `.single()` |
| `client/src/pages/Register.jsx` (186 l.) | rendu de l'erreur |
| `client/src/pages/Login.jsx` (143 l.) | rendu de l'erreur + rate limiting |
| `client/src/App.jsx` (l. 32-60) | `ProtectedRoute` |
| `client/src/components/AuthGuard.jsx` (72 l.) | consommation de `profile` |
| `client/src/pages/Dashboard.jsx` | consommation de `profile` |
| `client/src/pages/AdminDashboard.jsx` | consommation de `profile` |
| `client/package.json` | scripts de build, absence de framework de test |
| `client/src/pages/TransactionDetail.jsx` | **interdit de modification** — vérifié intact |

## 2.2 Consommateurs de `profile` — audit complet

C'est le point que vous demandiez d'examiner **avant** de changer `.single()`.

| Consommateur | Usage | Risque si `profile === null` |
| --- | --- | --- |
| `App.jsx:32` `ProtectedRoute` | **n'utilise PAS `profile`** — s'appuie sur `user`, `isAdmin`, `isSuperAdmin`, `isAgent`, `isModerator`, `hasRole` (issus de `user_roles`) | ✅ **aucun** |
| `Dashboard.jsx:69` | `profile?.role \|\| 'user'` | ✅ **aucun** — optional chaining **et** repli explicite |
| `AdminDashboard.jsx:166` | `tx.profiles?.email` — objet **imbriqué** issu de la requête, pas le `profile` du hook | ✅ **aucun** |
| `AuthGuard.jsx:33-42` | `profile?.role` avec optional chaining | ✅ pas d'exception… **mais voir §5** |
| `useAuth.js:72` (interne) | `if (data) setProfile(data)` | à adapter (fait) |

**Aucun consommateur ne déréférence `profile` sans garde.** Aucun n'avait besoin d'être modifié.

**Point notable :** `AuthGuard.jsx` **n'est importé nulle part** dans le projet — vérifié par `grep -rn "AuthGuard" client/src`, qui ne renvoie que le fichier lui-même. C'est un composant mort. `ProtectedRoute` dans `App.jsx` fait le travail réel et repose sur `user_roles`. Je n'y ai **pas touché** (hors périmètre, et aucune régression possible puisqu'il n'est pas monté).

## 2.3 §2A — `authErrors.js` (nouveau fichier)

`client/src/utils/authErrors.js`

Exporte `messageErreurAuth(err, contexte)` et `MESSAGE_SERVICE_INDISPONIBLE`.

Ordre de résolution :

1. **Panne de service** (`name === 'AuthRetryableFetchError'` ou `status >= 500`) → message technique générique. C'est le cas exact de production.
2. **Code Supabase** stable (`invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `over_email_send_rate_limit`, `otp_expired`, …) → message adapté en français.
3. **Statut HTTP** hors 5xx (400, 401, 403, 422, 429) → message adapté.
4. **Message texte exploitable** → conservé, avec traduction des messages anglais connus de Supabase.
5. **Rien d'exploitable** (`{}`, `[]`, vide, `null`, `undefined`, `[object Object]`, `Failed to fetch`) → repli contextuel.

La fonction `estInaffichable()` garantit qu'aucune de ces valeurs ne peut atteindre l'écran.

### Tests — 22 cas, dont l'erreur de production exacte

Commande : `node client/src/utils/authErrors.test.mjs`

```
PASS | E1  erreur prod {message:"{}", status:500, name:AuthRetryableFetchError}
PASS | E2  message "{}" sans name ni status -> repli inscription
PASS | E3  message "[]" -> repli connexion
PASS | E4  message "   " (espaces seuls) -> repli
PASS | E5  message vide -> repli
PASS | E6  err null -> repli
PASS | E7  err undefined -> repli
PASS | E8  status 503 -> message service
PASS | E9  invalid_credentials (code)
PASS | E10 message anglais "Invalid login credentials" sans code
PASS | E11 email_not_confirmed (code)
PASS | E12 user_already_exists (code)
PASS | E13 weak_password (code)
PASS | E14 over_email_send_rate_limit (code)
PASS | E15 statut 429 sans code
PASS | E16 statut 400 sans code
PASS | E17 message francais custom conserve tel quel
PASS | E18 "[object Object]" -> repli (jamais affiche)
PASS | E19 "Failed to fetch" -> repli
PASS | E20 "null" (chaine) -> repli
PASS | E21 contexte par defaut = connexion
PASS | E22 invariant : jamais {} / [] / vide sur 15 entrees x 4 contextes
==========================================================================
RESULTAT : 22 PASS / 0 FAIL  (total 22)
==========================================================================
```

Le test E1 reproduit **l'objet d'erreur exact** signalé dans la console.

## 2.4 §2A — Application à `Register.jsx`

```diff
 import { useState } from 'react';
 import { useAuth } from '../hooks/useAuth';
+import { messageErreurAuth } from '../utils/authErrors';
 import PasswordToggle from '../components/PasswordToggle';
@@ -39,7 +40,7 @@ export default function Register() {
     try {
       const { data, error: err } = await signUp(email, password);
       if (err) {
-        setError(err.message || 'Une erreur est survenue lors de l\'inscription.');
+        setError(messageErreurAuth(err, 'inscription'));
       } else {
         setSuccess(true);
         setEmail('');
@@ -47,7 +48,7 @@ export default function Register() {
         setConfirmPassword('');
       }
     } catch (err) {
-      setError(err.message || 'Une erreur inattendue est survenue.');
+      setError(messageErreurAuth(err, 'inscription'));
     } finally {
       setLoading(false);
     }
```

## 2.5 §2A — Application à `Login.jsx`

```diff
 import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../lib/rateLimit';
+import { messageErreurAuth } from '../utils/authErrors';
 import PasswordToggle from '../components/PasswordToggle';
@@ -43,7 +44,7 @@ export default function Login() {
             typeof rec.remaining === 'number'
               ? ` Tentatives restantes : ${rec.remaining}.`
               : '';
-          setError((err.message || 'Une erreur est survenue lors de la connexion.') + suffix);
+          setError(messageErreurAuth(err, 'connexion') + suffix);
         }
       } else {
         // Connexion réussie : on remet le compteur à zéro
@@ -51,7 +52,7 @@ export default function Login() {
       }
     } catch (err) {
       await recordFailedAttempt(email, 'login');
-      setError(err.message || 'Une erreur inattendue est survenue.');
+      setError(messageErreurAuth(err, 'connexion'));
     } finally {
       setLoading(false);
     }
```

Le suffixe « Tentatives restantes : N. » du rate limiting est **préservé** — il reste concaténé au message traduit.

**Aucun comportement d'authentification n'est modifié** : seules les chaînes affichées changent. `signUp`, `signIn`, `recordFailedAttempt`, `resetRateLimit`, les redirections et la confirmation e-mail sont intacts.

## 2.6 §2B — `useAuth.js` : `.single()` → `.maybeSingle()`

```diff
   const fetchProfile = useCallback(async (userId) => {
     try {
+      // maybeSingle() : 0 ligne renvoie `data = null` sans erreur HTTP 406,
+      // contrairement a single() qui rejette la requete.
       const { data, error } = await supabase
         .from('profiles')
         .select('*')
         .eq('id', userId)
-        .single();
+        .maybeSingle();
 
-      if (error && error.code !== 'PGRST116') {
+      if (error) {
         console.error('[useAuth] Erreur récupération profil :', error.message);
       }
 
-      if (data) {
-        setProfile(data);
-      }
+      // `data` vaut null si le profil n'existe pas : on remet l'etat a null
+      // plutot que de conserver un profil appartenant a un autre utilisateur.
+      setProfile(data ?? null);
     } catch (err) {
       console.error('[useAuth] Exception récupération profil :', err.message);
     }
```

Deux changements de comportement, assumés :

1. **`PGRST116` n'existe plus** — `maybeSingle()` ne produit plus cette erreur. La garde devient inutile ; tout `error` restant est un vrai problème et mérite d'être journalisé.
2. **`setProfile(data ?? null)`** — l'ancien code ne mettait à jour l'état que si `data` était non nul, ce qui **conservait le profil précédent**. Si un utilisateur se déconnectait et qu'un autre se connectait sans profil, l'ancien profil restait affiché. Le nouveau code efface l'état. C'est plus sûr, mais c'est un changement réel — signalé en §5.

---

# 3. VÉRIFICATION (§2C)

## 3.1 Build complet

`node_modules` était absent au départ. J'ai lancé `npm install` (140 paquets), puis :

```
> jaspay-client@0.1.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 105 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.58 kB │ gzip:   0.36 kB
dist/assets/index-B0dJJhg1.css   39.54 kB │ gzip:   7.10 kB
dist/assets/index-DikBNsLn.js   531.19 kB │ gzip: 134.97 kB

(!) Some chunks are larger than 500 kB after minification. ...
✓ built in 3.01s
```

**105 modules** contre **104** au build précédent : **+1 = `authErrors.js`**. Les trois pages modifiées compilent sans erreur d'import.

Le CSS est **identique** (39.54 kB) → aucun changement visuel, conformément à la consigne.

## 3.2 Autres vérifications

| Vérification | Résultat |
| --- | --- |
| `node --check jaspay-transactions/index.js` | ✅ SYNTAXE OK |
| `.single()` restants dans `client/src` | **1 seulement** : `TransactionDetail.jsx:54` — **interdit de modification, laissé tel quel** |
| `.maybeSingle()` | `useAuth.js:68` |
| `PGRST116` restant | aucun (normal) |
| `git diff TransactionDetail.jsx` | **vide** → non modifié ✅ |
| Fichiers de style / `tailwind.config.js` | **aucun changement** ✅ |
| `client/src/utils/` | nouveau dossier, non suivi par git |

Le build ne signale **aucune erreur d'import ni de compilation**. L'avertissement sur la taille des chunks est **antérieur** à mes modifications et sans rapport.

## 3.3 Tests — ce qui existe réellement

⚠️ **Le projet ne dispose d'aucun framework de test.** `client/package.json` n'a ni `test`, ni `jest`, ni `vitest`. Il n'existe **aucun test unitaire préexistant** à exécuter.

Les deux bancs que je fournis sont des scripts Node autonomes que j'ai écrits dans ce cadre : `test-transactions-fixes.mjs` (29 cas) et `authErrors.test.mjs` (22 cas). Ils ne remplacent pas une suite de tests de projet — il n'y en a pas.

---

# 4. TESTS NON EXÉCUTÉS ET LEURS RAISONS

| Test | Raison |
| --- | --- |
| `POST /api/transactions` réel sur la fonction déployée | ⛔ Aucun JWT : les identifiants des comptes A/B ne m'ont jamais été transmis. Et un appel d'écriture contredirait la phase de préparation. |
| Validation de la fonction **après** déploiement | ⛔ Déploiement interdit à ce stade. |
| Test des 403 de `jaspay-admin-surveillance` | ⛔ Nécessite un JWT valide. |
| Rendus React de `Register`/`Login`/`useAuth` | ⛔ Aucun environnement de test React installé (`@testing-library`, `jsdom` absents). |
| Vérification visuelle en navigateur | ⛔ Aucun serveur lancé ; et le préview n'aurait pas accès à Supabase. |
| `npm audit fix` | ⛔ 4 vulnérabilités signalées par `npm install` (3 modérées, 1 haute) — **hors périmètre**, non touchées. À examiner séparément. |

**Distinction explicite :** les 51 tests (29 + 22) portent sur la **logique pure** (validation de références, validation décimale, traduction d'erreurs). Ils ne prouvent **rien** sur le comportement bout-en-bout de l'authentification ni sur la fonction déployée.

---

# 5. RÉGRESSIONS ET RISQUES IDENTIFIÉS

## 5.1 Changements de comportement assumés

| # | Changement | Nature | Évaluation |
| --- | --- | --- | --- |
| R1 | `setProfile(data ?? null)` au lieu de ne rien faire si `data` est nul | **Comportement** | Plus sûr (efface un profil obsolète), mais réel. À valider par vous. |
| R2 | Suppression de la garde `error.code !== 'PGRST116'` | Comportement | Sans effet : `maybeSingle()` ne produit plus ce code. |
| R3 | Les références entourées d'espaces sont désormais **rejetées** | **Métier** | C'est l'effet demandé. ⚠️ **Si le frontend envoie aujourd'hui des références avec espace, les dépôts échoueront en 400.** Vérifié : la référence est générée côté serveur (`prefix + '-' + date + '-' + randomPart`) et renvoyée sans espace, puis retransmise telle quelle. **Pas de risque identifié**, mais c'est le premier point à surveiller. |
| R4 | Messages d'erreur plus précis | Affichage | Aucun risque fonctionnel. |

## 5.2 Risques identifiés, NON corrigés (hors périmètre)

### 🔴 R5 — `AuthGuard.jsx` lit un champ qui n'existe plus

```js
// AuthGuard.jsx:33-42
hasRole = profile?.role === 'super_admin';
```

Or `useAuth.js` documente explicitement :

> « Le champ `role` a été supprimé de `profiles` (migration 002). »

**Ce composant ne pourrait donc jamais accorder l'accès**, quelle que soit la valeur de `requiredRole`. Il n'y a pas de faille (il refuse tout), mais il est faux.

**Atténuation majeure : il n'est importé nulle part.** C'est du code mort. `ProtectedRoute` dans `App.jsx` remplit ce rôle correctement via `user_roles`.

**Recommandation :** supprimer `AuthGuard.jsx` plutôt que le corriger, dans un lot ultérieur. **Je n'y ai pas touché.**

### 🟠 R6 — `Dashboard.jsx:69` affiche toujours le libellé « user »

```js
}[profile?.role || 'user'];
```

Même cause que R5 : `profile.role` n'existe pas, donc le repli s'applique systématiquement. Un administrateur verra un libellé « user » sur son tableau de bord. **Purement cosmétique, préexistant, non modifié** (aucun changement de design autorisé).

### 🟠 R7 — `useAuth()` instancié plusieurs fois

`ProtectedRoute` (dans `App.jsx`) et chaque page appellent `useAuth()` indépendamment. Chaque instance refait ses propres requêtes `profiles` et `user_roles`. Avec `maybeSingle()` appliqué partout, cela signifie **plusieurs lectures par navigation** — sans erreur, mais avec un coût réseau inutile. **Préexistant, non modifié.**

### ⚪ R8 — `Profile` peut être nul sans que rien ne le signale à l'utilisateur

Si `profiles` ne contient pas de ligne pour un utilisateur connecté, `profile` vaut désormais `null` silencieusement. Aucun consommateur actuel ne casse (§2.2), mais un futur composant pourrait supposer un profil non nul. **À garder en tête.**

## 5.3 Ce qui n'a pas été touché, conformément aux consignes

`TransactionDetail.jsx` (`.single()` l.54 laissé en place), `AuthGuard.jsx`, `Dashboard.jsx`, `AdminDashboard.jsx`, les pages admin, les styles, `tailwind.config.js`, les fonctions `jaspay-agent` / `jaspay-admin-config` / `jaspay-admin-users`, Auth, SMTP, RLS, migrations, secrets.

---

# 6. ÉTAT DU DÉPÔT GIT

## Avant

```
HEAD : 84a87ec fix(edge,migration): reparer 3 Edge Functions et fermer la faille RLS
origin/main...HEAD : 0  0   (à jour)
Fichiers modifiés : aucun
Non suivis : 7 rapports + _backup/ + _proposed/
```

## Après

```
HEAD : 84a87ec  ← INCHANGÉ
origin/main...HEAD : 0  0   ← INCHANGÉ

 M client/src/hooks/useAuth.js                      | 12 +++++++-----
 M client/src/pages/Login.jsx                       |  5 +++--
 M client/src/pages/Register.jsx                    |  5 +++--
 M supabase/functions/jaspay-transactions/index.js  | 12 +++++++-----
 4 files changed, 20 insertions(+), 14 deletions(-)

?? client/src/utils/            ← nouveau (authErrors.js + test)
?? supabase/functions/_proposed/ ← bancs de test
?? supabase/functions/_backup/
?? RAPPORT_*.md (7 fichiers)
```

**Aucun commit créé. Aucun push. `HEAD` et `origin/main` sont identiques à l'état initial.**

---

# 7. COMMANDES EXACTES POUR DÉPLOYER (NON EXÉCUTÉES)

⚠️ **À n'exécuter qu'après votre autorisation explicite.**

## 7.1 Déployer uniquement `jaspay-transactions`

**Voie connecteur** (celle que j'utiliserais — la CLI Supabase est absente et `supabase login/link/deploy` m'est interdit) :

1. Sérialiser le corps du fichier dans un JSON :
```bash
cd /home/user/JASpay && \
python3 -c "import json;print(json.dumps({'function_slug':'jaspay-transactions','project_ref':'gdnluwetyoejfqaeoioa','name':None,'verify_jwt':False,'body':open('supabase/functions/jaspay-transactions/index.js').read()}))" > /tmp/tx_deploy.json
```
2. Appeler `update_edge_function` avec ce corps.

**Paramètres à conserver impérativement :**

| Paramètre | Valeur à conserver |
| --- | --- |
| `function_slug` | `jaspay-transactions` |
| `project_ref` | `gdnluwetyoejfqaeoioa` |
| `verify_jwt` | **`false`** ← valeur réelle actuelle, **ne pas modifier** (la fonction vérifie le JWT elle-même via `/auth/v1/user`) |
| `name` | `null` (inchangé) |

Rappel : le corps doit commencer par `//`, jamais par `/**` — c'est le cas.

## 7.2 Pousser les modifications frontend

```bash
cd /home/user/JASpay

git add client/src/utils/authErrors.js \
        client/src/utils/authErrors.test.mjs \
        client/src/hooks/useAuth.js \
        client/src/pages/Login.jsx \
        client/src/pages/Register.jsx \
        supabase/functions/jaspay-transactions/index.js

git commit -m "fix(auth,transactions): messages d'erreur lisibles, maybeSingle, validation des references

- client/src/utils/authErrors.js : ne plus jamais afficher '{}' / '[]' / vide
- Register.jsx, Login.jsx : erreurs Auth traduites (5xx et AuthRetryableFetchError)
- useAuth.js : .single() -> .maybeSingle() sur profiles (fin des 406)
- jaspay-transactions : validateReference sans trim(), regex sans \\d ni \\.
- Tests locaux : 29/29 (transactions) + 22/22 (erreurs auth)"

git push origin main
```

**Note Windows :** votre PowerShell n'accepte pas `&&`. Utilisez une ligne par commande, ou `;`.

## 7.3 Après déploiement — vérifications à faire

```bash
# La fonction répond toujours (OPTIONS 204)
curl -i -X OPTIONS "https://gdnluwetyoejfqaeoioa.supabase.co/functions/v1/jaspay-transactions" \
  -H "Origin: https://jaspay.vercel.app"

# Authentification toujours exigée (401 sans jeton)
curl -i "https://gdnluwetyoejfqaeoioa.supabase.co/functions/v1/jaspay-transactions/api/transactions"
```

Puis, **avec un JWT réel**, un `POST /api/transactions` :
- référence avec espace → attendu **400** `Format de référence invalide`
- référence valide → attendu **201**

---

# 8. ARRÊT

Conformément à la consigne §4 :

- ❌ Rien déployé
- ❌ Aucun commit poussé
- ❌ Aucune migration appliquée
- ❌ Aucun secret modifié
- ❌ Auth, SMTP, RLS : non touchés

Les quatre fichiers modifiés sont en attente dans le répertoire de travail.

**Deux points requièrent votre décision avant toute action distante :**

1. **R1** — le passage à `setProfile(data ?? null)` change un comportement au-delà du seul remplacement de `.single()`. Vous acceptez, ou je reviens à `if (data) setProfile(data);` ?
2. **R5** — `AuthGuard.jsx` est faux mais mort. Je le laisse tel quel (recommandé), ou vous voulez le traiter maintenant ?

J'attends votre autorisation explicite.
