import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initialUrlAuthError } from '../lib/supabase';
import { messageErreurLien, isExpiredLink } from '../utils/authErrors';
import ResendConfirmation from '../components/ResendConfirmation';
import BackButton from '../components/BackButton';

/**
 * Page d'arrivée après :
 *   - un clic sur le lien de confirmation d'e-mail ;
 *   - une connexion / inscription avec Google.
 * Supabase lit lui-même les jetons dans l'URL ; on attend simplement que la session soit prête.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [resendEmail, setResendEmail] = useState('');

  const urlError = initialUrlAuthError;
  const status = urlError ? 'error' : loading ? 'loading' : user ? 'success' : 'error';

  useEffect(() => {
    if (status !== 'success') return undefined;
    const t = setTimeout(() => navigate('/', { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [status, navigate]);

  const errorText = urlError
    ? messageErreurLien(urlError)
    : "Ce lien est invalide ou a déjà été utilisé. Si votre compte est déjà confirmé, connectez-vous.";

  return (
    <div className="min-h-screen bg-space-900 px-4 py-6">
      <div className="relative z-10 max-w-md mx-auto">
        <BackButton to="/login" label="Retour a la connexion" />
      </div>
      <div className="min-h-[70vh] flex items-center justify-center">
      <div className="relative z-10 max-w-md w-full glass-panel p-8 md:p-12 text-center">
        {status === 'loading' && (
          <>
            <svg className="w-10 h-10 text-electric-400 animate-spin mx-auto mb-6" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <h1 className="text-2xl font-bold text-white">Vérification en cours...</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-success-600 rounded-full mb-6 shadow-[0_0_20px_rgba(22,163,74,0.4)]">
              <span className="text-white font-bold text-2xl">✓</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Compte confirmé</h1>
            <p className="text-gray-300 mb-6">Vous êtes connecté. Redirection en cours...</p>
            <button type="button" onClick={() => navigate('/', { replace: true })} className="btn-primary w-full">
              Continuer
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-danger/20 rounded-full mb-6">
              <span className="text-danger font-bold text-2xl">!</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Lien non valide</h1>
            <div className="mb-6 p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
              {errorText}
            </div>

            {urlError && isExpiredLink(urlError) && (
              <div className="mb-6 space-y-3 text-left">
                <label className="label-text" htmlFor="resend-email">
                  Recevoir un nouveau lien de confirmation
                </label>
                <input
                  id="resend-email"
                  type="email"
                  className="input-field input-field-dark"
                  placeholder="vous@exemple.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  autoComplete="email"
                />
                <ResendConfirmation email={resendEmail} />
              </div>
            )}

            <Link to="/login" className="btn-primary w-full inline-block text-center">
              Aller à la connexion
            </Link>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
