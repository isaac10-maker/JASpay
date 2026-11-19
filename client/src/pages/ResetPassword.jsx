import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PasswordToggle from '../components/PasswordToggle';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState('');
  const { signIn } = useAuth();

  useEffect(() => {
    // Récupérer le token depuis l'URL (Supabase reset password flow)
    const searchParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = searchParams.get('access_token') || searchParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      // Valider la session avec le token
      supabase.auth.setSession({ access_token: tokenFromUrl, refresh_token: tokenFromUrl });
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

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
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message || 'Une erreur est survenue lors de la réinitialisation.');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message || 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-900 px-4">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-success-600 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Mot de passe réinitialisé</h1>
          <p className="text-gray-300 mt-2">
            Votre mot de passe a été mis à jour avec succès.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 btn-primary w-full"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-900 px-4">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-danger/20 rounded-lg mb-4">
            <span className="text-danger font-bold text-xl">!</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Lien invalide</h1>
          <p className="text-gray-300 mt-2">
            Le lien de réinitialisation est invalide ou a expiré.
            Veuillez en demander un nouveau.
          </p>
          <button
            onClick={() => navigate('/forgot-password')}
            className="mt-6 btn-primary w-full"
          >
            Demander un nouveau lien
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
          <h1 className="text-2xl font-bold text-white">Nouveau mot de passe</h1>
          <p className="text-gray-300 mt-2">
            Entrez votre nouveau mot de passe.
          </p>
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
              placeholder="••••••••"
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

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Mise à jour en cours...' : 'Mettre à jour le mot de passe'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-gray-400">
          Vous vous souvenez de votre mot de passe ?
          <a href="/login" className="text-electric-400 font-medium hover:underline">
            Connectez-vous
          </a>
        </p>
      </div>
    </div>
  );
}
