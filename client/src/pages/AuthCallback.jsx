import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { messageErreurAuth } from '../utils/authErrors';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // IMPORTANT : `supabase.js` configure `detectSessionInUrl: true`.
    // Supabase-js echange donc DEJA le code OAuth / de confirmation au chargement
    // de la page. Appeler exchangeCodeForSession() ici reviendrait a echanger
    // deux fois le meme code : la seconde tentative echoue ("code already used")
    // et affiche une erreur alors que le compte a bien ete cree.
    //
    // On se contente donc de LIRE la session deja etablie par la librairie.
    const handleAuthCallback = async () => {
      try {
        const { data, error: err } = await supabase.auth.getSession();

        if (err) {
          setError(messageErreurAuth(err, 'connexion'));
          setLoading(false);
          return;
        }

        // detectSessionInUrl peut avoir besoin d'un court instant pour traiter
        // l'URL. On retente une fois avant de conclure a l'echec.
        let session = data?.session;
        if (!session) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const retry = await supabase.auth.getSession();
          session = retry.data?.session;
        }

        if (session?.user) {
          setMessage(
            'Votre compte a été confirmé avec succès ! Vous pouvez maintenant vous connecter.'
          );
          setLoading(false);
          // Redirection automatique vers login après 3 secondes
          setTimeout(() => {
            navigate('/login');
          }, 3000);
        } else {
          setError(
            "Aucune session n'a pu être établie. Le lien a peut-être expiré ou a déjà été utilisé."
          );
          setLoading(false);
        }
      } catch (err) {
        setError(messageErreurAuth(err, 'connexion'));
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-space-900 px-4">
      <div className="max-w-md w-full glass-panel p-8 md:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-marine-900 rounded-2xl mb-6 border border-white/20">
          {loading ? (
            <svg className="w-8 h-8 text-electric-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : error ? (
            <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M60 12V9c0-1.1-.9-2-2-2H48c-1.1 0-2 .9-2 2v13a2 2 0 002 2h10a2 2 0 002-2v-4m-24 13l-3-3h6l-3 3z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">
          {loading ? 'Confirmation en cours...' : error ? 'Erreur de confirmation' : 'Compte confirmé'}
        </h1>
        {error ? (
          <div className="mb-6 p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
            {error}
          </div>
        ) : (
          <p className="text-gray-300 mb-6">{message}</p>
        )}
        {!loading && !error && (
          <button
            onClick={() => navigate('/login')}
            className="btn-primary w-full"
          >
            Se connecter
          </button>
        )}
        <p className="mt-6 text-xs text-gray-500">
          Si vous ne serez pas redirigé automatiquement, cliquez sur le bouton ci-dessus.
        </p>
      </div>
    </div>
  );
}
