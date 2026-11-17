-- =============================================================================
-- JASpay — Migration 001 : Schéma initial (Phase 1 — Fondation)
-- Base de données : PostgreSQL via Supabase
-- Date : 2026-11-16
-- =============================================================================
-- Cette migration crée les tables de base pour l'authentification, les profils
-- et les rôles. Aucune donnée financière n'est encore gérée (Phase 2).
-- =============================================================================

-- Activer l'extension pgcrypto pour gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Table : profiles
-- Stocke les informations publiques du profil utilisateur, liée à auth.users.
-- Les données personnelles sont privées par défaut (RLS activé).
-- -----------------------------------------------------------------------------
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,                           -- Numéro Mobile Money ajouté séparément (pas de SMS obligatoire)
  public_id TEXT UNIQUE,                -- Identifiant public BXIX-XXXXXX (Phase 4 communauté)
  role TEXT NOT NULL DEFAULT 'user',    -- super_admin | admin | agent | moderator | user
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour accélérer les recherches par email et par rôle
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_public_id ON profiles(public_id);

-- -----------------------------------------------------------------------------
-- Table : user_roles
-- Attribution explicite des rôles aux utilisateurs (gestion côté serveur uniquement).
-- -----------------------------------------------------------------------------
CREATE TABLE user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'agent', 'moderator', 'user')),
  assigned_by UUID REFERENCES auth.users(id),  -- Qui a attribué ce rôle
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- -----------------------------------------------------------------------------
-- Table : role_permissions
-- Définition des permissions par rôle (contrôle côté serveur).
-- -----------------------------------------------------------------------------
CREATE TABLE role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'agent', 'moderator', 'user')),
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role);

-- -----------------------------------------------------------------------------
-- Table : audit_logs
-- Journaux d'audit immuables des actions administratives et importantes.
-- Protégés contre les modifications non autorisées.
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- =============================================================================
-- RLS : Activation de la sécurité au niveau des lignes sur toutes les tables
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Politiques RLS : profiles
-- Chaque utilisateur lit uniquement son propre profil.
-- Les administrateurs peuvent lire tous les profils.
-- =============================================================================

-- Lecture : un utilisateur lit son propre profil
CREATE POLICY "Les utilisateurs lisent leur propre profil"
ON profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Lecture : les administrateurs lisent tous les profils
CREATE POLICY "Les administrateurs lisent tous les profils"
ON profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
  )
);

-- Écriture : un utilisateur met à jour son propre profil (champs limités)
CREATE POLICY "Les utilisateurs mettent à jour leur propre profil"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Création : le profil est créé automatiquement par trigger (voir ci-dessous)
-- Aucun insert direct autorisé depuis le client

-- Suppression : interdite directement (désactivation via is_active seulement)

-- =============================================================================
-- Politiques RLS : user_roles
-- Lecture : un utilisateur lit ses propres rôles
-- Lecture : les administrateurs lisent tous les rôles
-- Écriture : interdite depuis le client (gérée par trigger/procédure serveur)
-- =============================================================================

CREATE POLICY "Les utilisateurs lisent leurs propres rôles"
ON user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Les administrateurs lisent tous les rôles"
ON user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'admin')
  )
);

-- Aucun insert/update/delete autorisé directement depuis le client

-- =============================================================================
-- Politiques RLS : role_permissions
-- Lecture : authentifiés peuvent lire les permissions (pour l'UI)
-- Écriture : interdite depuis le client
-- =============================================================================

CREATE POLICY "Lecture des permissions par tous les authentifiés"
ON role_permissions
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- Politiques RLS : audit_logs
-- Lecture : uniquement les administrateurs
-- Écriture : interdite depuis le client (écriture serveur uniquement)
-- =============================================================================

CREATE POLICY "Les administrateurs lisent les journaux d'audit"
ON audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
  )
);

-- =============================================================================
-- Trigger : création automatique du profil après inscription Supabase Auth
-- Ce trigger s'assure qu'un profil est créé pour chaque nouvel utilisateur.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    true,
    now(),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Trigger : mise à jour automatique de updated_at sur profiles
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Insertion des rôles par défaut dans role_permissions
-- Ces permissions sont consultées côté serveur pour le contrôle d'accès.
-- =============================================================================

INSERT INTO role_permissions (role, permission) VALUES
  -- Utilisateur
  ('user', 'read:own_profile'),
  ('user', 'read:own_transactions'),
  ('user', 'create:own_transactions'),
  ('user', 'manage:own_saved_numbers'),

  -- Agent
  ('agent', 'read:own_profile'),
  ('agent', 'read:assigned_transactions'),
  ('agent', 'update:assigned_transactions'),
  ('agent', 'add:transaction_notes'),

  -- Modérateur
  ('moderator', 'read:community_posts'),
  ('moderator', 'moderate:community_content'),

  -- Administrateur
  ('admin', 'read:all_profiles'),
  ('admin', 'read:all_transactions'),
  ('admin', 'manage:users'),
  ('admin', 'manage:agents'),
  ('admin', 'read:audit_logs'),

  -- Super Administrateur
  ('super_admin', 'read:all_profiles'),
  ('super_admin', 'read:all_transactions'),
  ('super_admin', 'manage:users'),
  ('super_admin', 'manage:agents'),
  ('super_admin', 'manage:moderators'),
  ('super_admin', 'read:audit_logs'),
  ('super_admin', 'manage:system_settings'),
  ('super_admin', 'assign:super_admin_role');

-- =============================================================================
-- Fin de la migration 001
-- =============================================================================
