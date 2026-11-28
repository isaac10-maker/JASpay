import { useState } from 'react';
import { Link } from 'react-router-dom';
import BackButton from '../components/BackButton';
import { useAuth } from '../context/AuthContext';
import { messageErreurAuth } from '../utils/authErrors';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err } = await resetPassword(email);
      if (err) {
        setError(messageErreurAuth(err, 'reinitialisation'));
      } else {
        setSentTo(email.trim());
      }
    } catch (err) {
      setError(messageErreurAuth(err, 'reinitialisation'));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-900 px-4 py-24">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-success-600 rounded-lg mb-4">
            <span className="text-white font-bold text-xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Vérifiez votre boîte e-mail</h1>
          <p className="text-gray-300 mt-2">
            Si un compte existe pour <span className="font-medium break-all">{sentTo}</span>, vous allez
            recevoir un lien pour choisir un nouveau mot de passe. Pensez à regarder dans vos courriers
            indésirables.
          </p>
          <Link to="/login" className="mt-6 btn-primary w-full inline-block text-center">
            Retour à la connexion
          </Link>
          <button
            type="button"
            onClick={() => setSentTo('')}
            className="mt-4 text-sm text-gray-400 hover:text-electric-400 underline"
          >
            Renvoyer avec une autre adresse
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-space-900 px-4 py-6">
      {/* Le bouton reste en haut a gauche : hors du conteneur centre, sinon il
          serait place au milieu du panneau et non en tete de page. */}
      <div className="relative z-10 max-w-md mx-auto">
        <BackButton to="/login" label="Retour a la connexion" />
      </div>
      <div className="min-h-[70vh] flex items-center justify-center">
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
            <label className="label-text" htmlFor="forgot-email">Adresse e-mail</label>
            <input
              id="forgot-email"
              type="email"
              className="input-field input-field-dark"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          Vous vous souvenez de votre mot de passe ?{' '}
          <Link to="/login" className="text-electric-400 font-medium hover:underline">
            Connectez-vous
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
