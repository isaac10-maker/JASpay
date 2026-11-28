import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initialUrlAuthError } from '../lib/supabase';
import { messageErreurAuth, messageErreurLien } from '../utils/authErrors';
import PasswordToggle from '../components/PasswordToggle';
import BackButton from '../components/BackButton';
import { FullScreenLoader } from '../components/RouteGuards';

/**
 * Page ouverte depuis le lien « mot de passe oublié ».
 * Le lien contient un jeton de récupération que Supabase transforme en session :
 * tant qu'il n'y a pas de session, le lien est invalide ou expiré.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading: authLoading, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) setError(messageErreurAuth(err, 'reinitialisation'));
      else setSuccess(true);
    } catch (err) {
      setError(messageErreurAuth(err, 'reinitialisation'));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <FullScreenLoader />;

  if (!user) {
    return (
      <div className="min-h-screen bg-space-900 px-4 py-6">
        <div className="relative z-10 max-w-md mx-auto">
          <BackButton to="/forgot-password" label="Retour" />
        </div>
        <div className="min-h-[70vh] flex items-center justify-center">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-danger/20 rounded-lg mb-4">
            <span className="text-danger font-bold text-xl">!</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Lien invalide</h1>
          <p className="text-gray-300 mt-2">
            {initialUrlAuthError
              ? messageErreurLien(initialUrlAuthError)
              : 'Le lien de réinitialisation est invalide ou a expiré. Veuillez en demander un nouveau.'}
          </p>
          <Link to="/forgot-password" className="mt-6 btn-primary w-full inline-block text-center">
            Demander un nouveau lien
          </Link>
        </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-space-900 px-4 py-6">
        <div className="relative z-10 max-w-md mx-auto">
          <BackButton to="/" label="Retour a l'accueil" />
        </div>
        <div className="min-h-[70vh] flex items-center justify-center">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-success-600 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Mot de passe mis à jour</h1>
          <p className="text-gray-300 mt-2">Votre nouveau mot de passe est enregistré. Vous êtes connecté.</p>
          <button type="button" onClick={() => navigate('/', { replace: true })} className="mt-6 btn-primary w-full">
            Continuer
          </button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-space-900 px-4 py-24">
      <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-marine-900 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">J</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Nouveau mot de passe</h1>
          <p className="text-gray-300 mt-2">Choisissez un nouveau mot de passe pour {user.email}.</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-text">Nouveau mot de passe</label>
            <PasswordToggle
              value={password}
              onChange={setPassword}
              placeholder="8 caractères minimum"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={loading}
            />
          </div>

          <div>
            <label className="label-text">Confirmer le nouveau mot de passe</label>
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

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Mise à jour...' : 'Enregistrer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
