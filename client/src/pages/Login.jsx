import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError(err.message || 'Une erreur est survenue lors de la connexion.');
      }
    } catch (err) {
      setError(err.message || 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-offwhite px-4">
      <div className="max-w-md w-full glass-panel p-8 md:p-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-marine-900 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">J</span>
          </div>
          <h1 className="text-2xl font-bold text-marine-900">JASpay</h1>
          <p className="text-gray-600 mt-2">Connexion à votre espace personnel</p>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mb-6 p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-text">Adresse e-mail</label>
            <input
              type="email"
              className="input-field"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label-text">Mot de passe</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-gray-600">
          Vous n'avez pas encore de compte ?
          <a href="/register" className="text-electric-500 font-medium hover:underline">
            Créez votre compte
          </a>
        </p>

        <p className="mt-4 text-center text-sm text-gray-600">
          <a href="/forgot-password" className="text-electric-500 font-medium hover:underline">
            Mot de passe oublié ?
          </a>
        </p>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            JASpay utilise Supabase Auth pour sécuriser votre connexion.
            Votre mot de passe est haché de manière sécurisée et jamais stocké en clair.
          </p>
        </div>
      </div>
    </div>
  );
}
