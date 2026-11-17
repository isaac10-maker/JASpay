# JASpay — Phase 3 : Plan de tests avec vrais JWT

**Date** : 2026-11-16  
**Statut** : Plan de test préparé — tests non encore exécutés (nécessite un environnement Supabase réel avec credentials de production)  
**Contrainte** : Aucun test ne peut être prétendu "réussi" sans exécution réelle avec de vrais JWT obtenus après authentification Supabase.

---

## 1. Prérequis d'exécution

Avant tout test, l'environnement suivant doit être disponible :

1. Une instance Supabase avec les migrations 001-004 appliquées
2. Un serveur backend Node.js démarré sur `http://localhost:3001` avec `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` configurés
3. Un super admin existant (créé via `create_first_super_admin()`)
4. Des utilisateurs de test créés via Supabase Auth avec des rôles attribués dans `user_roles`

---

## 2. Comptes de test à créer

| Compte | Email | Rôle | Mot de passe | Usage |
|--------|-------|------|--------------|-------|
| Super Admin | super-admin@jaspay.test | super_admin | TestPass123! | Opérations globales |
| Admin | admin@jaspay.test | admin | TestPass123! | Opérations limitées |
| Agent | agent@jaspay.test | agent | TestPass123! | Traitement transactions |
| Modérateur | moderator@jaspay.test | moderator | TestPass123! | Lecture config + annonces |
| Utilisateur | user@jaspay.test | user | TestPass123! | Aucun accès admin |

Chaque compte doit obtenir un JWT réel via `supabase.auth.signInWithPassword({ email, password })`.

---

## 3. Cas de test détaillés

### 3.1 Authentification et contrôle d'accès

| # | Cas de test | Utilisateur | Endpoint | Méthode | Résultat attendu |
|---|-------------|-------------|----------|---------|------------------|
| T1 | Accès dashboard stats | Super admin | `/api/admin/stats` | GET | 200 + stats |
| T2 | Accès dashboard stats | Admin | `/api/admin/stats` | GET | 200 + stats |
| T3 | Accès dashboard stats | Agent | `/api/admin/stats` | GET | 403 |
| T4 | Accès dashboard stats | User | `/api/admin/stats` | GET | 403 |
| T5 | Accès sans token | Aucun | `/api/admin/stats` | GET | 401 |
| T6 | Token expiré | Tout utilisateur | `/api/admin/stats` | GET | 401 |

### 3.2 Gestion des utilisateurs

| # | Cas de test | Utilisateur | Endpoint | Méthode | Résultat attendu |
|---|-------------|-------------|----------|---------|------------------|
| T7 | Liste utilisateurs | Super admin | `/api/admin/users` | GET | 200 + liste |
| T8 | Liste utilisateurs | Admin | `/api/admin/users` | GET | 200 + liste |
| T9 | Liste utilisateurs | User | `/api/admin/users` | GET | 403 |
| T10 | Suspendre utilisateur | Super admin | `/api/admin/users/:id/suspend` | POST | 200 + is_active=false |
| T11 | Suspendre utilisateur | Admin | `/api/admin/users/:id/suspend` | POST | 200 + is_active=false |
| T12 | Suspendre super_admin par admin | Admin | `/api/admin/users/:id/suspend` | POST | 403 |
| T13 | Se suspendre soi-même | Super admin | `/api/admin/users/:id/suspend` | POST | 400 |
| T14 | Réactiver utilisateur | Super admin | `/api/admin/users/:id/reactivate` | POST | 200 + is_active=true |
| T15 | Supprimer utilisateur | Super admin | `/api/admin/users/:id` | DELETE | 200 |
| T16 | Supprimer utilisateur | Admin | `/api/admin/users/:id` | DELETE | 403 |
| T17 | Supprimer dernier super_admin | Super admin | `/api/admin/users/:id` | DELETE | 400 |
| T18 | Supprimer super_admin par admin | Admin | `/api/admin/users/:id` | DELETE | 403 |

### 3.3 Gestion des rôles

| # | Cas de test | Utilisateur | Endpoint | Méthode | Résultat attendu |
|---|-------------|-------------|----------|---------|------------------|
| T19 | Attribuer rôle agent | Super admin | `/api/admin/users/:id/roles` | POST | 200 + role=agent |
| T20 | Attribuer rôle super_admin | Admin | `/api/admin/users/:id/roles` | POST | 403 |
| T21 | Attribuer rôle super_admin | Super admin | `/api/admin/users/:id/roles` | POST | 200 + role=super_admin |
| T22 | Révoquer rôle super_admin | Admin | `/api/admin/users/:id/roles/super_admin` | DELETE | 403 |
| T23 | Révoquer rôle super_admin | Super admin | `/api/admin/users/:id/roles/super_admin` | DELETE | 200 |
| T24 | Élévation de privilèges | User | `/api/admin/users/:id/roles` | POST | 403 |

### 3.4 Espace agent (transactions)

| # | Cas de test | Utilisateur | Endpoint | Méthode | Résultat attendu |
|---|-------------|-------------|----------|---------|------------------|
| T25 | Voir transactions assignées | Agent | `/api/agent/transactions` | GET | 200 + transactions avec assigned_agent_id = agent |
| T26 | Voir transactions non assignées | Agent | `/api/agent/transactions` | GET | 200 (vide ou transactions non assignées) |
| T27 | Valider transaction assignée | Agent | `/api/agent/transactions/:id/process` | POST | 200 + status=completed |
| T28 | Valider transaction non assignée | Agent | `/api/agent/transactions/:id/process` | POST | 403 |
| T29 | Double validation (déjà complétée) | Agent | `/api/agent/transactions/:id/process` | POST | 400 |
| T30 | Assigner transaction | Admin | `/api/admin/transactions/:id/assign` | POST | 200 + assigned_agent_id |
| T31 | Accès agent à routes config | Agent | `/api/admin/settings` | GET | 403 |

### 3.5 Configuration plateforme

| # | Cas de test | Utilisateur | Endpoint | Méthode | Résultat attendu |
|---|-------------|-------------|----------|---------|------------------|
| T32 | Lire bookmakers | Super admin | `/api/admin/bookmakers` | GET | 200 |
| T33 | Lire bookmakers | Moderator | `/api/admin/bookmakers` | GET | 200 |
| T34 | Créer bookmaker | Super admin | `/api/admin/bookmakers` | POST | 200 |
| T35 | Créer bookmaker | Agent | `/api/admin/bookmakers` | POST | 403 |
| T36 | Créer opérateur | Admin | `/api/admin/payment-providers` | POST | 200 |
| T37 | Créer paramètre | Super admin | `/api/admin/settings` | POST | 200 |
| T38 | Modification paramètre non public | Super admin | `/api/admin/settings` | POST | 200 |

### 3.6 Annonces

| # | Cas de test | Utilisateur | Endpoint | Méthode | Résultat attendu |
|---|-------------|-------------|----------|---------|------------------|
| T39 | Lire annonces | Super admin | `/api/admin/announcements` | GET | 200 |
| T40 | Créer annonce | Super admin | `/api/admin/announcements` | POST | 200 |
| T41 | Modifier annonce | Super admin | `/api/admin/announcements/:id` | PUT | 200 |
| T42 | Archiver annonce | Super admin | `/api/admin/announcements/:id` | DELETE | 200 |
| T43 | Archiver annonce | Admin | `/api/admin/announcements/:id` | DELETE | 403 |
| T44 | Créer annonce | Agent | `/api/admin/announcements` | POST | 403 |

### 3.7 Surveillance et audit

| # | Cas de test | Utilisateur | Endpoint | Méthode | Résultat attendu |
|---|-------------|-------------|----------|---------|------------------|
| T45 | Lire audit logs | Super admin | `/api/admin/audit-logs` | GET | 200 + logs |
| T46 | Lire audit logs | Admin | `/api/admin/audit-logs` | GET | 200 + logs |
| T47 | Lire audit logs | Agent | `/api/admin/audit-logs` | GET | 403 |
| T48 | Lire sessions admin | Super admin | `/api/admin/sessions` | GET | 200 + sessions |
| T49 | Lire sessions admin | Admin | `/api/admin/sessions` | GET | 403 |
| T50 | Révoquer session | Super admin | `/api/admin/sessions/:id` | DELETE | 200 |
| T51 | Pas de token/mot de passe dans logs | Tout | `/api/admin/audit-logs` | GET | Aucun champ password/token dans la réponse |

### 3.8 Protection côté serveur (indépendamment du frontend)

| # | Cas de test | Méthode | Résultat attendu |
|---|-------------|---------|------------------|
| T52 | Rôle depuis user_metadata ignoré | Requête avec user_metadata.role=falsifié | 403 si user_roles ne contient pas le rôle |
| T53 | Rôle depuis localStorage ignoré | Requête avec token valide mais rôle falsifié côté client | 403 si le backend ne trouve pas le rôle en DB |
| T54 | RLS protège admin_actions | Requête directe via client supabase (anon key) | 42501 (accès refusé) |
| T55 | RLS protège platform_settings | Requête directe via client supabase (anon key) | 42501 pour écriture |
| T56 | RLS protège announcements | Requête directe via client supabase (anon key) | 42501 pour écriture |

### 3.9 Journalisation des actions sensibles

| # | Cas de test | Vérification |
|---|-------------|--------------|
| T57 | Suspension utilisateur journalisée | Entrée dans admin_actions avec action_type='suspend_user' |
| T58 | Attribution rôle journalisée | Entrée avec action_type='assign_role' |
| T59 | Configuration modifiée journalisée | Entrée avec action_type='config_change' |
| T60 | Annonce créée journalisée | Entrée avec action_type='create_announcement' |
| T61 | Transaction validée journalisée | Entrée dans transaction_events + admin_actions |
| T62 | Aucun mot de passe dans détails | Le champ `details` ne contient jamais password/token |

---

## 4. Procédure d'exécution

Pour chaque test :

1. Obtenir un JWT réel : `supabase.auth.signInWithPassword({ email, password })`
2. Appeler l'endpoint avec `Authorization: Bearer <JWT>`
3. Vérifier le code de statut HTTP et le corps de la réponse
4. Pour les tests de journalisation, vérifier la table `admin_actions` après l'action
5. Documenter le résultat (réussi/échec) avec la réponse exacte

---

## 5. Résultat attendu global

Tous les tests T1-T62 doivent retourner le résultat attendu. Aucun test ne doit retourner 200 pour une opération non autorisée.

**IMPORTANT** : Ce plan n'a pas encore été exécuté. L'exécution nécessite un accès à l'instance Supabase de production et aux credentials d'authentification.
