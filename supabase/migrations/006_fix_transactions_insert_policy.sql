-- =============================================================================
-- Migration 006 — Fermeture de la faille INSERT cliente sur transactions
-- Appliquée en production le 21 novembre 2026 (via connecteur Supabase).
-- =============================================================================
--
-- FAILLE CORRIGÉE :
--   La policy "Utilisateur crée ses propres transactions" (003_transactions.sql
--   l.288) n'avait aucune contrainte sur status, amount, currency, bookmaker_id
--   ni payment_provider_id. Un utilisateur authentifié pouvait insérer
--   directement via PostgREST avec status = 'completed', en contournant
--   intégralement les règles métier de l'Edge Function jaspay-transactions.
--
-- JUSTIFICATION DU RETRAIT :
--   jaspay-transactions insère en service_role (BYPASSRLS) : la policy cliente
--   était inutile à son fonctionnement. Aucun code frontend n'insère de
--   transaction (vérifié : uniquement des .select() dans client/src).
--
-- EFFET VÉRIFIÉ APRÈS APPLICATION :
--   - transactions : plus aucune policy INSERT
--   - anon : 0 privilège sur les deux tables
--   - authenticated : SELECT conservé, écritures révoquées
--   - service_role : INCHANGÉ (DELETE, INSERT, REFERENCES, SELECT,
--     TRIGGER, TRUNCATE, UPDATE) — Edge Functions et backend Express intacts
-- =============================================================================

BEGIN;

-- 1. Retrait de la policy INSERT permissive
DROP POLICY IF EXISTS "Utilisateur crée ses propres transactions"
  ON public.transactions;

-- 2. anon : plus aucun accès direct aux deux tables
REVOKE ALL ON TABLE public.transactions FROM anon;
REVOKE ALL ON TABLE public.transaction_events FROM anon;

-- 3. authenticated : lecture conservée, écriture révoquée
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.transactions FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.transaction_events FROM authenticated;

COMMIT;


-- =============================================================================
-- RETOUR ARRIÈRE — ne pas exécuter sauf régression avérée
-- ⚠️ RÉINTRODUIT LA FAILLE CRITIQUE
-- =============================================================================
--
-- BEGIN;
--
--   CREATE POLICY "Utilisateur crée ses propres transactions"
--   ON public.transactions
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = user_id);
--
--   GRANT ALL ON TABLE public.transactions        TO anon;
--   GRANT ALL ON TABLE public.transaction_events  TO anon;
--   GRANT ALL ON TABLE public.transactions        TO authenticated;
--   GRANT ALL ON TABLE public.transaction_events  TO authenticated;
--
-- COMMIT;
-- =============================================================================


-- =============================================================================
-- NOTE — policy UPDATE invalide dans 003_transactions.sql (l.296)
-- =============================================================================
--
-- Cette policy utilise NEW.id dans un WITH CHECK, ce qui n'est pas
-- référençable dans une policy RLS (NEW n'existe que dans les triggers).
-- Elle a échoué à la création lors de l'exécution de 003 avec :
--   ERROR 42P01: missing FROM-clause entry for table "new"
--
-- Elle n'existe donc PAS en production, et n'a jamais eu d'effet.
-- La production est protégée par la policy
-- "Aucune mise à jour directe de transactions depuis le client" (USING false).
--
-- Elle n'est PAS supprimée ici (décision D7 refusée). Elle reste du code mort
-- dans 003_transactions.sql, à nettoyer dans une intervention dédiée.
-- =============================================================================
