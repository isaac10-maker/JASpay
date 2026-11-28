import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PageShell from '../components/PageShell';
import jaspayMark from '../assets/images/logos/jaspay-mark.png';

export default function Dashboard() {
  const { user, profile, signOut, isAdmin, isSuperAdmin, isAgent, isModerator } = useAuth();
  const [stats, setStats] = useState({
    totalTransactions: 0,
    pendingTransactions: 0,
    validatedTransactions: 0,
    rejectedTransactions: 0,
  });
  const [loading, setLoading] = useState(true);

  const isAdminOrAgent = isSuperAdmin || isAdmin || isAgent || isModerator;

  useEffect(() => {
    const loadStats = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const queries = [
          supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'pending'),
          supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'completed'),
          supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'rejected'),
        ];

        const results = await Promise.all(queries);

        setStats({
          totalTransactions: results[0].count || 0,
          pendingTransactions: results[1].count || 0,
          validatedTransactions: results[2].count || 0,
          rejectedTransactions: results[3].count || 0,
        });
      } catch (err) {
        console.error('[Dashboard] Erreur chargement statistiques :', err.message);
      } finally {
        setLoading(false);
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
    <PageShell>
      {/* Hero Section */}
      <header className="relative z-10 pt-10 sm:pt-14 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-marine-900 rounded-2xl mb-6 border border-white/20 shadow-[0_0_30px_rgba(14,165,233,0.3)]">
            <img src={jaspayMark} alt="JASpay" className="h-20 w-20 rounded-2xl shadow-[0_0_34px_rgba(14,165,233,0.5)]" width="80" height="80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Bienvenue sur <span className="text-electric-400">JASpay</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            Gérez vos dépôts et retraits vers vos comptes bookmaker en toute sécurité.
            1xBet, MelBet, 1Win et Wallisbet — Mobile Money Mixx by Yas et Flooz.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => (window.location.href = '/depot')}
              className="btn-primary px-8 py-4 text-lg"
            >
              Effectuer un dépôt
            </button>
            <button
              onClick={() => (window.location.href = '/retrait')}
              className="btn-secondary px-8 py-4 text-lg border-white/30"
            >
              Effectuer un retrait
            </button>
          </div>
        </div>
      </header>

      {/* Statistiques */}
      {!loading && (
        <section className="z-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-panel p-6">
              <p className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-2">Total opérations</p>
              <p className="text-3xl font-bold text-white">{stats.totalTransactions}</p>
            </div>
            <div className="glass-panel p-6 border-electric-500/30">
              <p className="text-sm text-electric-400 uppercase tracking-wider font-semibold mb-2">En attente</p>
              <p className="text-3xl font-bold text-electric-400">{stats.pendingTransactions}</p>
            </div>
            <div className="glass-panel p-6 border-success-600/30">
              <p className="text-sm text-success-400 uppercase tracking-wider font-semibold mb-2">Validées</p>
              <p className="text-3xl font-bold text-success-400">{stats.validatedTransactions}</p>
            </div>
            <div className="glass-panel p-6 border-danger-600/30">
              <p className="text-sm text-danger-400 uppercase tracking-wider font-semibold mb-2">Rejetées</p>
              <p className="text-3xl font-bold text-danger-400">{stats.rejectedTransactions}</p>
            </div>
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section className="z-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mb-12">
        <div className="flex flex-col md:flex-row justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Actions rapides</h2>
            <p className="text-gray-400">Choisissez votre opération suivante</p>
          </div>
          {isAdminOrAgent && (
            <a
              href="/admin"
              className="btn-secondary px-6 py-2.5 text-sm border-white/30"
            >
              Espace administration
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Dépôt */}
          <div
            onClick={() => (window.location.href = '/depot')}
            className="glass-panel-hover group cursor-pointer p-8 rounded-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-white/5 group-hover:from-white/10 transition-all"></div>
            <div className="relative z-10 flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-electric-500/20 rounded-xl flex items-center justify-center border border-electric-500/30">
                <svg className="w-6 h-6 text-electric-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">Dépôt</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Alimenter votre compte</h3>
            <p className="text-gray-400 mb-6">
              Déposez sur 1xBet, MelBet, 1Win ou Wallisbet via Mobile Money.
            </p>
            <button className="btn-primary w-full">
              Déposer maintenant
            </button>
          </div>

          {/* Retrait */}
          <div
            onClick={() => (window.location.href = '/retrait')}
            className="glass-panel-hover group cursor-pointer p-8 rounded-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-white/5 group-hover:from-white/10 transition-all"></div>
            <div className="relative z-10 flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-success-600/20 rounded-xl flex items-center justify-center border border-success-600/30">
                <svg className="w-6 h-6 text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">Retrait</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Retirer vos gains</h3>
            <p className="text-gray-400 mb-6">
              Retirez vers votre numéro Mobile Money enregistré et vérifié.
            </p>
            <button className="btn-primary w-full">
              Retirer maintenant
            </button>
          </div>

          {/* Transactions */}
          <div
            onClick={() => (window.location.href = '/transactions')}
            className="glass-panel-hover group cursor-pointer p-8 rounded-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-white/5 group-hover:from-white/10 transition-all"></div>
            <div className="relative z-10 flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-marine-900/40 rounded-xl flex items-center justify-center border border-white/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002-2h2a2 2 0 002 2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">Historique</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Mes transactions</h3>
            <p className="text-gray-400 mb-6">
              Suivez l'état de vos dépôts et retraits en temps réel.
            </p>
            <button className="btn-primary w-full">
              Voir l'historique
            </button>
          </div>
        </div>
      </section>

      {/* Comment fonctionne JASpay */}
      <section className="z-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mb-12">
        <div className="glass-panel p-8 md:p-12 rounded-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Comment fonctionne JASpay ?</h2>
              <p className="text-gray-400">Trois étapes simples pour vos opérations</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center p-6">
              <div className="w-16 h-16 bg-electric-500/20 rounded-full flex items-center justify-center mb-4 border border-electric-500/30">
                <span className="text-electric-400 text-2xl font-bold">1</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Choisissez votre bookmaker</h3>
              <p className="text-gray-400 text-sm">
                1xBet, MelBet, 1Win ou Wallisbet — sélectionnez votre plateforme de paris.
              </p>
            </div>

            <div className="flex flex-col items-center text-center p-6">
              <div className="w-16 h-16 bg-electric-500/20 rounded-full flex items-center justify-center mb-4 border border-electric-500/30">
                <span className="text-electric-400 text-2xl font-bold">2</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Saisissez le montant et le numéro</h3>
              <p className="text-gray-400 text-sm">
                Indiquez le montant en XOF et votre numéro Mobile Money (Mixx by Yas ou Flooz).
              </p>
            </div>

            <div className="flex flex-col items-center text-center p-6">
              <div className="w-16 h-16 bg-success-600/20 rounded-full flex items-center justify-center mb-4 border border-success-600/30">
                <span className="text-success-400 text-2xl font-bold">3</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Validation par un agent</h3>
              <p className="text-gray-400 text-sm">
                Un agent vérifie votre paiement et valide votre demande rapidement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pied de page */}
      <footer className="z-10 border-t border-white/10 bg-space-900/50 px-4 py-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400">
            JASpay — Plateforme de paiement sécurisée. Propulsé par Supabase.
          </p>
          <div className="flex gap-6">
            <a href="/cgu" className="text-sm text-gray-400 hover:text-electric-400 transition-colors">
              CGU
            </a>
            <a href="/confidentialite" className="text-sm text-gray-400 hover:text-electric-400 transition-colors">
              Confidentialité
            </a>
          </div>
        </div>
      </footer>
    </PageShell>
  );
}
