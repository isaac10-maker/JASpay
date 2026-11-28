import { createClient } from '@supabase/supabase-js';
import { readUrlAuthError } from '../utils/authErrors';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Variables d\'environnement manquantes : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY requises.'
  );
}

// Lue AVANT la création du client : Supabase peut nettoyer l'URL pendant son initialisation.
// Sert aux pages /auth/callback et /reset-password pour afficher « lien expiré », etc.
export const initialUrlAuthError =
  typeof window !== 'undefined' ? readUrlAuthError(window.location) : null;

// Flux « implicite » (par défaut) : les liens de confirmation d'e-mail fonctionnent même
// s'ils sont ouverts depuis un autre appareil ou navigateur que celui de l'inscription
// (cas courant : lien ouvert depuis l'application Gmail du téléphone).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
