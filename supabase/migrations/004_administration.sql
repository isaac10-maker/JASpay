-- =============================================================================
-- JASpay — Migration 004 : Administration et surveillance (Phase 3)
-- Base de données : PostgreSQL via Supabase
-- Date : 2026-11-16
-- =============================================================================
-- Tables créées :
--   admin_actions          — Journal des actions administratives sensibles
--   platform_settings      — Paramètres généraux de la plateforme
--   announcements          — Annonces diffusées aux utilisateurs
--   admin_sessions         — Suivi des sessions administratives actives
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table : admin_actions
-- Journal immuable de toutes les actions administratives (suspendre, activer,
-- attribuer rôle, configurer, supprimer, etc.).
-- Protégée contre les modifications et suppressions non autorisées.
-- -----------------------------------------------------------------------------
CREATE TABLE admin_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL,                 -- suspend_user, reactivate_user, delete_user, assign_role, revoke_role, config_change, etc.
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_entity_type TEXT,                   -- user, transaction, bookmaker, provider, setting, announcement
  target_entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_actions_admin_user_id ON admin_actions(admin_user_id);
CREATE INDEX idx_admin_actions_action_type ON admin_actions(action_type);
CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at);
CREATE INDEX idx_admin_actions_target_user_id ON admin_actions(target_user_id);

-- -----------------------------------------------------------------------------
-- 2. Table : platform_settings
-- Paramètres généraux configurables par le super administrateur.
-- Chaque paramètre a une clé unique et une valeur JSONB.
-- -----------------------------------------------------------------------------
CREATE TABLE platform_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,          -- site_maintenance, max_deposit_amount, etc.
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,  -- true si lisible par les utilisateurs ordinaires
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_settings_key ON platform_settings(setting_key);
CREATE INDEX idx_platform_settings_public ON platform_settings(is_public);

-- -----------------------------------------------------------------------------
-- 3. Table : announcements
-- Annonces affichées aux utilisateurs (maintenance, informations, alertes).
-- -----------------------------------------------------------------------------
CREATE TABLE announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_active ON announcements(is_active);
CREATE INDEX idx_announcements_dates ON announcements(starts_at, ends_at);

-- -----------------------------------------------------------------------------
-- 4. Table : admin_sessions
-- Suivi des sessions administratives actives (connexion, dernière activité).
-- Permet la déconnexion forcée et l'audit des accès admin.
-- -----------------------------------------------------------------------------
CREATE TABLE admin_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_sessions_admin_user_id ON admin_sessions(admin_user_id);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- -----------------------------------------------------------------------------
-- 5. Trigger : mise à jour automatique de updated_at
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_announcements_updated_at ON public.announcements;
CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 6. RLS : Activation sur toutes les nouvelles tables
-- -----------------------------------------------------------------------------

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 7. Politiques RLS : admin_actions
-- Lecture : uniquement super_admin et admin
-- Écriture : interdite depuis le client (gérée par le backend serveur)
-- -----------------------------------------------------------------------------

CREATE POLICY "Les administrateurs lisent les actions admin"
ON admin_actions
FOR SELECT
TO authenticated
USING (public.is_admin_or_super_admin());

CREATE POLICY "Aucune écriture directe sur admin_actions depuis le client"
ON admin_actions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- 8. Politiques RLS : platform_settings
-- Lecture : super_admin, admin, moderator (tous) ; utilisateur si is_public
-- Écriture : uniquement super_admin et admin (via backend)
-- -----------------------------------------------------------------------------

CREATE POLICY "Lecture des paramètres publics"
ON platform_settings
FOR SELECT
TO authenticated
USING (is_public = true);

CREATE POLICY "Les administrateurs lisent tous les paramètres"
ON platform_settings
FOR SELECT
TO authenticated
USING (public.is_admin_or_super_admin() OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Aucune écriture directe sur platform_settings depuis le client"
ON platform_settings
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- 9. Politiques RLS : announcements
-- Lecture : tous les authentifiés (annonces actives uniquement)
-- Écriture : uniquement super_admin et admin (via backend)
-- -----------------------------------------------------------------------------

CREATE POLICY "Lecture des annonces actives"
ON announcements
FOR SELECT
TO authenticated
USING (is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now()));

CREATE POLICY "Aucune écriture directe sur announcements depuis le client"
ON announcements
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- 10. Politiques RLS : admin_sessions
-- Lecture : l'admin lit ses propres sessions ; super_admin lit toutes
-- Écriture : interdite depuis le client (gérée par le backend)
-- -----------------------------------------------------------------------------

CREATE POLICY "Utilisateur lit ses propres sessions admin"
ON admin_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = admin_user_id);

CREATE POLICY "Super admin lit toutes les sessions admin"
ON admin_sessions
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Aucune écriture directe sur admin_sessions depuis le client"
ON admin_sessions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- 11. Fonction : journaliser une action administrative
-- Appelée exclusivement depuis le backend Node.js (service_role).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_user_id UUID,
  p_action_type TEXT,
  p_target_user_id UUID DEFAULT NULL,
  p_target_entity_type TEXT DEFAULT NULL,
  p_target_entity_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action_id UUID;
BEGIN
  INSERT INTO admin_actions (
    admin_user_id,
    action_type,
    target_user_id,
    target_entity_type,
    target_entity_id,
    details,
    created_at
  )
  VALUES (
    p_admin_user_id,
    p_action_type,
    p_target_user_id,
    p_target_entity_type,
    p_target_entity_id,
    p_details,
    now()
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(UUID, TEXT, UUID, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(UUID, TEXT, UUID, TEXT, UUID, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- Fin de la migration 004
-- =============================================================================
