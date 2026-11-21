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

// Origine de production autorisée pour les appels CORS depuis le frontend JASpay
const ALLOWED_ORIGIN = 'https://jaspay.vercel.app';

/**
 * Retourne les en-têtes CORS pour une origine donnée.
 * Si l'origine est autorisée, on la reflète dans Access-Control-Allow-Origin
 * et on ajoute Access-Control-Allow-Credentials: true (requis pour les requêtes
 * avec en-tête Authorization).
 */
function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
  };

  if (origin === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

async function ensureTableExists() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `\n      CREATE TABLE IF NOT EXISTS rate_limit_attempts (\n        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n        email TEXT NOT NULL,\n        attempt_type TEXT NOT NULL DEFAULT 'login',\n        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n        ip_address TEXT\n      );\n      CREATE INDEX IF NOT EXISTS idx_rate_limit_email_created\n        ON rate_limit_attempts (email, created_at);\n      CREATE INDEX IF NOT EXISTS idx_rate_limit_type_created\n        ON rate_limit_attempts (attempt_type, created_at);\n    `\n  });
  if (error) {
    console.error('[rate-limit] Erreur création table :', error.message);
  }
}

async function countAttempts(email: string, attemptType: string) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase\n    .from('rate_limit_attempts')\n    .select('*', { count: 'exact', head: true })\n    .eq('email', email)\n    .eq('attempt_type', attemptType)\n    .gte('created_at', windowStart);\n\n  if (error) {\n    console.error('[rate-limit] Erreur comptage :', error.message);\n    return 0;\n  }\n\n  return data ? data.length : 0;\n}\n\nasync function recordAttempt(email: string, attemptType: string, ipAddress: string) {\n  await supabase\n    .from('rate_limit_attempts')\n    .insert({ email, attempt_type: attemptType, ip_address: ipAddress });\n}\n\nexport async function handler(req: Request) {\n  const origin = req.headers.get('origin');\n  const headers = corsHeaders(origin);\n\n  // CORS préflight\n  if (req.method === 'OPTIONS') {\n    return new Response(null, {\n      status: 204,\n      headers,\n    });\n  }\n\n  if (req.method !== 'POST') {\n    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {\n      status: 405,\n      headers: { 'Content-Type': 'application/json', ...headers },\n    });\n  }\n\n  try {\n    await ensureTableExists();\n\n    const { email, attempt_type = 'login' } = await req.json();\n\n    if (!email) {\n      return new Response(\n        JSON.stringify({ error: 'Adresse e-mail requise' }),\n        { status: 400, headers: { 'Content-Type': 'application/json', ...headers } }\n      );\n    }\n\n    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';\n\n    // Compter les tentatives récentes\n    const attemptCount = await countAttempts(email, attempt_type);\n\n    if (attemptCount >= MAX_ATTEMPTS) {\n      return new Response(\n        JSON.stringify({\n          error: 'Trop de tentatives erronées, ressayez dans 5min',\n          status: 429,\n          retry_after: WINDOW_MINUTES * 60,\n        }),\n        {\n          status: 429,\n          headers: { 'Content-Type': 'application/json', ...headers },\n        }\n      );\n    }\n\n    // Enregistrer la tentative\n    await recordAttempt(email, attempt_type, ipAddress);\n\n    return new Response(\n      JSON.stringify({ ok: true, remaining: MAX_ATTEMPTS - attemptCount - 1 }),\n      {\n        status: 200,\n        headers: { 'Content-Type': 'application/json', ...headers },\n      }\n    );\n  } catch (err) {\n    console.error('[rate-limit] Erreur interne :', err.message);\n    return new Response(\n      JSON.stringify({ error: 'Erreur interne du serveur' }),\n      { status: 500, headers: { 'Content-Type': 'application/json', ...headers } }\n    );\n  }\n}