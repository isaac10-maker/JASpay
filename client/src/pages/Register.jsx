import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { messageErreurAuth } from '../utils/authErrors';
import PasswordToggle from '../components/PasswordToggle';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { signUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    if (!termsAccepted) {
      setError('Vous devez accepter les conditions d\'utilisation et la politique de confidentialité.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: err } = await signUp(email, password);
      if (err) {
        setError(messageErreurAuth(err, 'inscription'));
      } else {
        setSuccess(true);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError(messageErreurAuth(err, 'inscription'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-900 px-4">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-success-600 rounded-full mb-6 shadow-[0_0_20px_rgba(22,163,74,0.4)]">
          <span className="text-white font-bold text-2xl">✓</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">Compte créé avec succès</h1>
        <div className="bg-blue-500/20 border border-blue-500/40 rounded-xl p-6 mb-6 text-left">
          <p className="text-blue-400 font-medium mb-2">Vérifiez votre boîte e-mail</p>
          <p className="text-sm text-white mb-2">
            Un e-mail de confirmation a été envoyé à <span className="text-blue-100 font-medium">{email}</span>.
          </p>
          <p className="text-sm text-blue-50">
            Cliquez sur le lien dans l'e-mail pour activer votre compte avant de pouvoir vous connecter.
          </p>
        </div>
        <button
          onClick={() => window.location.assign('/login')}
          className="btn-primary w-full mb-4"
        >
          Se connecter
        </button>
        <button
          onClick={() => window.location.assign('/login')}
          className="btn-secondary w-full text-sm"
        >
          Je possède déjà un compte
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-space-900 px-4">
      <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-marine-900 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">J</span>
          </div>
          <h1 className="text-2xl font-bold text-white">JASpay</h1>
          <p className="text-gray-300 mt-2">Création de votre compte</p>
        </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              disabled={loading}
            />
          </div>

          <div>
            <label className="label-text">Confirmer le mot de passe</label>
            <PasswordToggle
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={loading}
            />
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="terms"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              required
              className="w-4 h-4 text-electric-500 bg-white/10 border-white/20 rounded focus:ring-electric-500"
            />
            <label htmlFor="terms" className="text-sm text-gray-300 leading-relaxed">
              J'accepte les <a href="/cgu" className="text-electric-400 hover:underline">Conditions Générales d'Utilisation</a> et la <a href="/confidentialite" className="text-electric-400 hover:underline">Politique de Confidentialité</a>.
            </label>
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || !termsAccepted}
          >
            {loading ? 'Création en cours...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-gray-400">
          Vous avez déjà un compte ?
          <a href="/login" className="text-electric-400 font-medium hover:underline">
            Connectez-vous
          </a>
        </p>

        <div className="mt-8 pt-6 border-t border-white/20">
          <p className="text-xs text-gray-500 text-center">
            En créant un compte, vous acceptez les conditions d'utilisation et la politique de confidentialité de JASpay.
            Votre adresse e-mail doit être confirmée avant la première connexion.
          </p>
        </div>
      </div>
    </div>
  );
}
