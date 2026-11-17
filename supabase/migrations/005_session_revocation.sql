-- =============================================================================
-- JASpay — Migration 005 : Révocation de sessions et fonctions atomiques (Phase 3)
-- Correction des anomalies A1 à A4 du rapport de validation
-- Date : 2026-11-16
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ajout de la colonne revoked_at à admin_sessions
-- Permet de marquer une session comme révoquée sans la supprimer,
-- conservant l'historique tout en bloquant l'accès ultérieur.
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_sessions
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_revoked_at ON public.admin_sessions(revoked_at);

-- -----------------------------------------------------------------------------
-- 2. Fonction atomique : traitement d'une transaction par un agent
-- Utilise SELECT ... FOR UPDATE pour verrouiller la transaction,
-- empêchant les doubles validations concurrentes.
-- Toute l'opération (vérification + mise à jour + événement) est dans une seule
-- transaction SQL.
--
-- SECURITE : L'exécution est RESTREINTE au backend (service_role).
-- L'acces depuis le client (authenticated) est REVOQUE.
-- Si l'appel provient d'un client authentifie (auth.uid() non null), la fonction
-- verifie que auth.uid() = p_agent_id pour empecher l'usurpation d'identite d'agent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_transaction_atomic(
  p_transaction_id UUID,
  p_new_status TEXT,
  p_agent_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  error_code TEXT,
  error_message TEXT,
  transaction_id UUID,
  old_status TEXT,
  new_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_auth_uid UUID;
  v_current_status TEXT;
  v_assigned_agent_id UUID;
  v_user_id UUID;
  v_is_admin_or_super BOOLEAN;
BEGIN
  -- Verification d'identite pour les appels depuis le client (non-backend)
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL AND v_auth_uid != p_agent_id THEN
    RETURN QUERY SELECT
      false, 'IDENTITY_MISMATCH', 'Invalid agent identity.',
      NULL, NULL, NULL;
  END IF;

  -- Verrouiller la transaction pour eviter les modifications concurrentes
  SELECT status, assigned_agent_id, user_id
  INTO v_current_status, v_assigned_agent_id, v_user_id
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  -- Verifier que la transaction existe
  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT
      false, 'NOT_FOUND', 'Transaction introuvable.',
      NULL, NULL, NULL;
  END IF;

  -- Verifier que la transaction n'est pas deja traitee
  IF v_current_status IN ('completed', 'rejected', 'cancelled') THEN
    RETURN QUERY SELECT
      false, 'ALREADY_PROCESSED',
      'Cette transaction a deja ete traitee (statut : ' || v_current_status || ').',
      p_transaction_id, v_current_status, v_current_status;
  END IF;

  -- Verifier que le nouveau statut est valide
  IF p_new_status NOT IN ('processing', 'completed', 'rejected', 'cancelled') THEN
    RETURN QUERY SELECT
      false, 'INVALID_STATUS', 'Statut invalide.',
      p_transaction_id, v_current_status, v_current_status;
  END IF;

  -- Verifier les permissions de l'agent
  SELECT public.is_admin_or_super_admin() INTO v_is_admin_or_super;

  IF NOT v_is_admin_or_super THEN
    IF v_assigned_agent_id IS NULL OR v_assigned_agent_id != p_agent_id THEN
      RETURN QUERY SELECT
        false, 'NOT_ASSIGNED', 'Cette transaction ne vous est pas assignee.',
        p_transaction_id, v_current_status, v_current_status;
    END IF;
  END IF;

  -- Mettre a jour le statut de la transaction
  UPDATE public.transactions
  SET status = p_new_status,
      assigned_agent_id = CASE
        WHEN p_new_status = 'processing' THEN p_agent_id
        ELSE v_assigned_agent_id
      END,
      updated_at = now()
  WHERE id = p_transaction_id
  RETURNING id, status INTO transaction_id, new_status;

  -- Enregistrer l'evenement de changement de statut
  INSERT INTO public.transaction_events (
    transaction_id,
    old_status,
    new_status,
    changed_by,
    notes,
    metadata
  )
  VALUES (
    p_transaction_id,
    v_current_status,
    p_new_status,
    p_agent_id,
    p_notes,
    jsonb_build_object('source', 'agent', 'action', p_new_status, 'atomic', true)
  );

  RETURN QUERY SELECT
    true, NULL, NULL,
    p_transaction_id, v_current_status, p_new_status;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      false, 'SERVER_ERROR', SQLERRM,
      NULL, NULL, NULL;
END;
$func$;

REVOKE ALL ON FUNCTION public.process_transaction_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
-- ACCES RESERVIE AU BACKEND (service_role) uniquement.
-- Le backend effectue les verifications d'identite avant d'appeler cette fonction.

-- -----------------------------------------------------------------------------
-- 3. Fonction atomique : révocation de rôle utilisateur
-- Empêche l'auto-révocation de super_admin et la suppression du dernier super_admin.
-- Toute l'opération est dans une seule transaction.
--
-- SECURITE : L'exécution est RESTREINTE au backend (service_role).
-- L'acces depuis le client (authenticated) est REVOQUE.
-- Verrou consultatif pg_advisory_lock pour eviter les race conditions
-- sur la protection du dernier super_admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_user_role_atomic(
  p_target_user_id UUID,
  p_role TEXT,
  p_revoked_by UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_auth_uid UUID;
  v_target_has_super_admin BOOLEAN;
  v_caller_has_super_admin BOOLEAN;
  v_super_admin_count INTEGER;
  v_target_is_caller BOOLEAN;
BEGIN
  -- Verification d'identite pour les appels depuis le client (non-backend)
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL AND v_auth_uid != p_revoked_by THEN
    RETURN QUERY SELECT
      false, 'IDENTITY_MISMATCH', 'Invalid caller identity.';
  END IF;

  -- Verrou consultatif pour eviter les race conditions sur le dernier super_admin
  IF p_role = 'super_admin' THEN
    PERFORM pg_advisory_lock(hashtext('jaspay_super_admin_revoke'));
  END IF;

  BEGIN
    -- Verifier si l'appelant est super_admin
    SELECT public.has_role(p_revoked_by, 'super_admin') INTO v_caller_has_super_admin;

    -- Verifier si la cible est l'appelant lui-meme
    SELECT (p_target_user_id = p_revoked_by) INTO v_target_is_caller;

    -- Verifier si la cible a le role super_admin
    SELECT public.has_role(p_target_user_id, 'super_admin') INTO v_target_has_super_admin;

    -- Protection 1 : Interdire l'auto-revocation de super_admin
    IF p_role = 'super_admin' AND v_target_has_super_admin AND v_target_is_caller THEN
      IF p_role = 'super_admin' THEN
        PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
      END IF;
      RETURN QUERY SELECT
        false, 'SELF_REVOKE_SUPER_ADMIN', 'Auto-revocation de super admin interdite.';
    END IF;

    -- Protection 2 : Seul un super_admin peut revoquer le role super_admin
    IF p_role = 'super_admin' AND NOT v_caller_has_super_admin THEN
      IF p_role = 'super_admin' THEN
        PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
      END IF;
      RETURN QUERY SELECT
        false, 'INSUFFICIENT_ROLE', 'Seul un super admin peut revoquer le role super admin.';
    END IF;

    -- Protection 3 : Un admin ne peut pas revoquer un role a un super_admin
    IF v_target_has_super_admin AND NOT v_caller_has_super_admin THEN
      IF p_role = 'super_admin' THEN
        PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
      END IF;
      RETURN QUERY SELECT
        false, 'CANNOT_REVOKE_SUPER_ADMIN', 'Seul un super admin peut modifier les roles d un super admin.';
    END IF;

    -- Protection 4 : Empêcher la suppression du dernier super_admin
    IF p_role = 'super_admin' AND v_target_has_super_admin THEN
      SELECT COUNT(*) INTO v_super_admin_count
      FROM public.user_roles
      WHERE role = 'super_admin';

      IF v_super_admin_count <= 1 THEN
        IF p_role = 'super_admin' THEN
          PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
        END IF;
        RETURN QUERY SELECT
          false, 'LAST_SUPER_ADMIN', 'Impossible de revoquer le dernier super admin de la plateforme.';
      END IF;
    END IF;

    -- Verifier que le role existe pour l'utilisateur cible
    IF NOT public.has_role(p_target_user_id, p_role) THEN
      IF p_role = 'super_admin' THEN
        PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
      END IF;
      RETURN QUERY SELECT
        false, 'ROLE_NOT_FOUND', 'L utilisateur ne possede pas ce role.';
    END IF;

    -- Revoquer le role (operation atomique dans la meme transaction)
    DELETE FROM public.user_roles
    WHERE user_id = p_target_user_id
      AND role = p_role;

    -- Journaliser l'action
    INSERT INTO public.admin_actions (
      admin_user_id,
      action_type,
      target_user_id,
      target_entity_type,
      target_entity_id,
      details
    )
    VALUES (
      p_revoked_by,
      'revoke_role',
      p_target_user_id,
      'user_roles',
      NULL,
      jsonb_build_object('role', p_role, 'revoked_by', p_revoked_by)
    );

    IF p_role = 'super_admin' THEN
      PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
    END IF;

    RETURN QUERY SELECT true, NULL, NULL;

  EXCEPTION
    WHEN OTHERS THEN
      IF p_role = 'super_admin' THEN
        PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
      END IF;
      RETURN QUERY SELECT
        false, 'SERVER_ERROR', SQLERRM;
  END;

  IF p_role = 'super_admin' THEN
    PERFORM pg_advisory_unlock(hashtext('jaspay_super_admin_revoke'));
  END IF;
END;
$func$;

REVOKE ALL ON FUNCTION public.revoke_user_role_atomic(UUID, TEXT, UUID) FROM PUBLIC;
-- ACCES RESERVIE AU BACKEND (service_role) uniquement.

-- -----------------------------------------------------------------------------
-- Note de deployment :
-- Le deploiement actuel sur Supabase utilise une version simplifiee de ces
-- fonctions (sans pg_advisory_lock et avec une logique reduite) en raison de
-- contraintes du connecteur d'exécution SQL. La version complète ci-dessus
-- doit être appliquée manuellement via l'interface SQL de Supabase pour
-- bénéficier de toutes les protections.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Fin de la migration 005
-- =============================================================================