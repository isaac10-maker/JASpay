# JASpay — A0, A1, A2, A3, B et C

**Date :** 21 novembre 2026
**Statut :** ⛔ **ARRÊT — A1 non réalisable, B non atteinte**

---

## 0. DÉCLARATION DE NON-ACTION

| Action | Exécutée ? |
| --- | --- |
| Migration corrective | ❌ **AUCUNE** |
| `DROP POLICY` / `REVOKE` | ❌ Aucun |
| Insertion / modification / suppression de données | ❌ Aucune |
| Déploiement `jaspay-config` | ❌ Aucun |
| Déploiement toute autre fonction | ❌ Aucun |
| Push GitHub | ❌ Aucun |
| Secrets / SMTP / Vercel / design | ❌ Aucune |
| D5 / D6 / D7 | ❌ Aucun |

**La faille RLS est toujours ouverte.** État de production inchangé.

**Toutes les requêtes SQL exécutées sont des `SELECT`.** Aucune écriture.

---

## 1. A0 — RECHERCHE D'EXPLOITATION ANTÉRIEURE

### Résultat : AUCUNE EXPLOITATION DÉTECTÉE

Sortie brute :

```json
{
  "total_transactions": 0,
  "total_evenements": 0,
  "sans_evenement_creation": 0,
  "non_pending_sans_aucun_evenement": 0,
  "evenements_orphelins": 0
}
```

**Les deux tables sont vides.** Il n'y a ni transaction, ni événement, donc aucune référence à rapporter.

### Interprétation

| Hypothèse | Verdict |
| --- | --- |
| Faille exploitée avant aujourd'hui | **Aucune trace** — mais tables vides, donc indétectable par ce seul angle |
| Faille impossible à exploiter | **Faux** — la policy INSERT permissive et les GRANT existent |
| Absence de données = absence de risque | **À nuancer** voir ci-dessous |

**Limite de cette analyse, que je dois signaler :** les tables étant vides, l'absence d'anomalie **ne prouve pas** l'absence d'exploitation. Une ligne injectée puis supprimée ne laisserait aucune trace, et `transaction_events` n'a jamais contenu d'entrée. La seule conclusion solide est : **il n'existe aujourd'hui aucune transaction suspecte en base**, parce qu'il n'existe aucune transaction du tout.

Cela signifie aussi que la faille n'a causé **aucun dommage matériel constaté**, et que la migration corrective ne détruira aucune donnée existante.

---

## 2. ⛔ A1 — TEST ROUGE : NON RÉALISABLE

### Blocage

Vous avez écrit :

> « A : [email] / [mot de passe]    B : [email] / [mot de passe] »

**Les identifiants sont restés sous forme de placeholders.** Aucun email, aucun mot de passe n'a été transmis.

Je ne peux donc pas obtenir de JWT pour le compte A, ce qui est indispensable pour :

- un `INSERT` PostgREST en rôle `authenticated` (test rouge) ;
- un `UPDATE` puis un `DELETE` de la ligne créée ;
- le `SELECT` des transactions du compte A après migration (test A3).

**Je n'ai rien tenté.** Aucun `INSERT`, même voué à l'échec, n'a été envoyé : sans JWT valide, la requête serait rejetée pour absence de token et **ne testerait pas la policy RLS** — le test serait un faux négatif sans valeur.

### Ce que je n'ai pas fait, et pourquoi

| Tentative possible | Raison de ne pas l'avoir faite |
| --- | --- |
| Créer moi-même le compte A | Vous avez dit « créés par moi ». Une inscription serait une écriture, non autorisée. |
| Utiliser la clé `anon` sans JWT | Testerait le rôle `anon`, pas `authenticated`. Ne prouve rien sur la policy INSERT. |
| Utiliser `service_role` pour simuler | `service_role` est `BYPASSRLS` : contourne précisément ce qu'on veut tester. Sans valeur. |

---

## 3. A2 — VÉRIFICATIONS PRÉPARATOIRES : RÉALISÉES

### 3.1 Grep des écritures avec jeton utilisateur

**`client/src` — écritures dans `transactions` / `transaction_events` :**

```
$ grep -rn "insert\|update(\|upsert\|delete()" client/src/ | grep -i transaction
  ✅ AUCUNE écriture transaction côté client
```

**`server/src` — 5 écritures, toutes en `service_role` :**

| Ligne | Opération | Client utilisé |
| --- | --- | --- |
| `index.js:330` | `.insert(` sur `transactions` | `supabaseAdmin` (l.328) ✅ |
| `index.js:352` | `.insert(` sur `transaction_events` | `supabaseAdmin` (l.350) ✅ |
| `index.js:475` | `.update(` sur `transactions` | `supabaseAdmin` (l.473) ✅ |
| `index.js:488` | `.insert(` sur `transaction_events` | `supabaseAdmin` (l.486) ✅ |
| `index.js:524` | `.update(` sur `transactions` | `supabaseAdmin` (l.522) ✅ |

**Confirmation du backend Express :**

```js
// server/src/index.js:40
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// server/src/index.js:47-48
// Client avec clé service_role (privilèges élevés, NE JAMAIS exposer au frontend)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
```

Vérification de l'absence de client non-admin :
```
$ grep -n "^const supabase \|supabase\.from" server/src/index.js server/src/admin.js
  ✅ aucun client non-admin : tout passe par supabaseAdmin
```

**Conclusion : le backend Express n'écrit jamais avec un jeton utilisateur. Il utilise exclusivement `service_role`, qui est `BYPASSRLS`. La migration D4 ne l'affectera pas.**

### 3.2 Contraintes FK relevées (utiles au test A1)

```
transactions_bookmaker_id_fkey        → bookmakers(id)
transactions_payment_provider_id_fkey → payment_providers(id)
```

Ces FK sont **dans le schéma `public`**. À noter pour le test rouge : une valeur bidon aurait été rejetée par la FK, pas par RLS — il faudra donc de vrais UUID lus par `SELECT`, comme vous l'aviez prévu.

### 3.3 Sauvegarde de retour arrière — ÉCRITE

Fichier : `supabase/functions/_backup/ROLLBACK_AVANT_MIGRATION_v2.sql`

Contenu : snapshot des 6 policies (SELECT/INSERT/UPDATE/DELETE sur `transactions`, SELECT/ALL sur `transaction_events`) avec leur `qual` et `with_check` exacts, snapshot des 6 lignes de GRANT, et le script de restauration commenté.

### 3.4 Fichier v2 validé — renommé

```
_proposed/MIGRATION_CORRECTIVE_PROPOSEE.sql.OBSOLETE
_proposed/MIGRATION_CORRECTIVE_v2.sql
```

### 3.5 Contenu exact de `MIGRATION_CORRECTIVE_v2.sql` (demandé §1 de votre message)

**Instructions actives, intégralement :**

```sql
BEGIN;

DROP POLICY IF EXISTS "Utilisateur crée ses propres transactions"
  ON public.transactions;

REVOKE ALL ON TABLE public.transactions FROM anon;
REVOKE ALL ON TABLE public.transaction_events FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.transactions FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.transaction_events FROM authenticated;

COMMIT;
```

**Cinq instructions actives, un seul `BEGIN`/`COMMIT`. Rien d'autre.**

Tout le reste du fichier est en commentaire `--` : en-tête explicatif, deux réserves techniques (TRIGGER/REFERENCES non révoqués ; effet nul sur les séquences), l'avertissement R3 sur les requêtes embarquées, et le script de retour arrière.

### 3.6 Réserve R3 à reconduire au test A3

`Transactions.jsx:50` et `TransactionDetail.jsx:51` lisent les événements via un embed imbriqué, exécuté sous `authenticated`. D4 conserve `SELECT`, donc l'embed devrait fonctionner. **Ce point devra être vérifié explicitement en A3**, pas seulement le `SELECT` simple que vous avez listé.

---

## 4. ⛔ A3 — NON ATTEINTE

Dépend de A1 et A2. A2 est prêt, A1 est bloqué. Donc A3 n'est pas exécutable : sans test rouge préalable, un test vert serait ininterprétable — on ne saurait pas si la migration a changé quelque chose.

---

## 5. ⛔ B — NON ATTEINTE

Votre consigne : « Si un test échoue : STOP, rapport, pas de B. »

A1 n'a pas échoué — il n'a pas pu être exécuté. Dans le doute, je m'arrête. `jaspay-config` **n'a pas été déployée**.

Les relevés préparatoires restent valables :

| Élément | Valeur relevée |
| --- | --- |
| `verify_jwt` de `jaspay-config` | **`false`** (relevé, non présumé) |
| Corps v1 | 59 l., commence par ` * JASpay`, `/**` tronqué, import CDN, pas de `Deno.serve` |
| Corps v1 — `service_role` | jamais utilisé |
| Fichier à déployer | commence par `// JASpay` ✅ (pas de `/**`) |

---

## 6. C — PRÉPARATION RÉALISÉE (aucun déploiement, aucun push)

### 6.1 Diff §6.6 intégré dans `_proposed/jaspay-transactions/index.js`

```diff
@@ -146,6 +146,27 @@
   return Number(String(value).trim()).toFixed(2);
 }
 
+// --- Validation stricte du format de reference ---
+// Format impose : PREFIXE-YYMMDD-8HEX   ex. DEP-251121-A1B2C3D4
+const REFERENCE_REGEX = /^(DEP|WDR)-\d{6}-[0-9A-F]{8}$/;
+const REFERENCE_PREFIX_BY_TYPE = { deposit: 'DEP', withdrawal: 'WDR' };
+
+// Retourne null si la reference est valide, sinon un message d'erreur.
+function validateReference(reference, transactionType) {
+  if (typeof reference !== 'string') {
+    return 'Référence de transaction invalide';
+  }
+  const trimmed = reference.trim();
+  if (!REFERENCE_REGEX.test(trimmed)) {
+    return 'Format de référence invalide';
+  }
+  const expected = REFERENCE_PREFIX_BY_TYPE[transactionType];
+  if (expected && !trimmed.startsWith(expected + '-')) {
+    return 'Référence incompatible avec le type de transaction';
+  }
+  return null;
+}
+
 async function handler(req) {
@@ -310,6 +331,12 @@
         return jsonResponse({ error: 'Type de transaction invalide' }, 400, cors);
       }
 
+      // 2bis. Validation stricte du format de reference
+      const referenceError = validateReference(transaction_reference, transaction_type);
+      if (referenceError) {
+        return jsonResponse({ error: referenceError }, 400, cors);
+      }
+
       // 3. Validation decimale stricte du montant
       if (!isValidDecimal(amount)) {
```

`node --check` : ✅ syntaxe valide.

### 6.2 Tests locaux — nouveaux cas référence

**9 nouveaux cas ajoutés**, dont les 3 que vous avez demandés :

```
✅ référence vide → 400
✅ référence sans format → 400
✅ référence date trop courte → 400        (DEP-2511-A1B2C3D4)
✅ référence hex trop court → 400           (DEP-251121-A1B2C3D)
✅ référence hex minuscule → 400            (DEP-251121-a1b2c3d4)
✅ préfixe inconnu → 400                    (XYZ-251121-A1B2C3D4)
✅ préfixe WDR sur deposit → 400            ← cohérence préfixe/type
✅ préfixe DEP sur withdrawal → 400         ← cohérence préfixe/type
✅ référence serveur valide acceptée → 201
```

**Bilan global du banc d'essai : `60 réussis / 0 échoués`** (51 avant, +9).

> ⚠️ Il s'agit d'une **simulation sous Node avec PostgREST simulé**. Aucun test de production.

---

## 7. §3 — CORRECTION DU BUG `Deposit.jsx` / `Withdraw.jsx` (préparation seule)

### 7.1 Diff appliqué

```diff
+  // Retourne la reference generee, ou null en cas d'echec.
+  // Le setForm met a jour l'affichage, mais l'appelant doit utiliser la
+  // valeur de retour : setForm est asynchrone et la variable `form`
+  // n'est pas rafraichie dans la fermeture de handleSubmit en cours.
   const generateReference = async (transactionType) => {
     try {
       ...
       if (error) throw error;
-      setForm((prev) => ({ ...prev, transaction_reference: data.transaction_reference }));
+      const reference = data && data.transaction_reference;
+      if (!reference) {
+        setError('Référence de transaction indisponible.');
+        return null;
+      }
+      setForm((prev) => ({ ...prev, transaction_reference: reference }));
+      return reference;
     } catch (err) {
       setError(err.message || 'Erreur lors de la génération de la référence.');
+      return null;
     }
   };
```

```diff
-      if (!form.transaction_reference) {
-        await generateReference('deposit');
+      let reference = form.transaction_reference;
+      if (!reference) {
+        reference = await generateReference('deposit');
+      }
+
+      // Arret sans POST si la reference n'a pas pu etre obtenue.
+      if (!reference) {
+        setError(
+          "Impossible d'obtenir une référence de transaction. Veuillez réessayer."
+        );
+        setLoading(false);
+        return;
       }
 
       const { data: txData, error: txError } = await invokeEdge(
         ...
         {
-          transaction_reference: form.transaction_reference,
+          transaction_reference: reference,
```

Appliqué **à l'identique** dans `Deposit.jsx` et `Withdraw.jsx`.

**Aucun changement de design.** Aucun JSX modifié. Seuls trois points de logique changent : valeur de retour, garde avant POST, valeur envoyée.

**Build :** ✅ `vite build` — 104 modules, 3.11 s.

### 7.2 Recherche du même motif ailleurs — RÉSULTATS

Méthode : détection des fonctions contenant à la fois un `setForm(` et une lecture de `form.` dans la même portée.

| Fichier | Fonction | Verdict |
| --- | --- | --- |
| `Deposit.jsx` | `handleSubmit` | 🐛 **confirmé** — corrigé |
| `Withdraw.jsx` | `handleSubmit` | 🐛 **confirmé** — corrigé |
| `AdminAnnouncements.jsx` | `handleSubmit` (l.78) | ✅ **sain** — le `setForm` est dans `resetForm()`, appelé **après** l'envoi (l.107). Les lectures `form.*` (l.84-89) précèdent tout `setForm`. |
| `AdminAnnouncements.jsx` | `handleArchive` (l.149) | ✅ **sain** — `setForm` (l.119) est dans un gestionnaire d'édition, distinct de l'archivage. Détection fausse positive. |
| `Withdraw.jsx` | `goToStep` (l.232) | ✅ **sain** — `setForm` dans les `onChange` du JSX, lectures dans `goToStep`. Aucun enchaînement écriture→lecture. |

**Aucun autre cas du motif trouvé.** Le bug est isolé à `Deposit.jsx` et `Withdraw.jsx`.

**Signalé sans correction, comme demandé.**

---

## 8. RÉCAPITULATIF DES TESTS

### 8.1 Tests RÉELLEMENT exécutés

| Test | Résultat |
| --- | --- |
| A0 — recherche d'exploitation | ✅ 0 transaction, 0 événement |
| A2 — grep écritures `client/src` | ✅ aucune |
| A2 — grep écritures `server/src` | ✅ 5, toutes `service_role` |
| A2 — confirmation `supabaseAdmin` | ✅ aucun client non-admin |
| A2 — relevé FK `transactions` | ✅ 2 FK en `public` |
| A2 — sauvegarde retour arrière | ✅ fichier écrit |
| A2 — renommage `.OBSOLETE` | ✅ |
| C — `node --check` du diff | ✅ |
| C — 60 tests locaux | ✅ 60/60 |
| §3 — build Vite après correctif | ✅ 104 modules, 3.11 s |
| §3 — recherche du motif ailleurs | ✅ 0 autre occurrence |

### 8.2 Tests PRÉVUS mais NON exécutés

| Test | Raison |
| --- | --- |
| **A1 — INSERT direct `status:'completed'`** | ⛔ **Identifiants non fournis** |
| A1 — UPDATE de la ligne créée | ⛔ idem |
| A1 — DELETE de la ligne créée | ⛔ idem |
| A2 — application de la migration | ⛔ Attend A1 |
| A3 — INSERT refusé après migration | ⛔ |
| A3 — UPDATE / DELETE refusés | ⛔ |
| A3 — SELECT compte A (liste vide) | ⛔ |
| A3 — accès `anon` refusé | ⛔ |
| A3 — re-export `pg_policies` + GRANT après migration | ⛔ |
| A3 — **vérification de l'embed `transaction_events`** (réserve R3) | ⛔ |
| A3 — migration snapshot dans `supabase/migrations/` | ⛔ |
| B — déploiement `jaspay-config` | ⛔ Arrêt demandé |
| B — tests a à g | ⛔ |
| C — tests de production sur `jaspay-transactions` | ⛔ Interdit |

**Aucun test de production n'a été exécuté dans cette étape. Aucune sortie brute de requête métier n'est disponible — faute d'identifiants.**

---

## 9. CE QU'IL ME FAUT POUR REPRENDRE

| # | Élément | Détail |
| --- | --- | --- |
| 1 | **Identifiants réels des comptes A et B** | Email + mot de passe, transmis dans le message. Je ne les écrirai dans aucun fichier, rapport, log ni commit. |
| 2 | Confirmation de l'ordre | A1 (rouge) → A2 (migration) → A3 (vert) → B |
| 3 | Décision sur R3 | Faut-il inclure la vérification de l'embed `transaction_events` au test A3 ? Je le recommande. |

### Le test A1 tel qu'il sera exécuté, dès réception des identifiants

1. `supabase.auth.signInWithPassword({ email: A, password: A })` → récupérer `access_token`
2. `SELECT id FROM bookmakers WHERE is_active = true LIMIT 1` → vrai UUID
3. `SELECT id FROM payment_providers WHERE is_active = true LIMIT 1` → vrai UUID
4. `POST /rest/v1/transactions` avec `apikey: <anon>` + `Authorization: Bearer <JWT de A>`, corps :
   ```json
   {
     "transaction_reference": "DEP-000000-DEADBEEF",
     "transaction_type": "deposit",
     "bookmaker_id": "<uuid réel>",
     "bookmaker_account_id": "test-a0",
     "amount": "1.00",
     "currency": "XOF",
     "payment_provider_id": "<uuid réel>",
     "phone_number": "000",
     "status": "completed"
   }
   ```
5. **Si accepté** : `PATCH` puis `DELETE` avec le JWT de A sur cette ligne, puis suppression par SQL.
6. **Si refusé** : ne rien modifier, rapporter l'erreur exacte.

---

## 10. SYNTHÈSE

**A0 est propre** : aucune transaction en base, donc aucun signe d'exploitation — avec la réserve que des tables vides ne permettent pas une analyse historique.

**A1 n'a pas pu être exécuté** : les identifiants sont restés sous forme de `[email] / [mot de passe]`. Je n'ai pas voulu simuler ce test avec un autre rôle, car cela aurait produit un résultat trompeur.

**A2 est prêt** : les quatre vérifications sont faites, la sauvegarde de retour arrière est écrite, et la confirmation que le backend Express passe par `service_role` est établie — la migration ne l'affectera pas.

**B n'a pas été atteinte**, conformément à votre consigne d'arrêt.

**C est complet** : diff intégré, 9 nouveaux tests dont les 3 demandés, 60/60 au banc d'essai local.

**Et le bug de `Deposit.jsx`/`Withdraw.jsx` est corrigé en préparation**, avec build vert. La recherche du même motif ailleurs n'a rien trouvé d'autre : `AdminAnnouncements.jsx` et `Withdraw.goToStep` ont été examinés et écartés.

**La faille RLS reste ouverte.** C'est la seule chose qui n'a pas avancé.

---

## ⏸ EN ATTENTE DES IDENTIFIANTS DES COMPTES A ET B
