-- =============================================================================
-- JASpay — Tests de politiques RLS (Migration 001)
-- À exécuter contre une instance Supabase avec la migration 001 appliquée.
-- Ces tests vérifient l'isolation des données entre utilisateurs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 : Un utilisateur ordinaire ne peut pas lire le profil d'un autre utilisateur
-- -----------------------------------------------------------------------------
-- Remplacer <UID_AUTRE_UTILISATEUR> par l'ID d'un autre utilisateur existant.
-- Cette requête doit retourner 0 ligne (ou une erreur selon la config).
SELECT id, email, role
FROM profiles
WHERE id = '<UID_AUTRE_UTILISATEUR>';

-- -----------------------------------------------------------------------------
-- TEST 2 : Un utilisateur peut lire son propre profil
-- -----------------------------------------------------------------------------
SELECT id, email, role
FROM profiles
WHERE id = auth.uid();

-- -----------------------------------------------------------------------------
-- TEST 3 : Un utilisateur ne peut pas modifier le rôle d'un autre utilisateur
-- -----------------------------------------------------------------------------
UPDATE profiles
SET role = 'admin'
WHERE id = '<UID_AUTRE_UTILISATEUR>';

-- -----------------------------------------------------------------------------
-- TEST 4 : Un utilisateur ne peut pas insérer un profil directement
-- -----------------------------------------------------------------------------
INSERT INTO profiles (id, email, role, is_active)
VALUES (gen_random_uuid(), 'test@exemple.com', 'user', true);

-- -----------------------------------------------------------------------------
-- TEST 5 : Un utilisateur ordinaire ne peut pas lire audit_logs
-- -----------------------------------------------------------------------------
SELECT *
FROM audit_logs
LIMIT 1;

-- -----------------------------------------------------------------------------
-- TEST 6 : Un utilisateur ne peut pas modifier user_roles directement
-- -----------------------------------------------------------------------------
INSERT INTO user_roles (user_id, role, assigned_by)
VALUES (auth.uid(), 'admin', auth.uid());

-- =============================================================================
-- Fin des tests RLS
-- =============================================================================
