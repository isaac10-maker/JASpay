/**
 * jaspay-rate-limit — Edge Function de limitation de tentatives d'authentification.
 *
 * Règles :
 * - 3 tentatives maximales par adresse e-mail sur une fenêtre de 5 minutes.
 * - Au-delà, retourne HTTP 429 avec le message : "Trop de tentatives erronées, ressayez dans 5min"
 *
 * Ce service est appelé côté serveur uniquement. Aucune information de rate limiting
 * n'est exposée au frontend au-delà du message d'erreur affiché.
 *
 * Persistance : utilise une table `rate_limit_attempts` créée automatiquement si absente.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_ATTEMPTS = 3;
const WINDOW_MINUTES = 5;

async function ensureTableExists() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS rate_limit_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        attempt_type TEXT NOT NULL DEFAULT 'login',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ip_address TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_rate_limit_email_created
        ON rate_limit_attempts (email, created_at);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_type_created
        ON rate_limit_attempts (attempt_type, created_at);
    `
  });
  if (error) {
    console.error('[rate-limit] Erreur création table :', error.message);
  }
}

async function countAttempts(email, attemptType) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('rate_limit_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .eq('attempt_type', attemptType)
    .gte('created_at', windowStart);

  if (error) {
    console.error('[rate-limit] Erreur comptage :', error.message);
    return 0;
  }

  return data ? data.length : 0;
}

async function recordAttempt(email, attemptType, ipAddress) {
  await supabase
    .from('rate_limit_attempts')
    .insert({ email, attempt_type: attemptType, ip_address: ipAddress });
}

export async function handler(req) {
  // CORS préflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await ensureTableExists();

    const { email, attempt_type = 'login' } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Adresse e-mail requise' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';

    // Compter les tentatives récentes
    const attemptCount = await countAttempts(email, attempt_type);

    if (attemptCount >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({
          error: 'Trop de tentatives erronées, ressayez dans 5min',
          status: 429,
          retry_after: WINDOW_MINUTES * 60,
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Enregistrer la tentative
    await recordAttempt(email, attempt_type, ipAddress);

    return new Response(
      JSON.stringify({ ok: true, remaining: MAX_ATTEMPTS - attemptCount - 1 }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[rate-limit] Erreur interne :', err.message);
    return new Response(
      JSON.stringify({ error: 'Erreur interne du serveur' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
