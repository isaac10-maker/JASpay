-- ===========================================================================
-- JASpay — Acces administrateur par liste blanche d'emails (cote base)
-- ===========================================================================
-- Objectif
--   Les emails administrateurs vivent UNIQUEMENT en base. Aucun email n'est
--   ecrit dans le frontend, ni en dur dans le code des Edge Functions.
--   Des qu'un email de la liste s'inscrit, il recoit automatiquement le role
--   super_admin — avant meme sa premiere connexion.
--
-- Ce que fait ce script
--   1. Table public.admin_whitelist      : la liste des emails autorises.
--   2. Trigger sur auth.users           : attribue super_admin a l'inscription.
--   3. Rattrapage                        : attribue super_admin aux comptes
--                                          de la liste qui existent deja.
--   4. Table public.admin_sessions      : rien a creer, on ajoute seulement
--                                          une fonction d'ouverture de session.
--
-- Securite
--   - admin_whitelist : RLS activee, AUCUNE policy -> illisible et non
--     modifiable par les clients (anon / authenticated). Seul le
--     service_role et les fonctions SECURITY DEFINER y accedent.
--   - Les emails ne sont donc pas exposables via l'API REST publique.
--   - Aucun controle existant n'est retire.
--
-- Idempotent : peut etre rejoue sans erreur ni doublon.
--
-- Etat applique le 2026-11-26 sur le projet gdnluwetyoejfqaeoioa :
--   admin_whitelist               : 2 lignes
--   on_auth_user_whitelisted_admin: trigger actif
--   open_admin_session            : creee, EXECUTE reserve a service_role
--   jaspay-admin-users v3, jaspay-admin-config v3, jaspay-agent v5
-- Verifie : inscription d'un email de la liste -> super_admin + profil,
-- session ouverte (expire 24 h), compte sans role -> refus 42501.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Table : admin_whitelist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_whitelist (
  email      TEXT PRIMARY KEY,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_whitelist IS
  'Liste blanche des emails recevant automatiquement le role super_admin a l''inscription. Aucune policy RLS : acces service_role uniquement.';

-- RLS activee sans aucune policy = refus total pour anon/authenticated.
ALTER TABLE public.admin_whitelist ENABLE ROW LEVEL SECURITY;

-- Defense en profondeur : on retire aussi les privileges par defaut.
REVOKE ALL ON TABLE public.admin_whitelist FROM anon, authenticated;

-- Les emails sont stockes en minuscules pour une comparaison fiable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_whitelist_lower_email
  ON public.admin_whitelist (lower(email));

-- Garde-fou : on force la minuscule a l'insertion.
CREATE OR REPLACE FUNCTION public.admin_whitelist_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_admin_whitelist_normalize ON public.admin_whitelist;
CREATE TRIGGER trg_admin_whitelist_normalize
  BEFORE INSERT OR UPDATE ON public.admin_whitelist
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_whitelist_normalize();

-- ---------------------------------------------------------------------------
-- 2. Les 2 emails administrateurs (SEUL endroit ou ils sont ecrits)
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_whitelist (email, note) VALUES
  ('jasonhome7010@gmail.com', 'Administrateur — acces super_admin automatique'),
  ('kiraamegan10@gmail.com',  'Administrateur — acces super_admin automatique')
ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note;

-- ---------------------------------------------------------------------------
-- 3. Attribution automatique du role a l'inscription
--    Trigger distinct de handle_new_user : on ne modifie pas la creation
--    de profil existante, on ajoute seulement l'attribution du role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_whitelisted_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_whitelisted boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_whitelist w
    WHERE lower(w.email) = lower(NEW.email)
  ) INTO v_whitelisted;

  IF v_whitelisted THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by, assigned_at)
    VALUES (NEW.id, 'super_admin', NULL, now())
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- SECURITY DEFINER : la fonction s'execute avec les droits de son
-- proprietaire (postgres) et peut donc ecrire dans user_roles alors que
-- l'ecriture client y est interdite par RLS.
ALTER FUNCTION public.grant_whitelisted_admin_role() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_whitelisted_admin ON auth.users;
CREATE TRIGGER on_auth_user_whitelisted_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_whitelisted_admin_role();

-- Le trigger tourne en tant que supabase_auth_admin : il lui faut EXECUTE.
GRANT EXECUTE ON FUNCTION public.grant_whitelisted_admin_role() TO supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 4. Rattrapage : les comptes de la liste deja inscrits
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role, assigned_by, assigned_at)
SELECT u.id, 'super_admin', NULL, now()
FROM auth.users u
JOIN public.admin_whitelist w ON lower(w.email) = lower(u.email)
ON CONFLICT (user_id, role) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Sessions administratives : ouverture explicite
--    Les Edge Functions exigent une ligne dans admin_sessions. Aucun code
--    n'en creait. Cette fonction l'ouvre pour un administrateur deja
--    authentifie (appelee par l'Edge Function jaspay-admin-users).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_admin_session(
  p_admin_user_id uuid,
  p_ttl_hours     integer DEFAULT 24,
  p_ip_address    text DEFAULT NULL,
  p_user_agent    text DEFAULT NULL
)
RETURNS TABLE (session_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
-- 'extensions' est indispensable : gen_random_bytes() y vit sur ce projet.
-- Sans lui : ERROR 42883 function gen_random_bytes(integer) does not exist.
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_has_admin_role boolean;
  v_session_id     uuid;
  v_expires_at     timestamptz;
BEGIN
  -- Garde-fou : seuls super_admin / admin peuvent ouvrir une session.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = p_admin_user_id
      AND r.role IN ('super_admin', 'admin')
  ) INTO v_has_admin_role;

  IF NOT v_has_admin_role THEN
    RAISE EXCEPTION 'ACCES_REFUSE: role administrateur requis'
      USING ERRCODE = '42501';
  END IF;

  v_expires_at := now() + make_interval(hours => greatest(coalesce(p_ttl_hours, 24), 1));

  INSERT INTO public.admin_sessions (
    admin_user_id, session_token, ip_address, user_agent, last_activity, expires_at
  ) VALUES (
    p_admin_user_id,
    encode(extensions.gen_random_bytes(32), 'hex'),
    p_ip_address,
    p_user_agent,
    now(),
    v_expires_at
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT v_session_id, v_expires_at;
END;
$function$;

ALTER FUNCTION public.open_admin_session(uuid, integer, text, text) OWNER TO postgres;

-- Privileges : service_role uniquement (appelee par les Edge Functions).
REVOKE ALL ON FUNCTION public.open_admin_session(uuid, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_admin_session(uuid, integer, text, text)
  TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification (a executer apres le COMMIT)
-- ---------------------------------------------------------------------------
SELECT 'admin_whitelist' AS objet, count(*)::text AS valeur FROM public.admin_whitelist
UNION ALL
SELECT 'admins_avec_role', count(*)::text
  FROM public.user_roles WHERE role = 'super_admin'
UNION ALL
SELECT 'sessions_admin_actives', count(*)::text
  FROM public.admin_sessions WHERE revoked_at IS NULL AND expires_at > now();
