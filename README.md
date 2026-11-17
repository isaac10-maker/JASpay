# JASpay

Application web de gestion des dépôts, retraits et recharges de comptes sur les plateformes de paris sportifs.
Première implantation : Togo. Expansion prévue en Afrique de l'Ouest.

## Stack technique

- **Frontend** : React.js + Vite + Tailwind CSS
- **Backend** : Node.js (API sécurisée)
- **Base de données** : PostgreSQL (via Supabase)
- **Authentification** : Supabase Auth
- **Sécurité** : Row Level Security (RLS) sur toutes les tables
- **Hébergement frontend** : Vercel
- **Dépôt source** : GitHub

## Identité visuelle

- Bleu marine profond, bleu électrique modéré, blanc cassé, gris clair
- Vert discret pour les opérations validées, rouge pour les erreurs
- Glassmorphism modéré, arrière-plan dynamique avec visuels sportifs interchangeables

## Structure du projet

```
JASpay/
├── client/                 # Frontend React + Vite + Tailwind (Vercel)
├── server/                 # API Node.js sécurisée
├── supabase/               # Migrations SQL, politiques RLS, seed
├── docs/                   # Documentation technique
├── .env.example            # Variables d'environnement (sans secrets)
├── .gitignore
└── README.md
```

## Installation et démarrage (Phase 1 — Fondation)

### Prérequis

- Node.js ≥ 20
- Un projet Supabase (https://supabase.com)

### 1. Cloner le dépôt

```bash
git clone https://github.com/isaac10-maker/JASpay.git
cd JASpay
```

### 2. Configurer les variables d'environnement

```bash
# Copier le fichier d'exemple
cp .env.example .env
cp client/.env.example client/.env.local

# Éditer .env.local avec vos valeurs Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
```

⚠️ **Ne jamais committer de valeurs réelles dans `.env` ou `.env.local`.**

### 3. Installer les dépendances

```bash
cd client
npm install
```

### 4. Appliquer la migration Supabase

Dans l'interface SQL de votre projet Supabase, exécuter le contenu de :
`supabase/migrations/001_initial_schema.sql`

### 5. Démarrer le serveur de développement

```bash
cd client
npm run dev
```

L'application sera accessible sur `http://localhost:5173`.

## Fonctionnalités Phase 1 (Foundation)

- [x] Initialisation React + Vite + Tailwind
- [x] Architecture des dossiers (client, server, supabase, docs)
- [x] Configuration Supabase (client JS)
- [x] Inscription avec email et mot de passe (Supabase Auth)
- [x] Confirmation email obligatoire
- [x] Connexion et déconnexion
- [x] Gestion sécurisée des profils (liés à auth.users)
- [x] RLS initial sur profiles, user_roles, role_permissions, audit_logs
- [x] Protection des routes (AuthGuard, ProtectedRoute)
- [x] Première interface responsive avec identité visuelle JASpay
- [x] Fichier `.env.example` sans secrets
- [x] `.gitignore` excluant `.env`, `node_modules`, `dist`

## Sécurité

- Aucun secret dans le frontend ni dans les fichiers publics
- Clé `service_role` de Supabase jamais exposée côté client
- RLS activé sur toutes les tables
- Contrôle des rôles côté serveur uniquement
- Données personnelles privées par défaut

## Licence

Privé — JASpay
