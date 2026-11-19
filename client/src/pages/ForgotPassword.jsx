import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: err } = await resetPassword(email);
      if (err) {
        setError(err.message || 'Une erreur est survenue lors de l\'envoi de l\'email.');
      } else {
        setSent(true);
        setEmail('');
      }
    } catch (err) {
      setError(err.message || 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-900 px-4">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-success-600 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Email envoyé</h1>
          <p className="text-gray-300 mt-2">
            Si un compte existe pour cette adresse, vous avez reçu un email avec un lien
            pour réinitialiser votre mot de passe.
          </p>
          <button
            onClick={() => window.location.assign('/login')}
            className="mt-6 btn-primary w-full"
          >
            Retour à la connexion
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
          <h1 className="text-2xl font-bold text-white">Mot de passe oublié</h1>
          <p className="text-gray-300 mt-2">
            Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.
          </p>
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

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
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
