import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../lib/rateLimit';
import { messageErreurAuth } from '../utils/authErrors';
import PasswordToggle from '../components/PasswordToggle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');
  const { signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setRateLimitError('');
    setLoading(true);

    try {
      // 1. Vérifier le rate limiting AVANT toute tentative Supabase
      const rateLimit = await checkRateLimit(email, 'login');
      if (!rateLimit.allowed) {
        setRateLimitError(rateLimit.error);
        setLoading(false);
        return;
      }

      // 2. Tentative d'authentification
      const { error: err } = await signIn(email, password);

      if (err) {
        // Enregistrer l'échec : incrémente réellement le compteur
        const rec = await recordFailedAttempt(email, 'login');

        if (rec.blocked) {
          setRateLimitError(rec.error);
        } else if (err.status === 429 || (err.message || '').includes('Too many attempts')) {
          setRateLimitError('Trop de tentatives erronées, ressayez dans 5min');
        } else {
          const suffix =
            typeof rec.remaining === 'number'
              ? ` Tentatives restantes : ${rec.remaining}.`
              : '';
          setError(messageErreurAuth(err, 'connexion') + suffix);
        }
      } else {
        // Connexion réussie : on remet le compteur à zéro
        await resetRateLimit(email, 'login');
      }
    } catch (err) {
      await recordFailedAttempt(email, 'login');
      setError(messageErreurAuth(err, 'connexion'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-space-900 px-4">
      <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-marine-900 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">J</span>
          </div>
          <h1 className="text-2xl font-bold text-white">JASpay</h1>
          <p className="text-gray-300 mt-2">Connexion à votre espace personnel</p>
        </div>

        {/* Erreur rate limiting */}
        {rateLimitError && (
          <div className="mb-6 p-4 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg text-center">
            {rateLimitError}
          </div>
        )}

        {/* Erreur classique */}
        {error && (
          <div className="mb-6 p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-text">Adresse e-mail</label>
            <input
              type="email"
              className="input-field input-field-dark"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label-text">Mot de passe</label>
            <PasswordToggle
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={loading || !!rateLimitError}
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || !!rateLimitError}
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-gray-400">
          Vous n'avez pas encore de compte ?
          <a href="/register" className="text-electric-400 font-medium hover:underline">
            Créez votre compte
          </a>
        </p>

        <p className="mt-4 text-center text-sm text-gray-400">
          <a href="/forgot-password" className="text-electric-400 font-medium hover:underline">
            Mot de passe oublié ?
          </a>
        </p>

        <div className="mt-8 pt-6 border-t border-white/20">
          <p className="text-xs text-gray-500 text-center">
            JASpay utilise Supabase Auth pour sécuriser votre connexion.
            Votre mot de passe est haché de manière sécurisée et jamais stocké en clair.
          </p>
        </div>
      </div>
    </div>
  );
}
