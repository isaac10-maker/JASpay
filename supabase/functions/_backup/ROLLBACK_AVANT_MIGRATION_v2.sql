-- =============================================================================
-- SAUVEGARDE DE RETOUR ARRIÈRE — État AVANT migration corrective v2
-- Relevé le 21 novembre 2026, en lecture seule (pg_policies + role_table_grants)
-- À utiliser UNIQUEMENT si la migration v2 provoque une régression avérée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1 — POLICIES (snapshot exact avant migration)
-- -----------------------------------------------------------------------------

-- TABLE: transactions — 4 policies

-- 1) SELECT — Utilisateur lit ses propres transactions
--    cmd=SELECT, roles={authenticated}
--    qual=(auth.uid() = user_id)
--    with_check=NULL

-- 2) INSERT — Utilisateur crée ses propres transactions     ← SUPPRIMÉE PAR v2
--    cmd=INSERT, roles={authenticated}
--    qual=NULL
--    with_check=(auth.uid() = user_id)

-- 3) UPDATE — Aucune mise à jour directe de transactions depuis le client
--    cmd=UPDATE, roles={authenticated}
--    qual=false
--    with_check=NULL

-- 4) DELETE — Aucun delete sur transactions depuis le client
--    cmd=DELETE, roles={authenticated}
--    qual=false
--    with_check=NULL


-- TABLE: transaction_events — 2 policies  (AUCUNE n'est modifiée par v2)

-- 5) SELECT — Utilisateur lit les événements de ses propres transactions
--    cmd=SELECT, roles={authenticated}
--    qual=(EXISTS ( SELECT 1
--                   FROM transactions t
--                   WHERE ((t.id = transaction_events.transaction_id)
--                          AND (t.user_id = auth.uid()))))
--    with_check=NULL

-- 6) ALL — Aucune écriture directe sur transaction_events depuis le client
--    cmd=ALL, roles={authenticated}
--    qual=false
--    with_check=false


-- -----------------------------------------------------------------------------
-- SECTION 2 — GRANT (snapshot exact avant migration)
-- -----------------------------------------------------------------------------

-- table_name        | grantee       | privileges
-- ------------------+---------------+----------------------------------------------
-- transactions      | anon          | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- transactions      | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- transactions      | service_role  | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- transaction_events| anon          | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- transaction_events| authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- transaction_events| service_role  | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE


-- -----------------------------------------------------------------------------
-- SECTION 3 — SCRIPT DE RESTAURATION (ne pas exécuter sauf régression)
-- -----------------------------------------------------------------------------
--
-- BEGIN;
--
--   -- 3.1 Restauration de la policy INSERT supprimée par v2
--   CREATE POLICY "Utilisateur crée ses propres transactions"
--   ON public.transactions
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = user_id);
--
--   -- 3.2 Restauration des GRANT révoqués par D4
--   GRANT ALL ON TABLE public.transactions       TO anon;
--   GRANT ALL ON TABLE public.transactions       TO authenticated;
--   GRANT ALL ON TABLE public.transaction_events TO anon;
--   GRANT ALL ON TABLE public.transaction_events TO authenticated;
--
-- COMMIT;
--
-- ⚠️ ATTENTION : cette restauration RÉINTRODUIT LA FAILLE CRITIQUE
--    (insertion cliente avec status='completed').
--    À n'utiliser qu'en cas de régression avérée du produit.
--
-- service_role n'est jamais concerné : il conserve ses droits dans tous les cas.
-- =============================================================================
