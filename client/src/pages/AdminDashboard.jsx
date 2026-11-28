import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invokeEdge } from '../lib/edgeFunctions';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = await getToken();
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        '/api/admin/stats',
        'GET'
      );

      if (err) {
        if (err.status === 401 || err.status === 403) {
          navigate('/login', { replace: true });
          return;
        }
        throw new Error(err.message || 'Erreur lors du chargement des statistiques.');
      }

      setStats(data.stats);
      setRecentActivity(data.recentActivity || []);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-white font-medium">Chargement…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-danger/20 border border-danger/40 text-danger rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tableau de bord administrateur</h1>
        <p className="text-gray-300">
          Vue d'ensemble de la plateforme JASpay. Les volumes affichés sont les montants
          traités, pas les revenus de la plateforme.
        </p>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Utilisateurs totaux"
          value={stats?.totalUsers ?? 0}
          subtitle={`${stats?.activeUsers ?? 0} actifs`}
          icon="👥"
          color="blue"
        />
        <StatCard
          title="Utilisateurs suspendus"
          value={stats?.suspendedUsers ?? 0}
          subtitle="Comptes inactifs"
          icon="🚫"
          color="red"
        />
        <StatCard
          title="Dépôts"
          value={stats?.totalDeposits ?? 0}
          subtitle={`Volume: ${formatCurrency(stats?.volumeDepositsXOF ?? 0)} XOF`}
          icon="📥"
          color="green"
        />
        <StatCard
          title="Retraits"
          value={stats?.totalWithdrawals ?? 0}
          subtitle={`Volume: ${formatCurrency(stats?.volumeWithdrawalsXOF ?? 0)} XOF`}
          icon="📤"
          color="purple"
        />
        <StatCard
          title="En attente"
          value={stats?.pendingTransactions ?? 0}
          subtitle="Transactions non traitées"
          icon="⏳"
          color="yellow"
        />
        <StatCard
          title="En cours"
          value={stats?.processingTransactions ?? 0}
          subtitle="En traitement par un agent"
          icon="🔄"
          color="blue"
        />
        <StatCard
          title="Validées"
          value={stats?.completedTransactions ?? 0}
          subtitle="Transactions complétées"
          icon="✅"
          color="green"
        />
        <StatCard
          title="Rejetées"
          value={stats?.rejectedTransactions ?? 0}
          subtitle="Transactions refusées"
          icon="❌"
          color="red"
        />
      </div>

      {/* Activité récente */}
      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">Activité récente</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Référence</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Type</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Utilisateur</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Montant</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Statut</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Date</th>
              </tr>
            </thead>
            <tbody>
              {(recentActivity || []).map((tx) => (
                <tr key={tx.transaction_reference} className="border-b border-white/10">
                  <td className="px-4 py-3 text-sm font-mono text-white">
                    {tx.transaction_reference}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {tx.transaction_type === 'deposit' ? 'Dépôt' : 'Retrait'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {tx.profiles?.email || 'Inconnu'}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-white">
                    {tx.amount} {tx.currency}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      tx.status === 'completed' ? 'border-success-600/30 text-success-500 bg-success-600/15' :
                      tx.status === 'rejected' ? 'border-danger/30 text-danger bg-danger/50' :
                      tx.status === 'pending' ? 'border-electric-500/30 text-electric-500 bg-electric-500/10' :
                      'border-white/10 text-gray-300 bg-white/5'
                    }`}
                    >
                      {tx.status === 'pending' ? 'En attente' : tx.status === 'processing' ? 'En cours' : tx.status === 'completed' ? 'Validée' : 'Rejetée'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {new Date(tx.created_at).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
              {(recentActivity?.length || 0) === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-400">
                    Aucune activité récente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 bg-white/5 rounded-lg text-sm text-gray-300">
        <p className="font-medium text-white mb-2">Note importante</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Les volumes affichés correspondent aux montants des transactions traitées, pas aux revenus de la plateforme.</li>
          <li>Toutes les actions administratives sont journalisées dans l'onglet Surveillance.</li>
          <li>Un utilisateur ne peut jamais accéder à cet espace depuis son compte personnel.</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, color }) {
  const colorConfigs = {
    blue: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
    red: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
    green: { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30' },
    purple: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
    yellow: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  };
  const cfg = colorConfigs[color] || colorConfigs.blue;

  return (
    <div className={`card p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-300">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.text} ${cfg.bg.replace('50', '100')}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
