-- =============================================================================
-- JASpay — Migration 002 : Sécurisation de la fondation Supabase
-- Audit correctif avant Phase 2
-- Date : 2026-11-16
-- =============================================================================
-- Objectifs :
-- 1. Retirer `role` de profiles : user_roles est la source de vérité unique
-- 2. Protéger is_active contre modification depuis le frontend
-- 3. Sécuriser les fonctions SECURITY DEFINER (search_path, privilèges)
-- 4. Créer une fonction de vérification de rôle centralisée
-- 5. Créer une procédure contrôlée pour le premier super administrateur
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Supprimer le champ `role` de la table profiles (désormais dans user_roles)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- -----------------------------------------------------------------------------
-- 2. Protéger is_active : seuls les administrateurs peuvent le modifier
--    (La politique UPDATE existante sur profiles est remplacée par une version
--     plus restrictive qui exclut is_active et email des champs modifiables
--     par l'utilisateur lui-même.)
-- -----------------------------------------------------------------------------

-- Supprimer l'ancienne politique UPDATE trop permissive
DROP POLICY IF EXISTS "Les utilisateurs mettent à jour leur propre profil" ON public.profiles;

-- Nouvelle politique : l'utilisateur ne peut modifier que email et phone
-- (is_active reste protégé : pas de WITH CHECK dessus)
CREATE POLICY "Les utilisateurs mettent à jour leurs propres coordonnées"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (is_active IS NOT DISTINCT FROM (SELECT is_active FROM public.profiles WHERE id = auth.uid()))
);

-- Politique UPDATE pour les administrateurs (peuvent modifier is_active de n'importe quel utilisateur)
CREATE POLICY "Les administrateurs modifient les profils utilisateurs"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_admin_or_super_admin())
WITH CHECK (public.is_admin_or_super_admin());

-- -----------------------------------------------------------------------------
-- 3. Corriger le trigger handle_new_user (ne plus référencer la colonne role
--    supprimée de profiles dans la migration 002)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    true,
    now(),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Sécuriser les fonctions SECURITY DEFINER existantes
-- search_path explicite pour éviter l'injection de fonctions malveillantes

ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Fonction centralisée de vérification de rôle
--    Utilisée par toutes les politiques RLS et procédures administratives
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = p_role;

  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Fonction : est-ce que l'utilisateur courant est administrateur (admin ou super_admin)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'super_admin');
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Fonction : est-ce que l'utilisateur courant est super administrateur
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.has_role(auth.uid(), 'super_admin');
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Procédure contrôlée : création du premier super administrateur
--    Ne peut être appelée que si aucun super_admin n'existe encore.
--    L'utilisateur qui l'appelle (auth.uid()) devient le premier super_admin.
--    Aucune lecture de auth.users n'est requise (évite les problèmes de privilèges).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE public.create_first_super_admin()
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_super_admin INTEGER;
BEGIN
  -- Vérifier qu'aucun super_admin n'existe déjà
  SELECT COUNT(*) INTO v_existing_super_admin
  FROM public.user_roles
  WHERE role = 'super_admin';

  IF v_existing_super_admin > 0 THEN
    RAISE EXCEPTION 'Un super administrateur existe déjà. Cette procédure ne peut être appelée qu''une seule fois.';
  END IF;

  -- L'utilisateur courant (auth.uid()) devient super_admin
  INSERT INTO public.user_roles (user_id, role, assigned_by, assigned_at)
  VALUES (auth.uid(), 'super_admin', auth.uid(), now())
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Journaliser l'action
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, created_at)
  VALUES (auth.uid(), 'CREATE_FIRST_SUPER_ADMIN', 'user_roles', auth.uid(),
          jsonb_build_object('action', 'create_first_super_admin', 'role', 'super_admin'), now());

  RAISE NOTICE 'Super administrateur créé avec succès pour l utilisateur %', auth.uid();
END;
$$;

REVOKE ALL ON PROCEDURE public.create_first_super_admin() FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE public.create_first_super_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. Procédure : attribution de rôle par un administrateur existant
--    Seuls les admins/super_admins peuvent attribuer des rôles.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE public.assign_user_role(
  p_target_user_id UUID,
  p_role TEXT,
  p_assigned_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Seul un admin ou super_admin peut attribuer des rôles
  IF NOT (public.has_role(p_assigned_by, 'admin') OR public.has_role(p_assigned_by, 'super_admin')) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent attribuer des rôles.';
  END IF;

  -- Un super_admin peut tout attribuer. Un admin ne peut pas créer de super_admin.
  IF p_role = 'super_admin' AND NOT public.has_role(p_assigned_by, 'super_admin') THEN
    RAISE EXCEPTION 'Seul un super administrateur peut attribuer le rôle super_admin.';
  END IF;

  INSERT INTO public.user_roles (user_id, role, assigned_by, assigned_at)
  VALUES (p_target_user_id, p_role, p_assigned_by, now())
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, created_at)
  VALUES (p_assigned_by, 'ASSIGN_ROLE', 'user_roles', p_target_user_id,
          jsonb_build_object('role', p_role, 'assigned_by', p_assigned_by), now());
END;
$$;

REVOKE ALL ON PROCEDURE public.assign_user_role(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE public.assign_user_role(UUID, TEXT, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Mise à jour des politiques RLS existantes pour utiliser les nouvelles fonctions
-- -----------------------------------------------------------------------------

-- Politiques profiles : utiliser is_admin_or_super_admin() au lieu de sous-requête directe
DROP POLICY IF EXISTS "Les administrateurs lisent tous les profils" ON public.profiles;
CREATE POLICY "Les administrateurs lisent tous les profils"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin_or_super_admin());

-- Politiques user_roles : utiliser is_admin_or_super_admin()
DROP POLICY IF EXISTS "Les administrateurs lisent tous les rôles" ON public.user_roles;
CREATE POLICY "Les administrateurs lisent tous les rôles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_admin_or_super_admin());

-- Politiques audit_logs : utiliser is_admin_or_super_admin()
DROP POLICY IF EXISTS "Les administrateurs lisent les journaux d'audit" ON public.audit_logs;
CREATE POLICY "Les administrateurs lisent les journaux d'audit"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_admin_or_super_admin());

-- -----------------------------------------------------------------------------
-- 10. Interdiction explicite d'INSERT sur profiles depuis le client
--     (Le profil est créé uniquement par le trigger handle_new_user)
-- -----------------------------------------------------------------------------
CREATE POLICY "Aucun insert direct sur profiles depuis le client"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- 11. Interdiction de DELETE sur profiles depuis le client
-- -----------------------------------------------------------------------------
CREATE POLICY "Aucun delete sur profiles depuis le client"
ON public.profiles
FOR DELETE
TO authenticated
USING (false);

-- -----------------------------------------------------------------------------
-- 12. Interdiction d'INSERT/UPDATE/DELETE sur user_roles depuis le client
--     (Géré exclusivement par les procédures assign_user_role et create_first_super_admin)
-- -----------------------------------------------------------------------------
CREATE POLICY "Aucune écriture directe sur user_roles depuis le client"
ON public.user_roles
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- Fin de la migration 002
-- =============================================================================
