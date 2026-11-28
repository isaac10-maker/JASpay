import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../lib/rateLimit';
import { messageErreurAuth, isEmailNotConfirmed } from '../utils/authErrors';
import PasswordToggle from '../components/PasswordToggle';
import GoogleButton from '../components/GoogleButton';
import ResendConfirmation from '../components/ResendConfirmation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('');
  const { signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setRateLimitError('');
    setUnconfirmedEmail('');
    setLoading(true);

    const cleanEmail = email.trim();

    try {
      // 1. Vérifier le rate limiting AVANT toute tentative Supabase
      const rateLimit = await checkRateLimit(cleanEmail, 'login');
      if (!rateLimit.allowed) {
        setRateLimitError(rateLimit.error);
        return;
      }

      // 2. Tentative d'authentification.
      //    En cas de succès, PublicOnlyRoute redirige automatiquement vers l'accueil.
      const { error: err } = await signIn(cleanEmail, password);

      if (!err) {
        await resetRateLimit(cleanEmail, 'login');
        return;
      }

      // Mot de passe correct mais e-mail non confirmé : ce n'est pas un échec de mot de passe.
      if (isEmailNotConfirmed(err)) {
        setUnconfirmedEmail(cleanEmail);
        return;
      }

      // 3. Échec réel : incrémente le compteur
      const rec = await recordFailedAttempt(cleanEmail, 'login');

      if (rec.blocked) {
        setRateLimitError(rec.error);
      } else if (err.status === 429 || (err.message || '').includes('Too many attempts')) {
        setRateLimitError('Trop de tentatives erronées, ressayez dans 5min');
      } else {
        const suffix =
          typeof rec.remaining === 'number' ? ` Tentatives restantes : ${rec.remaining}.` : '';
        setError(messageErreurAuth(err, 'connexion') + suffix);
      }
    } catch (err) {
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

        {/* E-mail non confirmé : proposer le renvoi */}
        {unconfirmedEmail && (
          <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500/40 rounded-lg space-y-3">
            <p className="text-sm text-white">
              Votre adresse e-mail <span className="font-medium">{unconfirmedEmail}</span> n'est pas
              encore confirmée. Cliquez sur le lien reçu par e-mail, ou demandez un nouvel envoi.
            </p>
            <ResendConfirmation email={unconfirmedEmail} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <GoogleButton label="Se connecter avec Google" disabled={loading || !!rateLimitError} />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-xs text-gray-400">ou par e-mail</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          <div>
            <label className="label-text" htmlFor="login-email">Adresse e-mail</label>
            <input
              id="login-email"
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
          Vous n'avez pas encore de compte ?{' '}
          <Link to="/register" className="text-electric-400 font-medium hover:underline">
            Créez votre compte
          </Link>
        </p>

        <p className="mt-4 text-center text-sm text-gray-400">
          <Link to="/forgot-password" className="text-electric-400 font-medium hover:underline">
            Mot de passe oublié ?
          </Link>
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
