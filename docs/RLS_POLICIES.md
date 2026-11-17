# Politiques RLS — JASpay (Phase 1 — Fondation)

Ce document décrit les politiques de sécurité au niveau des lignes (Row Level Security) appliquées aux tables créées lors de la migration `001_initial_schema.sql`.

## Principe général

- **RLS activé sur toutes les tables exposées** : `profiles`, `user_roles`, `role_permissions`, `audit_logs`.
- **Données personnelles privées par défaut** : un utilisateur ne peut lire que ses propres données.
- **Contrôle côté serveur** : les politiques RLS sont appliquées par PostgreSQL/Supabase, pas seulement par le frontend.
- **auth.uid()** est utilisé pour vérifier la propriété des données.

## Tables et politiques

### 1. `profiles`

| Politique | Type | Rôle cible | Condition |
|-----------|------|------------|-----------|
| `Les utilisateurs lisent leur propre profil` | SELECT | `authenticated` | `auth.uid() = id` |
| `Les administrateurs lisent tous les profils` | SELECT | `authenticated` | `EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))` |
| `Les utilisateurs mettent à jour leur propre profil` | UPDATE | `authenticated` | `auth.uid() = id` (USING + WITH CHECK) |

### 2. `user_roles`

| Politique | Type | Rôle cible | Condition |
|-----------|------|------------|-----------|
| `Les utilisateurs lisent leurs propres rôles` | SELECT | `authenticated` | `auth.uid() = user_id` |
| `Les administrateurs lisent tous les rôles` | SELECT | `authenticated` | `EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))` |

**Note :** Aucun INSERT / UPDATE / DELETE n'est autorisé directement depuis le client sur `user_roles`. La gestion des rôles se fait exclusivement côté serveur (procédure stockée ou edge function).

### 3. `role_permissions`

| Politique | Type | Rôle cible | Condition |
|-----------|------|------------|-----------|
| `Lecture des permissions par tous les authentifiés` | SELECT | `authenticated` | `true` (lecture publique pour l'UI) |

**Note :** Aucun écriture côté client.

### 4. `audit_logs`

| Politique | Type | Rôle cible | Condition |
|-----------|------|------------|-----------|
| `Les administrateurs lisent les journaux d'audit` | SELECT | `authenticated` | `EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))` |

**Note :** Aucun écriture côté client. Les journaux sont écrits par le serveur ou des triggers.

## Triggers

1. `on_auth_user_created` : après insertion dans `auth.users`, crée automatiquement une ligne dans `profiles` avec le rôle `'user'`.
2. `update_profiles_updated_at` : met à jour automatiquement `updated_at` avant chaque mise à jour de `profiles`.

## Tests recommandés (Phase 6)

Ces tests doivent être exécutés contre une instance Supabase réelle avec la migration appliquée :

```sql
-- Test 1 : Un utilisateur ne peut pas lire le profil d'un autre utilisateur
-- (Exécuter avec l'UID de l'utilisateur A, tenter de SELECT sur le profil de B)
SELECT * FROM profiles WHERE id = '<UID_utilisateur_B>';
-- Résultat attendu : 0 lignes

-- Test 2 : Un utilisateur peut lire son propre profil
SELECT * FROM profiles WHERE id = auth.uid();
-- Résultat attendu : 1 ligne

-- Test 3 : Un utilisateur ne peut pas modifier son rôle
UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
-- Résultat attendu : erreur RLS (politique UPDATE restreinte aux propres données, mais role n'est pas modifiable via cette politique)

-- Test 4 : Un administrateur peut lire tous les profils
-- (Exécuter avec l'UID d'un admin)
SELECT count(*) FROM profiles;
-- Résultat attendu : nombre total de profils

-- Test 5 : Un utilisateur ordinaire ne peut pas lire audit_logs
SELECT * FROM audit_logs LIMIT 1;
-- Résultat attendu : 0 lignes (ou erreur)
```

## Fichiers associés

- `supabase/migrations/001_initial_schema.sql` : migration complète avec tables, index, RLS, triggers, permissions par défaut.
- `client/src/hooks/useAuth.js` : hook d'authentification frontend (utilise `auth.uid()` côté Supabase).
- `client/src/types/roles.js` : définition des rôles côté client (affichage uniquement, pas de contrôle d'accès).
