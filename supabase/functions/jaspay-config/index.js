/**
 * JASpay — Edge Function : jaspay-config
 * Remplace les routes Express :
 *   GET /api/bookmakers
 *   GET /api/payment-providers
 *   GET /api/payment-methods
 *   GET /api/health
 *
 * Lecture seule, pas de modification d'état.
 * Accessible à tout utilisateur authentifié (RLS protège les données).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async function handler(req) {
  // Gérer le preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Seules les méthodes GET sont autorisées
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Méthode non autorisée' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');

  // Récupérer le token JWT depuis l'en-tête Authorization
  const authHeader = req.headers.get('Authorization');
  let userId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL'),
        Deno.env.get('SUPABASE_ANON_KEY')
      );
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    } catch (err) {
      // Token invalide : continuer sans userId (certaines routes sont publiques en lecture)
    }
  }

  // Client Supabase avec clé anon (RLS s'applique)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_ANON_KEY')
  );

  try {
    // --- GET /api/health ---
    if (path === '/api/health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'jaspay-config' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier l'authentification pour les routes de données
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Authentification requise' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/bookmakers ---
    if (path === '/api/bookmakers') {
      const { data, error } = await supabase
        .from('bookmakers')
        .select('id, name, technical_id, logo_url, is_active, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return new Response(
        JSON.stringify({ bookmakers: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/payment-providers ---
    if (path === '/api/payment-providers') {
      const { data, error } = await supabase
        .from('payment_providers')
        .select('id, name, technical_id, is_active, supports_deposit, supports_withdrawal, ussd_instructions')
        .eq('is_active', true);

      if (error) throw error;
      return new Response(
        JSON.stringify({ providers: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- GET /api/payment-methods ---
    if (path === '/api/payment-methods') {
      const bookmakerId = url.searchParams.get('bookmakerId');

      let query = supabase
        .from('payment_methods')
        .select(`
          id,
          is_active,
          min_amount,
          max_amount,
          fee_percent,
          fee_fixed,
          provider:payment_providers (
            id, name, technical_id, supports_deposit, supports_withdrawal, ussd_instructions
          )
        `)
        .eq('is_active', true);

      if (bookmakerId) {
        query = query.eq('bookmaker_id', bookmakerId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return new Response(
        JSON.stringify({ methods: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route non trouvée' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[jaspay-config] Erreur:', err.message);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}