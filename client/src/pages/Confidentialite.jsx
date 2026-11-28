import { useAuth } from '../hooks/useAuth';
import BackButton from '../components/BackButton';

export default function Confidentialite() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-space-900 px-4 py-8">
      <nav className="sticky top-0 z-50 -mx-4 mb-4">
        <div className="bg-space-900/80 backdrop-blur-md border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 bg-gradient-to-br from-electric-500 to-marine-900 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(14,165,233,0.4)]">
                  <span className="text-white font-bold text-sm">J</span>
                </div>
                <span className="font-bold text-xl text-white tracking-tight">JASpay</span>
              </div>
              <div className="flex items-center gap-4">
                {user ? (
                  <button
                    onClick={signOut}
                    className="btn-danger text-xs px-3 py-1.5"
                  >
                    Déconnexion
                  </button>
                ) : null}
                <a
                  href="/login"
                  className="text-sm font-medium text-white/60 hover:text-electric-400 transition-colors"
                >
                  Connexion
                </a>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto pt-2 pb-12">
        <BackButton fallback="/" label="Retour" className="mb-4" />
        <div className="glass-panel p-8 md:p-12">
          <h1 className="text-2xl font-bold text-white mb-6">Politique de Confidentialité</h1>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">1. Collecte des données</h2>
          <p className="text-gray-300 mb-4">
            Nous collectons les informations suivantes lors de votre inscription :
            adresse e-mail, mot de passe (haché), et éventuellement votre numéro de téléphone Mobile Money.
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">2. Utilisation des données</h2>
          <p className="text-gray-300 mb-4">
            Vos données sont utilisées pour :
          </p>
          <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2">
            <li>Créer et gérer votre compte JASpay.</li>
            <li>Traiter vos dépôts et retraits.</li>
            <li>Vous envoyer des notifications concernant vos transactions.</li>
            <li>Respecter les obligations légales et réglementaires.</li>
          </ul>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">3. Partage des données</h2>
          <p className="text-gray-300 mb-4">
            Vos données personnelles ne sont jamais vendues à des tiers. Elles peuvent être partagées
            avec nos prestataires de paiement (Mobile Money) uniquement dans le cadre du traitement
            de vos transactions.
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">4. Sécurité des données</h2>
          <p className="text-gray-300 mb-4">
            Nous utilisons Supabase Auth pour l'authentification. Les mots de passe sont hachés
            avec bcrypt et jamais stockés en clair. Les communications sont chiffrées en HTTPS.
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">5. Droits de l'utilisateur</h2>
          <p className="text-gray-300 mb-4">
            Conformément à la réglementation applicable, vous disposez d'un droit d'accès, de
            rectification, d'effacement et de portabilité de vos données. Vous pouvez exercer ces
            droits en nous contactant.
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">6. Conservation des données</h2>
          <p className="text-gray-300 mb-4">
            Vos données sont conservées aussi longtemps que votre compte est actif. Après suppression
            de votre compte, vos données personnelles sont anonymisées ou supprimées dans un délai
            raisonnable.
          </p>

          <p className="text-xs text-gray-500 mt-8 text-center">
            Dernière mise à jour : 16 novembre 2026
          </p>
        </div>
      </div>
    </div>
  );
}
