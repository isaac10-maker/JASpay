# JASpay — DÉPLOIEMENT `jaspay-transactions` v3

**Date :** 16 novembre 2026
**Statut :** ✅ Déployé — **aucune migration appliquée** (volontairement)

---

## 1. CE QUI A ÉTÉ DÉPLOYÉ

| Élément | Valeur |
| --- | --- |
| Fonction | `jaspay-transactions` |
| Version | **2 → 3** |
| État | **ACTIVE** |
| `verify_jwt` | **`false`** — conservé à l'identique |
| ID | `dee0145a-2b19-4f25-bc38-40a02a6fc1f2` |
| `updated_at` | 1795624367443 |

**Une seule fonction déployée.** `jaspay-rate-limit`, `jaspay-config` et `jaspay-admin-surveillance` n'ont pas été touchées. `jaspay-agent`, `jaspay-admin-config` et `jaspay-admin-users` restent en 503, non déployées — conformément à l'interdiction maintenue.

## 2. CORPS STOCKÉ VÉRIFIÉ (relecture après déploiement)

Extrait du corps **réellement stocké** par `get_edge_function`, version 3 :

```js
const REFERENCE_REGEX = /^(DEP|WDR)-[0-9]{6}-[0-9A-F]{8}$/;
```

```js
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

```js
const decimalRegex = /^[0-9]+([.][0-9]{1,2})?$/;
```

**Trois confirmations, sans ambiguïté cette fois :**

1. `trim()` **absent** de `validateReference` — `reference` est testée brute.
2. Les deux regex contiennent **zéro backslash**. C'est décisif : le doute d'encodage qui m'avait fait produire une conclusion fausse au tour 2 **ne peut pas s'appliquer ici**, puisqu'il n'y a plus aucun backslash à mal compter.
3. `[0-9]` et `[.]` remplacent bien `\d` et `\.`.

## 3. TESTS DE PRODUCTION EXÉCUTÉS

| # | Test | Attendu | Obtenu |
| --- | --- | --- | --- |
| 1 | `OPTIONS` origine `jaspay.vercel.app` | 204 | ✅ **204** |
| 2 | `OPTIONS` origine `evil.com` | 204 **sans** `allow-origin` | ✅ 204, aucun en-tête `Access-Control-Allow-Origin` |
| 3 | `GET /api/transactions` sans jeton | 401 | ✅ `{"error":"Token d'authentification manquant"}` |
| 4 | `GET` jeton invalide | 401 | ✅ `{"error":"Token invalide ou expiré"}` |
| 5 | `POST /reference` sans jeton | 401 | ✅ `{"error":"Token d'authentification manquant"}` |

**Interprétation :** la fonction démarre correctement (204 = pas de `BOOT_ERROR`), l'authentification s'exécute **avant** toute logique métier, et le CORS reste restreint à l'origine légitime.

## 4. ÉTAT DES 7 FONCTIONS APRÈS DÉPLOIEMENT

```
jaspay-rate-limit          -> 204
jaspay-config              -> 204
jaspay-transactions        -> 204   ← v3, déployée ce jour
jaspay-admin-surveillance  -> 204
jaspay-agent               -> 503   (gel, non touchée)
jaspay-admin-config        -> 503   (gel, non touchée)
jaspay-admin-users         -> 503   (gel, non touchée)
```

---

## 5. MIGRATIONS — RIEN N'A ÉTÉ APPLIQUÉ, ET VOICI POURQUOI

Vous avez écrit « la migration etc ». **Je n'ai appliqué aucune migration**, et je dois vous expliquer précisément pourquoi plutôt que d'exécuter quelque chose à l'aveugle.

### 5.1 La base est déjà dans l'état attendu — vérifié à l'instant

```json
{"policies INSERT sur transactions": 0}
{"grants anon sur transactions": "AUCUN"}
{"grants authenticated sur transactions": "REFERENCES,SELECT,TRIGGER"}
{"grants service_role sur transactions": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"}
```

La **migration 006** (fermeture de la faille RLS sur `transactions`) est **déjà effective** : aucune policy `INSERT`, `anon` sans aucun privilège, `authenticated` en lecture seule, `service_role` intact.

**Rejouer `006_fix_transactions_insert_policy.sql` serait au mieux sans effet, au pire une tentative de `DROP POLICY` sur une policy inexistante.** Aucun gain, un risque inutile.

### 5.2 Les autres migrations ne sont pas réapplicables

| Migration | Réappliquable ? | Pourquoi |
| --- | --- | --- |
| `001_initial_schema` | ❌ | `CREATE TABLE` — les tables existent |
| `001_test_rls_policies` | ❌ | policies déjà présentes |
| `002_security_hardening` | ⚠️ **surtout pas** | Contient le `REVOKE ALL … FROM PUBLIC` sur `handle_new_user` (l. 85-87), cause probable du blocage d'inscription. La rejouer réappliquerait le défaut. |
| `003_transactions` | ❌ | `CREATE TABLE` |
| `004_administration` | ❌ | idem |
| `005_session_revocation` | ❌ | idem |
| `006_fix_transactions_insert_policy` | ❌ | **déjà effective** (§5.1) |

### 5.3 🔴 Anomalie à signaler : la base et les fichiers de migration ont divergé

`list_migrations` ne retourne **qu'une seule entrée** :

```json
[{"version": "20261121205701", "name": "create_rate_limit_attempts"}]
```

Or le dépôt contient sept fichiers `001` à `006`, et les tables, policies, triggers et fonctions correspondants **existent réellement en base** (je les ai interrogés à chaque tour).

**Explication :** ces objets ont été créés par des exécutions SQL directes via le connecteur, pas par le système de migrations. L'historique `supabase_migrations` ne les connaît donc pas.

**Conséquence concrète :** le dépôt et la base ne sont pas reproductibles l'un depuis l'autre. Un `supabase db push` (ou toute application automatique) **rejouerait tout depuis zéro** et échouerait — ou pire, réappliquerait le `REVOKE` de `002` sur `handle_new_user`.

**C'est un sujet à traiter, mais pas maintenant et pas à l'aveugle.** Il faudrait d'abord établir un inventaire comparatif complet dépôt ↔ base, puis décider : soit marquer les migrations comme déjà appliquées dans l'historique, soit reconstruire un état de référence. **Je n'ai rien fait de tel.**

---

## 6. FRONTEND — DÉPLOIEMENT AUTOMATIQUE PROBABLE

Le commit `4433887` est sur `main` (poussé au tour précédent). Si votre projet Vercel est branché sur `main`, il a été redéployé et les changements suivants sont **déjà en ligne** :

- messages d'erreur lisibles (fin du `"{}"`) sur `/register` et `/login` ;
- fin des 406 sur la lecture de `profiles` (`maybeSingle`) ;
- aucun changement visuel (CSS identique).

**Je n'ai pas vérifié Vercel** — je n'ai aucun accès à ce tableau de bord. **À contrôler de votre côté.**

---

## 7. CE QUI N'A PAS ÉTÉ FAIT — ET POURQUOI

| Élément | État | Raison |
| --- | --- | --- |
| Migration | ❌ **aucune** | Déjà effective (§5.1) ; les autres ne sont pas réappliquables (§5.2) |
| `GRANT` sur `handle_new_user` | ❌ **aucun** | Vous avez explicitement dit de ne pas l'appliquer, et vos objections techniques restent valables |
| `jaspay-agent`, `admin-config`, `admin-users` | ❌ non déployées | Interdiction toujours en vigueur |
| Secret / SMTP / paramètre Auth | ❌ aucun | Hors périmètre |
| Design | ❌ aucun | Hors périmètre |

---

## 8. TESTS NON EXÉCUTÉS

| Test | Raison |
| --- | --- |
| `POST /api/transactions` réel (201 attendu) | ⛔ **Aucun JWT.** Les identifiants des comptes A et B ne m'ont jamais été transmis. C'est le seul test qui validerait vraiment la correction `trim()`/regex bout-en-bout. |
| Référence avec espace rejetée en 400 sur la prod | ⛔ Même raison — la validation s'exécute **après** l'authentification. |
| `GET /api/transactions` avec JWT valide (200 attendu) | ⛔ Même raison. |
| Vérification du déploiement Vercel | ⛔ Aucun accès au tableau de bord Vercel. |

⚠️ **Soyez lucide sur ce point :** j'ai déployé, la fonction démarre et refuse correctement les appels non authentifiés, le corps stocké est conforme. Mais **la correction métier n'a pas été prouvée en production** — elle l'est seulement par les 29 tests locaux sur le code extrait du fichier. Le premier `POST` réel reste la validation décisive.

---

## 9. ÉTAT GIT

```
HEAD : 4433887  (= origin/main, poussé au tour précédent)
Aucune modification depuis.
```

Rien n'a été committé ni poussé pendant ce tour : le déploiement Edge est une opération distante sur Supabase, indépendante du dépôt Git.

---

## 10. PROCHAINES ÉTAPES RECOMMANDÉES

1. **Vérifier Vercel** — le frontend corrigé est-il en ligne ?
2. **Fournir un JWT réel** (ou m'autoriser à créer un compte de test) pour exécuter le `POST /api/transactions` décisif.
3. **Décider du sort de l'inscription** — le `GRANT` sur `handle_new_user` reste la cause probable n° 1, non appliquée sur votre instruction.
4. **Traiter la dérive migrations ↔ base** (§5.3) dans un lot dédié, après inventaire.

---

## ⏸ ARRÊT

Déploiement terminé. Aucune migration, aucun GRANT, aucun secret, aucun design, aucune fonction gelée touchée.
