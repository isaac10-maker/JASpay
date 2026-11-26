-- =============================================================================
-- JASpay — MIGRATION CORRECTIVE v2 — CONFORME AUX DÉCISIONS D1–D7
-- ⚠️  NON EXÉCUTÉE — EN ATTENTE D'AUTORISATION
-- =============================================================================
--
-- PÉRIMÈTRE STRICTEMENT LIMITÉ À CE QUI A ÉTÉ AUTORISÉ :
--   1. DROP de la policy INSERT sur transactions          (A)
--   2. REVOKE de D4 sur transactions et transaction_events (D4)
--
-- RIEN D'AUTRE. Pas de DROP de la policy UPDATE (D7 refusé).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- ÉTAPE 1 — Retrait de la policy INSERT permissive (faille critique)
--
-- "Utilisateur crée ses propres transactions" (003_transactions.sql, l.288)
-- WITH CHECK (auth.uid() = user_id) — aucune contrainte sur status ni amount.
-- Permettait l'injection directe d'une transaction status='completed'.
-- Inutile : jaspay-transactions insère en service_role (BYPASSRLS).
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Utilisateur crée ses propres transactions"
  ON public.transactions;

-- -----------------------------------------------------------------------------
-- ÉTAPE 2 — D4 : révocation des droits d'écriture
--
-- RÈGLE DEMANDÉE :
--   - anon           : plus AUCUN droit sur ces deux tables
--   - authenticated  : SELECT conservé, INSERT/UPDATE/DELETE/TRUNCATE révoqués
--
-- service_role n'est PAS touché : il conserve ses droits et son BYPASSRLS.
-- Les Edge Functions (service_role) et le backend Express ne sont pas affectés.
-- -----------------------------------------------------------------------------

-- anon : retrait de TOUS les privilèges (y compris SELECT)
REVOKE ALL ON TABLE public.transactions FROM anon;
REVOKE ALL ON TABLE public.transaction_events FROM anon;

-- authenticated : retrait des écritures, SELECT conservé
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.transactions FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.transaction_events FROM authenticated;

-- =============================================================================
-- RÉSERVES TECHNIQUES — À LIRE AVANT EXÉCUTION
-- =============================================================================
--
-- R1. TRIGGER et REFERENCES ne sont PAS révoqués (hors périmètre D4).
--     Impact réel : NUL. Un client ne peut pas créer de trigger via PostgREST.
--
-- R2. REVOKE ALL FROM anon révoque aussi SELECT et USAGE sur les séquences
--     liées. Impact réel : NUL. `transactions` et `transaction_events`
--     utilisent `gen_random_uuid()`, pas de séquence SERIAL.
--
-- R3. ⚠️ EFFET SUR LES REQUÊTES EMBARQUÉES.
--     Le frontend lit les événements via un embed imbriqué :
--       Transactions.jsx:50
--         .from('transactions').select('..., events:transaction_events (...)')
--       TransactionDetail.jsx:51   (identique)
--
--     Cette requête s'exécute sous le rôle `authenticated`. PostgREST résout
--     l'embed en interrogeant `transaction_events` SOUS CE MÊME RÔLE.
--     Or D4 révoque INSERT/UPDATE/DELETE/TRUNCATE, mais CONSERVE SELECT :
--     l'embed doit donc continuer de fonctionner.
--
--     → À VÉRIFIER IMPÉRATIVEMENT par le test 3 (SELECT avec JWT).
--       Si l'embed cesse de fonctionner, la policy SELECT de transaction_events
--       utilise elle-même une sous-requête sur `transactions` :
--         EXISTS (SELECT 1 FROM transactions t
--                 WHERE t.id = transaction_events.transaction_id
--                   AND t.user_id = auth.uid())
--       Cette sous-requête exige SELECT sur `transactions` pour
--       `authenticated` — conservé. Ne PAS révoquer SELECT sur transactions.
--
-- R4. Le backend Express (server/src/) n'utilise pas anon/authenticated pour
--     les transactions : il passe par service_role ou par les RPC.
--     Impact attendu : NUL. À confirmer par le test 5.

COMMIT;


-- =============================================================================
-- RETOUR ARRIÈRE COMPLET
-- =============================================================================

-- ÉTAPE 1 — Restauration de la policy INSERT
--
-- BEGIN;
--   CREATE POLICY "Utilisateur crée ses propres transactions"
--   ON public.transactions
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = user_id);
-- COMMIT;
--
-- ⚠️ Réintroduit la faille critique. À n'utiliser qu'en cas de régression avérée.

-- ÉTAPE 2 — Restauration des GRANT
--
-- BEGIN;
--
--   -- transactions
--   GRANT ALL ON TABLE public.transactions TO anon;
--   GRANT ALL ON TABLE public.transactions TO authenticated;
--
--   -- transaction_events
--   GRANT ALL ON TABLE public.transaction_events TO anon;
--   GRANT ALL ON TABLE public.transaction_events TO authenticated;
--
-- COMMIT;
--
-- Note : GRANT ALL restaure DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE — l'état par défaut Supabase relevé avant migration.
--
-- Vérification du retour arrière :
--   SELECT table_name, grantee,
--          string_agg(DISTINCT privilege_type, ', ') AS privileges
--   FROM information_schema.role_table_grants
--   WHERE table_schema='public'
--     AND table_name IN ('transactions','transaction_events')
--     AND grantee IN ('anon','authenticated')
--   GROUP BY 1,2 ORDER BY 1,2;
--   -- Attendu : les 4 lignes avec DELETE, INSERT, ..., UPDATE
