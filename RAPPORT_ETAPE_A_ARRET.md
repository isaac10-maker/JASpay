# JASpay — ÉTAPE A : ARRÊT SUR CONDITION NON REMPLIE

**Date :** 21 novembre 2026
**Statut :** ⛔ **ARRÊT DEMANDÉ — condition de l'étape A non remplie**

---

## 1. DECLARATION DE NON-ACTION

| Action | Exécutée ? |
| --- | --- |
| Migration corrective | ❌ **AUCUNE** |
| `DROP POLICY` | ❌ Aucun |
| `REVOKE` / `GRANT` | ❌ Aucun |
| Déploiement `jaspay-config` | ❌ Aucun |
| Déploiement toute autre fonction | ❌ Aucun |
| Push GitHub | ❌ Aucun |
| Modification secrets / SMTP / Vercel / design | ❌ Aucune |
| Écriture de données | ❌ Aucune (uniquement des `SELECT`) |

**La faille RLS est toujours ouverte. L'état de production est inchangé.**

---

## 2. POURQUOI JE ME SUIS ARRÊTÉ

Votre condition :

> « UNIQUEMENT si `MIGRATION_CORRECTIVE_PROPOSEE.sql` ne contient rien d'autre que :
> — `DROP POLICY "Utilisateur crée ses propres transactions" ON transactions`
> — les REVOKE de D4 »

**La condition n'est pas remplie.** Le fichier contient deux écarts.

### Lignes de code SQL actives (toutes les autres lignes sont des commentaires `--`)

```
1  DROP POLICY IF EXISTS "Utilisateur crée ses propres transactions" ON public.transactions;
2  DROP POLICY IF EXISTS "Utilisateur met à jour ses propres transactions (champs limités)" ON public.transactions;
```

### Écart 1 — Les REVOKE de D4 sont ABSENTS

Ils n'existent qu'en **commentaire** (lignes 127-134), et avec un périmètre **différent** de ce que vous avez validé :

| D4 validé | Commentaire du fichier |
| --- | --- |
| `transactions` et `transaction_events` uniquement | ✅ idem |
| `INSERT, UPDATE, DELETE, TRUNCATE` | + `TRIGGER, REFERENCES` |
| anon : **aucun** droit | ✅ idem |
| authenticated : **SELECT conservé** | non explicité (utilisait 6 privilèges) |
| Autres tables : NON | ❌ incluait `rate_limit_attempts` |

### Écart 2 — Un second `DROP POLICY` non autorisé

```sql
DROP POLICY IF EXISTS "Utilisateur met à jour ses propres transactions (champs limités)" ON public.transactions;
```

C'est **D7, que vous avez explicitement refusé.**

### Ma responsabilité

Le fichier date du rapport précédent, où ce DROP était encore envisagé. **Je ne l'ai pas mis à jour après votre décision.** Je l'ai laissé en `_proposed/` sans le réviser, alors que je vous présentais D7 comme « non » dans ma recommandation. C'est une incohérence de ma part entre le rapport et le fichier livré.

---

## 3. LE FICHIER CONFORME EST PRÊT

**`supabase/functions/_proposed/MIGRATION_CORRECTIVE_v2.sql`**

Il ne contient **que** :
1. `DROP POLICY IF EXISTS "Utilisateur crée ses propres transactions" ON public.transactions;`
2. `REVOKE ALL ON TABLE public.transactions FROM anon;`
3. `REVOKE ALL ON TABLE public.transaction_events FROM anon;`
4. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.transactions FROM authenticated;`
5. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.transaction_events FROM authenticated;`

Le tout dans un seul `BEGIN; … COMMIT;`. Aucun autre code actif.

### Réserves techniques documentées dans ce fichier

| # | Réserve | Impact réel |
| --- | --- | --- |
| R1 | `TRIGGER` et `REFERENCES` non révoqués (hors D4) | **Nul** — un client ne crée pas de trigger via PostgREST |
| R2 | `REVOKE ALL FROM anon` révoque aussi `USAGE` sur séquences | **Nul** — `gen_random_uuid()`, pas de `SERIAL` |
| **R3** | **Effet sur les requêtes embarquées** | ⚠️ **À vérifier par le test 3** |
| R4 | Backend Express | **Nul** attendu — passe par `service_role`/RPC |

**R3 en détail** — le point le plus important :

`Transactions.jsx:50` et `TransactionDetail.jsx:51` lisent les événements via un embed imbriqué :
```js
.from('transactions').select('..., events:transaction_events (old_status, new_status, ...)')
```
Cette requête s'exécute sous `authenticated`. PostgREST résout l'embed **sous ce même rôle**. D4 conserve `SELECT` sur les deux tables, donc **l'embed devrait continuer de fonctionner**.

Mais la policy SELECT de `transaction_events` contient elle-même une sous-requête sur `transactions` :
```sql
EXISTS (SELECT 1 FROM transactions t
        WHERE t.id = transaction_events.transaction_id AND t.user_id = auth.uid())
```
Elle exige `SELECT` sur `transactions` pour `authenticated` — **conservé**. Ne pas y toucher.

---

## 4. SAUVEGARDE EFFECTUÉE (lecture seule, avant toute migration)

### 4.1 `pg_policies` — état actuel des deux tables (6 policies)

**`transactions`**

| Policy | Cmd | Rôles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Utilisateur lit ses propres transactions | SELECT | authenticated | `auth.uid() = user_id` | — |
| **Utilisateur crée ses propres transactions** | **INSERT** | authenticated | — | **`auth.uid() = user_id`** ← sera supprimée |
| Aucune mise à jour directe de transactions depuis le client | UPDATE | authenticated | `false` | — |
| Aucun delete sur transactions depuis le client | DELETE | authenticated | `false` | — |

**`transaction_events`**

| Policy | Cmd | Rôles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Utilisateur lit les événements de ses propres transactions | SELECT | authenticated | `EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_events.transaction_id AND t.user_id = auth.uid())` | — |
| Aucune écriture directe sur transaction_events depuis le client | ALL | authenticated | `false` | `false` |

### 4.2 GRANT — état actuel (6 lignes)

| Table | Rôle | Privilèges |
| --- | --- | --- |
| transactions | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| transactions | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| transactions | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| transaction_events | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| transaction_events | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| transaction_events | service_role | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

**Point clé pour votre exigence « vérifier que service_role n'est pas affecté » :**
`service_role` possède `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` sur les deux tables. Le fichier v2 **ne le mentionne dans aucun `REVOKE`** → ses droits resteront intacts. Et `service_role` est `BYPASSRLS` : la suppression de la policy INSERT ne le concerne pas non plus.

---

## 5. RELEVÉS POUR L'ÉTAPE B (préparation, aucun déploiement)

### 5.1 `verify_jwt` de `jaspay-config` — valeur RÉELLE relevée

```
slug        : jaspay-config
version     : 1
status      : ACTIVE
verify_jwt  : false        ← valeur réelle, relevée et non présumée
```

**À conserver lors du déploiement** : la nouvelle version devra être déployée avec `verify_jwt = false`, identique.

### 5.2 Sauvegarde du corps v1

Corps v1 récupéré via `get_edge_function`. Caractéristiques confirmées :

| Marqueur | Valeur |
| --- | --- |
| Commence par | ` * JASpay — Edge Function : jaspay-config` |
| **Bloc `/**` d'ouverture** | **ABSENT — tronqué à l'upload** |
| Import CDN | `https://esm.sh/@supabase/supabase-js@2.45.0` |
| `Deno.serve` | ❌ absent |
| `export default` | présent |
| `Access-Control-Allow-Origin` | `*` |
| `service_role` | ❌ jamais utilisé |
| Longueur | 59 lignes |

Le fichier de sauvegarde local est reconstituable par :
```bash
git show 8f4fcc5:supabase/functions/jaspay-config/index.js \
  > supabase/functions/_backup/jaspay-config.v1.js
```
⚠️ Ce fichier Git commence par `/**` — **le seul fait de le redéployer tel quel reproduirait le `BOOT_ERROR`** par troncature.

### 5.3 Vérification du fichier à déployer

```bash
$ head -c 12 supabase/functions/_proposed/jaspay-config/index.js
// JASpay — E
```
✅ Ne commence **pas** par `/**`. Commence par `// JASpay`. Le premier caractère n'est pas `*` : aucune troncature possible sur ce motif.

---

## 6. ÉTAPE C — ANALYSE DE LA RÉFÉRENCE : VOTRE CORRECTION EST FONDÉE, ET RÉVÈLE UN BUG BLOQUANT

### 6.1 La règle 5 était effectivement inexacte

J'avais écrit « référence générée serveur ». **C'est faux dans le flux réel.** La route `/api/transactions/reference` existe et génère bien côté serveur, mais **rien ne garantit** que la référence soumise à la création provient de cette route : `body.transaction_reference` est accepté tel quel.

### 6.2 Usage réel dans `Deposit.jsx` / `Withdraw.jsx` (fichiers structurellement identiques)

```js
// l.108 — génération
const generateReference = async (transactionType) => {
  try {
    const { data, error } = await invokeEdge(
      'jaspay-transactions', '/api/transactions/reference', 'POST',
      { transaction_type: transactionType }
    );
    if (error) throw error;
    setForm((prev) => ({ ...prev, transaction_reference: data.transaction_reference }));
  } catch (err) {
    setError(err.message || 'Erreur lors de la génération de la référence.');
    // ⚠️ PAS de rethrow, PAS de return d'échec
  }
};

// l.149 — soumission
try {
  if (!form.transaction_reference) {
    await generateReference('deposit');
  }
  const { data, error: txError } = await invokeEdge(
    'jaspay-transactions', '/api/transactions', 'POST',
    {
      transaction_reference: form.transaction_reference,   // ← l.160
      transaction_type: 'deposit',
      ...
    }
  );
  if (txError) throw txError;
  setSuccess(true);
  setStep(STEPS.CONFIRMATION);
```

### 6.3 Où la référence est-elle affichée ?

**Uniquement à l'écran de confirmation** (après succès), ligne 208 :
```jsx
<p className="text-xl font-mono text-electric-500 font-bold break-all">
  {form.transaction_reference}
</p>
```

**Aucun champ de saisie, aucun bouton « générer »** dans le formulaire. Vérifié : les seuls `onClick` sont la navigation (`navigate`, `goToStep`). `generateReference` n'est appelée **qu'à la soumission**, ligne 152.

**Réponse à votre question :** la référence n'est **pas affichée avant la création**. Elle est générée implicitement au moment de la soumission, puis montrée après coup. L'utilisateur ne la voit donc jamais avant.

### 6.4 🔴 BUG DÉCOUVERT — la création échouera à tous les coups

**Séquence réelle du tout premier dépôt d'un utilisateur :**

| # | Événement | `form.transaction_reference` |
| --- | --- | --- |
| 1 | État initial | `''` (l.43) |
| 2 | Soumission → `!form.transaction_reference` est vrai → `await generateReference('deposit')` | toujours `''` dans cette fermeture |
| 3 | Dans `generateReference` : `setForm(...)` programme une mise à jour d'état | `''` — React ne met pas à jour la variable `form` capturée |
| 4 | Retour dans `handleSubmit` : `transaction_reference: form.transaction_reference` | **`''`** |
| 5 | L'Edge Function valide : `if (!transaction_reference || …) return 400` | — |
| 6 | Résultat | **400 « Tous les champs sont requis »** |

**Deux causes conjuguées :**

1. **`setForm` est asynchrone** — la valeur mise à jour n'est pas visible dans la fermeture de `handleSubmit` en cours d'exécution. Il faudrait utiliser la valeur retournée par `generateReference`.
2. **`generateReference` n'a pas de `return`** — même en cas de succès, elle ne renvoie pas la référence. Son `catch` avale l'erreur sans la propager.

**Conséquence en production, dès que `jaspay-transactions` sera réparée :**

> Le **premier** dépôt (et le premier retrait) de chaque utilisateur échouera systématiquement avec `400 Tous les champs sont requis`.

Un second essai pourrait réussir, car `form.transaction_reference` serait alors déjà renseigné par le `setForm` du premier passage — **mais seulement si l'utilisateur soumet à nouveau sans recharger la page.** Après rechargement, l'échec se reproduit.

**Ce bug est antérieur à mes interventions.** Il existe dans le code actuel, masqué par le fait que `jaspay-transactions` est en `503` : le flux n'a jamais pu aboutir, donc le défaut n'a jamais été observé.

### 6.5 Validation stricte du format — proposition

**Format produit par le serveur :**
```js
const prefix = transaction_type === 'deposit' ? 'DEP' : 'WDR';
const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');  // YYMMDD → 6 chiffres
const randomPart = crypto.randomUUID().substring(0, 8).toUpperCase();  // 8 hex majuscules
// → DEP-251121-A1B2C3D4
```

**Regex :** `^(DEP|WDR)-\d{6}-[0-9A-F]{8}$` ✅ conforme à votre demande.

**Cohérence préfixe ↔ type :** `DEP` ⟺ `deposit`, `WDR` ⟺ `withdrawal`.

**Impact sur le contrat frontend : NUL.** Le format produit par `/reference` le respecte déjà. Aucune modification de `Deposit.jsx`/`Withdraw.jsx` requise pour cette validation.

### 6.6 Diff proposé (dans `_proposed/jaspay-transactions/index.js`, NON déployé)

**Ajout 1** — fonction de validation, après `formatDecimal` :

```diff
 function formatDecimal(value) {
   return Number(String(value).trim()).toFixed(2);
 }
+
+// --- Validation stricte du format de reference ---
+// Format impose : PREFIXE-YYMMDD-8HEX  ex. DEP-251121-A1B2C3D4
+const REFERENCE_REGEX = /^(DEP|WDR)-\d{6}-[0-9A-F]{8}$/;
+const REFERENCE_PREFIX_BY_TYPE = { deposit: 'DEP', withdrawal: 'WDR' };
+
+// Retourne null si valide, sinon un message d'erreur.
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
```

**Ajout 2** — contrôle dans `POST /api/transactions`, entre la validation du type et la validation du montant :

```diff
       // 2. Validation du type
       if (!['deposit', 'withdrawal'].includes(transaction_type)) {
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
         return jsonResponse({ error: 'Montant invalide' }, 400, cors);
       }
```

**Non modifié par ce diff :**
- le contrat de réponse (`201` + `transaction:{…12 champs}`) ;
- la route `/api/transactions/reference` (elle produit déjà le bon format) ;
- `Deposit.jsx` / `Withdraw.jsx` (aucune adaptation nécessaire) ;
- l'ordre des autres validations.

**⚠️ Point d'attention :** ce diff **durcit** la règle 5 (de « acceptée telle quelle » à « format imposé »). C'est une **modification de comportement**, donc une décision qui vous revient. Elle reste sans effet pratique tant que le bug §6.4 n'est pas corrigé, puisque la création échoue déjà en amont.

---

## 7. CORRECTION DU §9 DE MON RAPPORT PRÉCÉDENT — VOUS AVEZ RAISON

### 7.1 Ce qui était faux

```bash
sed -i '1s|^/\*\*|//|' supabase/functions/jaspay-config/index.js
```

Sur un fichier commençant par :
```js
/**
 * JASpay — Edge Function : jaspay-config
 ...
 */
```
ce `sed` transforme la ligne 1 en `//` et **laisse intactes** les lignes ` * JASpay…` et ` */`. Résultat : une ligne `//`, suivie de lignes ` * …` sans ouverture de commentaire, puis de ` */` orphelin.

**C'est une erreur de syntaxe JavaScript.** La fonction retournerait `BOOT_ERROR` — exactement ce qu'on cherchait à éviter. **Ma procédure de retour arrière était donc doublement inopérante : elle ne restaurait aucun service, et le fichier restauré ne serait même pas valide.**

Deuxième erreur reconnue : présenter « redéployer la v1 » comme un retour arrière alors qu'elle renvoie `503`. Un retour vers un état cassé n'est pas un retour arrière.

### 7.2 Procédure de retour arrière remplacée

**Principe : on ne restaure pas une version qui ne fonctionnait pas. On revient à un état connu, et on s'appuie sur les replis existants.**

#### Sauvegarde préalable (à faire avant tout déploiement)

| Élément | Méthode | Lieu de stockage |
| --- | --- | --- |
| Corps v1 de `jaspay-config` | `get_edge_function` (déjà relevé §5.2) | `_backup/jaspay-config.v1.body.txt` |
| Corps v4 de `jaspay-rate-limit` | `get_edge_function` | convention de référence |
| Valeur `verify_jwt` | relevée : `false` | à conserver |

La sauvegarde via `get_edge_function` conserve le corps **exactement tel que stocké**, troncature du `/**` incluse. C'est la seule référence fidèle. Elle ne doit **jamais** être redéployée directement.

#### Ce qu'on ferait réellement en cas de problème

| Situation | Action |
| --- | --- |
| **`jaspay-rate-limit` régresse** (elle fonctionne aujourd'hui) | Redéployer la **v4** — c'est la seule version dont le retour arrière a une valeur réelle. Corps sauvegardé, fonctionnelle, testée 10 fois en production. |
| **`jaspay-config` échoue après déploiement** | **Ne rien redéployer.** Le frontend possède déjà son repli : `Deposit.jsx:57` et `Withdraw.jsx:57` basculent sur une lecture Supabase directe protégée par RLS. Les listes continuent de s'afficher. La fonction redevient `503`, comme aujourd'hui — sans dégradation par rapport à l'état actuel. |
| **`jaspay-config` réussit mais casse un cas d'usage** | Same — repli RLS. Puis correction du code, pas retour à v1. |
| **La migration corrective provoque une régression** | Restaurer la policy INSERT et les GRANT (§4 du fichier v2). ⚠️ Réintroduit la faille. |

#### Vérification du repli RLS (déjà présente dans le code)

```js
// Deposit.jsx l.53-62 — repli si l'Edge Function échoue
const { data, error } = await invokeEdge('jaspay-config', '/api/bookmakers', 'GET');
if (error) throw error;
setBookmakers(data.bookmakers || []);
} catch (err) {
  const { data, error } = await supabase
    .from('bookmakers')
    .select('*')
    .eq('is_active', true);          // ← repli direct, RLS s'applique
```

Le repli est **fonctionnel aujourd'hui**. C'est pourquoi `/depot` n'est pas totalement cassée malgré le `503` de `jaspay-config`.

---

## 8. RÉCAPITULATIF DES TESTS

### 8.1 Tests RÉELLEMENT exécutés dans cette session

| Test | Résultat |
| --- | --- |
| Lecture du contenu intégral de `MIGRATION_CORRECTIVE_PROPOSEE.sql` | ✅ 139 lignes, 2 instructions actives — **écart détecté** |
| Relevé `pg_policies` sur `transactions` + `transaction_events` | ✅ 6 policies — sauvegarde obtenue |
| Relevé GRANT anon/authenticated/service_role | ✅ 6 lignes — sauvegarde obtenue |
| Relevé `verify_jwt` de `jaspay-config` | ✅ `false` |
| Relevé du corps v1 de `jaspay-config` | ✅ 59 l., `/**` tronqué, import CDN, pas de `Deno.serve` |
| Vérification `head -c 12` du fichier proposé | ✅ commence par `// JASpay` |
| Analyse `Deposit.jsx` / `Withdraw.jsx` (référence) | ✅ bug bloquant identifié |
| `diff` Deposit ↔ Withdraw | ✅ structurellement identiques |
| Grep `onClick` / `transaction_reference` | ✅ référence affichée seulement après création |

### 8.2 Tests PRÉVUS mais NON exécutés

| Test | Raison |
| --- | --- |
| Migration corrective | ⛔ Condition de l'étape A non remplie |
| Tests 1-4 de la migration (INSERT `completed`, UPDATE, DELETE, SELECT, anon) | ⛔ idem + nécessitent un compte de test |
| Déploiement `jaspay-config` | ⛔ Étape B non atteinte |
| Tests a-g de `jaspay-config` | ⛔ idem |
| Déploiement `jaspay-transactions` | ⛔ Interdit |
| Vérification de l'embed `transaction_events` après REVOKE (réserve R3) | ⛔ Dépend de la migration |

**Aucun test de production n'a été mené. Aucune sortie brute de requête métier n'est disponible.**

---

## 9. CE DONT J'AI BESOIN POUR CONTINUER

| # | Décision | Ma proposition |
| --- | --- | --- |
| 1 | **Valider `MIGRATION_CORRECTIVE_v2.sql`** comme périmètre exact de l'étape A | C'est le fichier conforme à D2/D3/D4, sans D7 |
| 2 | **Compte de test** pour les tests 1-4 | Un email/mot de passe de compte fictif, ou m'autoriser à en créer un (ce serait une écriture) |
| 3 | **Bug §6.4** (première création échoue en 400) | Correction du `return` dans `generateReference` — **hors périmètre actuel**, à planifier |
| 4 | **Diff §6.6** (validation stricte du format) | Durcit la règle 5 — à accepter ou refuser explicitement |

---

## 10. SYNTHÈSE

**Je n'ai rien exécuté** parce que le fichier que vous m'aviez demandé de contrôler ne correspondait pas à la condition que vous aviez posée. Il contenait un `DROP POLICY` que vous aviez refusé (D7) et n'avait pas les `REVOKE` que vous aviez autorisés (D4) — j'avais oublié de le réécrire après votre décision.

Le fichier conforme existe maintenant : `MIGRATION_CORRECTIVE_v2.sql`, cinq instructions, un seul `BEGIN/COMMIT`.

Deux découvertes en marge, qui ne figurent dans aucun rapport précédent :

**La règle 5 était inexacte**, comme vous l'aviez relevé. Le client fournit la référence, elle n'est pas garantie serveur.

**Et cela a conduit à un bug bloquant** : `Deposit.jsx` et `Withdraw.jsx` enverront une référence **vide** à la première soumission, car `setForm` est asynchrone et `generateReference` ne retourne rien. Dès que `jaspay-transactions` sera réparée, **le premier dépôt de chaque utilisateur échouera en `400`**. Ce défaut préexiste à mes interventions et était masqué par le `503`.

**La faille RLS reste ouverte.** C'est la seule chose que je regrette de ne pas avoir pu corriger dans cette étape.

---

## ⏸ EN ATTENTE DE VOTRE AUTORISATION
