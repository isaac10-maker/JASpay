import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { messageErreurAuth } from '../utils/authErrors';
import PasswordToggle from '../components/PasswordToggle';
import GoogleButton from '../components/GoogleButton';
import ResendConfirmation from '../components/ResendConfirmation';
import BackgroundRotation from '../components/BackgroundRotation';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState(''); // adresse à laquelle l'e-mail de confirmation a été envoyé
  const { signUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!termsAccepted) {
      setError("Vous devez accepter les conditions d'utilisation et la politique de confidentialité.");
      return;
    }
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
      const { data, error: err, alreadyExists } = await signUp(email, password);
      if (err) {
        setError(messageErreurAuth(err, 'inscription'));
      } else if (alreadyExists) {
        setError('Un compte existe déjà avec cette adresse e-mail. Connectez-vous, ou réinitialisez votre mot de passe si vous l\'avez oublié.');
      } else if (!data?.session) {
        // Confirmation d'e-mail requise : on affiche l'écran « Vérifiez votre boîte e-mail »
        setSentTo(email.trim());
        setPassword('');
        setConfirmPassword('');
      }
      // Si une session existe déjà (confirmation désactivée), PublicOnlyRoute redirige vers l'accueil.
    } catch (err) {
      setError(messageErreurAuth(err, 'inscription'));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <>
      <BackgroundRotation />
      <div className="min-h-screen flex items-center justify-center px-4 py-24">
        <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success-600 rounded-full mb-6 shadow-[0_0_20px_rgba(22,163,74,0.4)]">
            <span className="text-white font-bold text-2xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Vérifiez votre boîte e-mail</h1>
          <div className="bg-blue-500/20 border border-blue-500/40 rounded-xl p-6 mb-6 text-left">
            <p className="text-sm text-white mb-2">
              Un e-mail de confirmation a été envoyé à{' '}
              <span className="text-blue-100 font-medium break-all">{sentTo}</span>.
            </p>
            <p className="text-sm text-blue-50">
              Cliquez sur le lien qu'il contient pour activer votre compte. Si vous ne le voyez pas,
              regardez dans vos courriers indésirables (spam).
            </p>
          </div>

          <ResendConfirmation email={sentTo} initialCooldown={60} />

          <button
            type="button"
            onClick={() => setSentTo('')}
            className="mt-4 text-sm text-gray-400 hover:text-electric-400 underline"
          >
            Mauvaise adresse ? Modifier
          </button>

          <div className="mt-6">
            <Link to="/login" className="btn-primary w-full inline-block text-center">
              Aller à la connexion
            </Link>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
    <BackgroundRotation />
    <div className="min-h-screen flex items-center justify-center px-4 py-24">
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

        <GoogleButton label="S'inscrire avec Google" disabled={loading} />
        <p className="mt-2 text-xs text-gray-500 text-center">
          En continuant avec Google, vous acceptez les{' '}
          <Link to="/cgu" className="text-electric-400 hover:underline">CGU</Link> et la{' '}
          <Link to="/confidentialite" className="text-electric-400 hover:underline">Politique de confidentialité</Link>.
        </p>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/20" />
          <span className="text-xs text-gray-400">ou avec votre e-mail</span>
          <div className="flex-1 h-px bg-white/20" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-text" htmlFor="register-email">Adresse e-mail</label>
            <input
              id="register-email"
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
              placeholder="8 caractères minimum"
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
              className="mt-1 w-4 h-4 text-electric-500 bg-white/10 border-white/20 rounded focus:ring-electric-500"
            />
            <label htmlFor="terms" className="text-sm text-gray-300 leading-relaxed">
              J'accepte les <Link to="/cgu" className="text-electric-400 hover:underline">Conditions Générales d'Utilisation</Link> et la <Link to="/confidentialite" className="text-electric-400 hover:underline">Politique de Confidentialité</Link>.
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

        <p className="mt-6 text-center text-sm text-gray-400">
          Vous avez déjà un compte ?{' '}
          <Link to="/login" className="text-electric-400 font-medium hover:underline">
            Connectez-vous
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}
