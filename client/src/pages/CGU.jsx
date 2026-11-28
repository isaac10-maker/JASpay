import { useAuth } from '../hooks/useAuth';
import BackButton from '../components/BackButton';

export default function CGU() {
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
          <h1 className="text-2xl font-bold text-white mb-6">Conditions Générales d'Utilisation</h1>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">1. Acceptation des conditions</h2>
          <p className="text-gray-300 mb-4">
            En utilisant JASpay, vous acceptez les présentes conditions générales d'utilisation.
            Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser nos services.
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">2. Description du service</h2>
          <p className="text-gray-300 mb-4">
            JASpay est une plateforme de paiement et de dépôt/retrait pour comptes bookmakers.
            Les transactions sont effectuées via Mobile Money (Mixx by Yas, Flooz) et validées par des agents.
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">3. Obligations de l'utilisateur</h2>
          <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2">
            <li>Fournir des informations exactes et à jour lors de l'inscription.</li>
            <li>Ne pas partager vos identifiants de connexion avec des tiers.</li>
            <li>Ne pas utiliser JASpay à des fins frauduleuses ou illégales.</li>
            <li>Respecter les règles des bookmakers partenaires.</li>
          </ul>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">4. Sécurité</h2>
          <p className="text-gray-300 mb-4">
            JASpay utilise Supabase Auth pour sécuriser les comptes. Les mots de passe sont hachés
            et jamais stockés en clair. Une authentification à deux facteurs est recommandée.
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">5. Limitation de responsabilité</h2>
          <p className="text-gray-300 mb-4">
            JASpay ne peut être tenu responsable des pertes financières résultant d'une utilisation
            non autorisée de votre compte due à une négligence de votre part (partage de mot de passe, etc.).
          </p>

          <h2 className="text-xl font-semibold text-electric-400 mb-3">6. Modification des conditions</h2>
          <p className="text-gray-300 mb-4">
            JASpay se réserve le droit de modifier ces conditions à tout moment. Les modifications
            seront notifiées aux utilisateurs par email.
          </p>

          <p className="text-xs text-gray-500 mt-8 text-center">
            Dernière mise à jour : 16 novembre 2026
          </p>
        </div>
      </div>
    </div>
  );
}
