import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { user, profile, signOut, isAdmin, isAgent, isModerator } = useAuth();
  const [stats, setStats] = useState({
    totalTransactions: 0,
    pendingTransactions: 0,
    validatedTransactions: 0,
    rejectedTransactions: 0,
  });

  useEffect(() => {
    const loadStats = async () => {
      if (!user) return;
      try {
        const { count } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        setStats((prev) => ({ ...prev, totalTransactions: count || 0 }));

        const { count: pending } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'pending');
        setStats((prev) => ({ ...prev, pendingTransactions: pending || 0 }));

        const { count: validated } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'validated');
        setStats((prev) => ({ ...prev, validatedTransactions: validated || 0 }));

        const { count: rejected } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'rejected');
        setStats((prev) => ({ ...prev, rejectedTransactions: rejected || 0 }));
      } catch (err) {
        console.error('[Dashboard] Erreur chargement statistiques :', err.message);
      }
    };
    loadStats();
  }, [user]);

  if (!user) return null;

  const roleLabel = {
    super_admin: 'Super Administrateur',
    admin: 'Administrateur',
    agent: 'Agent',
    moderator: 'Modérateur',
    user: 'Utilisateur',
  }[profile?.role || 'user'];

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Navbar */}
      <nav className="bg-marine-900/95 backdrop-blur-md border-b border-marine-900/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-electric-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">J</span>
              </div>
              <span className="font-bold text-xl text-white tracking-tight">JASpay</span>
            </div>

            <div className="hidden md:flex items-center gap-6">
              <a href="#" className="text-gray-300 hover:text-electric-400 transition-colors px-3 py-2 text-sm font-medium rounded-md">
                Accueil
              </a>
              <a href="#" className="text-gray-300 hover:text-electric-400 transition-colors px-3 py-2 text-sm font-medium rounded-md">
                Dépôt
              </a>
              <a href="#" className="text-gray-300 hover:text-electric-400 transition-colors px-3 py-2 text-sm font-medium rounded-md">
                Retrait
              </a>
              <a href="#" className="text-gray-300 hover:text-electric-400 transition-colors px-3 py-2 text-sm font-medium rounded-md">
                Mes transactions
              </a>
              <a href="#" className="text-gray-300 hover:text-electric-400 transition-colors px-3 py-2 text-sm font-medium rounded-md">
                Assistance
              </a>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end">
                <p className="text-sm font-medium text-white">{user?.email}</p>
                <p className="text-xs text-gray-400 capitalize">{roleLabel}</p>
              </div>
              <button
                onClick={signOut}
                className="btn-danger text-xs px-3 py-1.5"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-marine-900">Tableau de bord</h1>
            <p className="text-gray-600">
              Bienvenue {profile?.email || user?.email}, voici un aperçu de votre espace.
            </p>
          </div>

          {isAdmin || isAgent || isModerator ? (
            <a
              href="/admin"
              className="btn-secondary hidden sm:flex"
            >
              Espace administration
            </a>
          ) : null}
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Total opérations</p>
            <p className="text-3xl font-bold text-marine-900 mt-1">{stats.totalTransactions}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">En attente</p>
            <p className="text-3xl font-bold text-electric-500 mt-1">{stats.pendingTransactions}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Validées</p>
            <p className="text-3xl font-bold text-success-600 mt-1">{stats.validatedTransactions}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Rejetées</p>
            <p className="text-3xl font-bold text-danger mt-1">{stats.rejectedTransactions}</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card bg-marine-900 text-white rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute right-0 top-0 -mt-10 -mr-10 w-32 h-32 bg-electric-500/10 rounded-full blur-3xl"></div>
            <h3 className="text-xl font-bold mb-4">Effectuer un dépôt</h3>
            <p className="text-gray-300 mb-6 text-sm">
              Alimentez votre compte bookmaker via Mobile Money (Mixx by Yas, Flooz).
            </p>
            <button
              onClick={() => window.location.assign('/depot')}
              className="btn-secondary w-full"
            >
              Déposer maintenant
            </button>
          </div>

          <div className="card bg-marine-900 text-white rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute right-0 top-0 -mt-10 -mr-10 w-32 h-32 bg-success-600/10 rounded-full blur-3xl"></div>
            <h3 className="text-xl font-bold mb-4">Effectuer un retrait</h3>
            <p className="text-gray-300 mb-6 text-sm">
              Retirez vos gains vers votre numéro Mobile Money enregistré.
            </p>
            <button
              onClick={() => window.location.assign('/retrait')}
              className="btn-secondary w-full"
            >
              Retirer maintenant
            </button>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold text-marine-900 mb-4">Vos numéros enregistrés</h3>
            <p className="text-gray-600 text-sm mb-4">
              Gérez vos numéros Mobile Money pour vos prochaines opérations.
            </p>
            <button className="btn-secondary w-full">
              Gérer les numéros
            </button>
          </div>
        </div>

        {/* Info section */}
        <div className="mt-8 card">
          <h3 className="text-lg font-bold text-marine-900 mb-4">Comment fonctionne JASpay</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <span className="text-electric-500">1</span>
              <p className="text-sm text-gray-600">Choisissez votre bookmaker (1xBet, MelBet, 1Win)</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-electric-500">2</span>
              <p className="text-sm text-gray-600">Saisissez le montant et votre numéro Mobile Money</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-electric-500">3</span>
              <p className="text-sm text-gray-600">Un agent valide votre demande après vérification</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
