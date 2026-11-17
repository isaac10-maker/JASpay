-- =============================================================================
-- JASpay — Migration 003 : Module de transactions (Phase 2)
-- Base de données : PostgreSQL via Supabase
-- Date : 2026-11-16
-- =============================================================================
-- Tables créées :
--   bookmakers          — 1xBet, MelBet, 1Win (configurables depuis l'admin)
--   payment_providers   — Opérateurs Mobile Money (Mixx by Yas, Flooz, Orange Money)
--   payment_methods     — Méthodes de paiement actives/inactives
--   user_saved_numbers  — Numéros Mobile Money enregistrés par l'utilisateur
--   transactions        — Dépôts et retraits (référence unique, statut, agent)
--   transaction_events  — Historique des changements de statut et actions agents
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table : bookmakers
-- Plateformes de paris sportifs supportées.
-- Configurables depuis l'administration (Phase 3).
-- -----------------------------------------------------------------------------
CREATE TABLE bookmakers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                          -- Ex: 1xBet, MelBet, 1Win
  technical_id TEXT NOT NULL UNIQUE,           -- Identifiant technique (ex: 1xbet, melbet, 1win)
  logo_url TEXT,                               -- URL du logo (Supabase Storage ou externe)
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookmakers_technical_id ON bookmakers(technical_id);
CREATE INDEX idx_bookmakers_is_active ON bookmakers(is_active);
CREATE INDEX idx_bookmakers_display_order ON bookmakers(display_order);

-- -----------------------------------------------------------------------------
-- 2. Table : payment_providers
-- Opérateurs de paiement Mobile Money.
-- -----------------------------------------------------------------------------
CREATE TABLE payment_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                          -- Ex: Mixx by Yas, Flooz, Orange Money
  technical_id TEXT NOT NULL UNIQUE,           -- Identifiant technique (ex: mixx, flooz, orange_money)
  is_active BOOLEAN NOT NULL DEFAULT true,
  ussd_instructions TEXT,                      -- Instructions USSD configurables par l'admin (jamais inventées)
  supports_deposit BOOLEAN NOT NULL DEFAULT true,
  supports_withdrawal BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_providers_technical_id ON payment_providers(technical_id);
CREATE INDEX idx_payment_providers_is_active ON payment_providers(is_active);

-- -----------------------------------------------------------------------------
-- 3. Table : payment_methods
-- Liaison bookmaker ↔ opérateur de paiement (configurable).
-- Permet de définir quels opérateurs sont acceptés pour quel bookmaker.
-- -----------------------------------------------------------------------------
CREATE TABLE payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bookmaker_id UUID NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  min_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  max_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  fee_percent DECIMAL(5, 4) NOT NULL DEFAULT 0,      -- Frais en pourcentage (ex: 0.0150 = 1.5%)
  fee_fixed DECIMAL(12, 2) NOT NULL DEFAULT 0,       -- Frais fixes en XOF
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bookmaker_id, provider_id)
);

CREATE INDEX idx_payment_methods_bookmaker ON payment_methods(bookmaker_id);
CREATE INDEX idx_payment_methods_provider ON payment_methods(provider_id);
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active);

-- -----------------------------------------------------------------------------
-- 4. Table : user_saved_numbers
-- Numéros Mobile Money enregistrés par l'utilisateur.
-- Chaque numéro appartient exclusivement à son propriétaire.
-- -----------------------------------------------------------------------------
CREATE TABLE user_saved_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  provider_id UUID REFERENCES payment_providers(id) ON DELETE SET NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_saved_numbers_user_id ON user_saved_numbers(user_id);
CREATE INDEX idx_user_saved_numbers_phone ON user_saved_numbers(phone_number);
CREATE INDEX idx_user_saved_numbers_favorite ON user_saved_numbers(user_id, is_favorite);

-- -----------------------------------------------------------------------------
-- 5. Table : transactions
-- Dépôts et retraits.
-- Les montants utilisent DECIMAL (jamais de FLOAT pour les calculs financiers).
-- La devise XOF est enregistrée explicitement.
-- La référence de transaction est générée côté serveur (jamais par le frontend).
-- -----------------------------------------------------------------------------
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_reference TEXT NOT NULL UNIQUE,       -- Référence unique générée côté serveur
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
  bookmaker_id UUID NOT NULL REFERENCES bookmakers(id) ON DELETE RESTRICT,
  bookmaker_account_id TEXT NOT NULL,               -- Identifiant du compte bookmaker côté utilisateur
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  payment_provider_id UUID REFERENCES payment_providers(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'awaiting_user_action', 'completed', 'rejected', 'cancelled')),
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_reference ON transactions(transaction_reference);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_bookmaker ON transactions(bookmaker_id);
CREATE INDEX idx_transactions_provider ON transactions(payment_provider_id);
CREATE INDEX idx_transactions_agent ON transactions(assigned_agent_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- -----------------------------------------------------------------------------
-- 6. Table : transaction_events
-- Historique immuable des changements de statut et actions des agents.
-- Toute modification de transaction doit être journalisée ici.
-- -----------------------------------------------------------------------------
CREATE TABLE transaction_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- Agent ou système
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,                                                      -- Motif de rejet, commentaire agent, etc.
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_transaction_events_transaction_id ON transaction_events(transaction_id);
CREATE INDEX idx_transaction_events_changed_at ON transaction_events(changed_at);
CREATE INDEX idx_transaction_events_changed_by ON transaction_events(changed_by);

-- -----------------------------------------------------------------------------
-- 7. Trigger : mise à jour automatique de updated_at
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS update_bookmakers_updated_at ON public.bookmakers;
CREATE TRIGGER update_bookmakers_updated_at
  BEFORE UPDATE ON public.bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_providers_updated_at ON public.payment_providers;
CREATE TRIGGER update_payment_providers_updated_at
  BEFORE UPDATE ON public.payment_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_saved_numbers_updated_at ON public.user_saved_numbers;
CREATE TRIGGER update_user_saved_numbers_updated_at
  BEFORE UPDATE ON public.user_saved_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 8. RLS : Activation sur toutes les nouvelles tables
-- -----------------------------------------------------------------------------

ALTER TABLE bookmakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 9. Politiques RLS : bookmakers
-- Lecture : tous les authentifiés peuvent voir les bookmakers actifs
-- Écriture : interdite depuis le client (gérée par l'admin en Phase 3)
-- -----------------------------------------------------------------------------

CREATE POLICY "Lecture des bookmakers actifs"
ON bookmakers
FOR SELECT
TO authenticated
USING (is_active = true);

-- Aucune écriture côté client

-- -----------------------------------------------------------------------------
-- 10. Politiques RLS : payment_providers
-- Lecture : tous les authentifiés peuvent voir les opérateurs actifs
-- Écriture : interdite depuis le client
-- -----------------------------------------------------------------------------

CREATE POLICY "Lecture des opérateurs de paiement actifs"
ON payment_providers
FOR SELECT
TO authenticated
USING (is_active = true);

-- Aucune écriture côté client

-- -----------------------------------------------------------------------------
-- 11. Politiques RLS : payment_methods
-- Lecture : tous les authentifiés peuvent voir les méthodes actives
-- Écriture : interdite depuis le client
-- -----------------------------------------------------------------------------

CREATE POLICY "Lecture des méthodes de paiement actives"
ON payment_methods
FOR SELECT
TO authenticated
USING (is_active = true);

-- Aucune écriture côté client

-- -----------------------------------------------------------------------------
-- 12. Politiques RLS : user_saved_numbers
-- Chaque utilisateur gère uniquement ses propres numéros.
-- -----------------------------------------------------------------------------

CREATE POLICY "Utilisateur lit ses propres numéros enregistrés"
ON user_saved_numbers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Utilisateur insère ses propres numéros enregistrés"
ON user_saved_numbers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Utilisateur met à jour ses propres numéros enregistrés"
ON user_saved_numbers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Utilisateur supprime ses propres numéros enregistrés"
ON user_saved_numbers
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 13. Politiques RLS : transactions
-- Chaque utilisateur lit uniquement ses propres transactions.
-- Un utilisateur ne peut créer que ses propres transactions.
-- Un utilisateur ne peut pas modifier le statut d'une transaction.
-- Les administrateurs et agents ont un accès spécifique (Phase 3).
-- -----------------------------------------------------------------------------

CREATE POLICY "Utilisateur lit ses propres transactions"
ON transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Utilisateur crée ses propres transactions"
ON transactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Un utilisateur peut mettre à jour certains champs de sa propre transaction
-- mais NE JAMAIS le statut ni assigned_agent_id (réservé aux agents/admins)
CREATE POLICY "Utilisateur met à jour ses propres transactions (champs limités)"
ON transactions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (status IS NOT DISTINCT FROM (SELECT status FROM public.transactions WHERE id = NEW.id))
  AND (assigned_agent_id IS NOT DISTINCT FROM (SELECT assigned_agent_id FROM public.transactions WHERE id = NEW.id))
  AND (transaction_type IS NOT DISTINCT FROM (SELECT transaction_type FROM public.transactions WHERE id = NEW.id))
  AND (amount IS NOT DISTINCT FROM (SELECT amount FROM public.transactions WHERE id = NEW.id))
  AND (bookmaker_account_id IS NOT DISTINCT FROM (SELECT bookmaker_account_id FROM public.transactions WHERE id = NEW.id))
);

-- Aucun delete sur transactions depuis le client
CREATE POLICY "Aucun delete sur transactions depuis le client"
ON transactions
FOR DELETE
TO authenticated
USING (false);

-- -----------------------------------------------------------------------------
-- 14. Politiques RLS : transaction_events
-- Lecture : l'utilisateur lit les événements de ses propres transactions.
-- Écriture : interdite depuis le client (gérée par les agents/serveur).
-- -----------------------------------------------------------------------------

CREATE POLICY "Utilisateur lit les événements de ses propres transactions"
ON transaction_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_events.transaction_id
      AND t.user_id = auth.uid()
  )
);

-- Aucun insert/update/delete côté client sur transaction_events
CREATE POLICY "Aucune écriture directe sur transaction_events depuis le client"
ON transaction_events
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- 15. Données de base : bookmakers et payment_providers (seed initial)
-- Ces données sont configurables depuis l'administration (Phase 3).
-- Aucun mot de passe, aucune clé API, aucune intégration simulée.
-- -----------------------------------------------------------------------------

INSERT INTO bookmakers (name, technical_id, logo_url, is_active, display_order) VALUES
  ('1xBet', '1xbet', NULL, true, 1),
  ('MelBet', 'melbet', NULL, true, 2),
  ('1Win', '1win', NULL, true, 3)
ON CONFLICT (technical_id) DO NOTHING;

INSERT INTO payment_providers (name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions) VALUES
  ('Mixx by Yas', 'mixx', true, true, true, NULL),
  ('Flooz', 'flooz', true, true, true, NULL),
  ('Orange Money', 'orange_money', false, true, true, NULL)  -- Désactivé par défaut (activation ultérieure)
ON CONFLICT (technical_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Fin de la migration 003
-- =============================================================================
