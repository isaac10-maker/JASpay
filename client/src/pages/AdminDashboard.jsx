import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:3001/api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('jaspay_token');
      // Le token est géré par Supabase, on récupère la session
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/login', { replace: true });
        return;
      }

      if (!res.ok) {
        throw new Error('Erreur lors du chargement des statistiques.');
      }

      const data = await res.json();
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
        <span className="text-marine-900 font-medium">Chargement…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-danger/10 border border-danger/20 text-danger rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-marine-900">Tableau de bord administrateur</h1>
        <p className="text-gray-600">
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
        <h2 className="text-lg font-bold text-marine-900 mb-4">Activité récente</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Référence</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Type</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Utilisateur</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Montant</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Statut</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Date</th>
              </tr>
            </thead>
            <tbody>
              {(recentActivity || []).map((tx) => (
                <tr key={tx.transaction_reference} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-sm font-mono text-marine-900">
                    {tx.transaction_reference}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {tx.transaction_type === 'deposit' ? 'Dépôt' : 'Retrait'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {tx.profiles?.email || 'Inconnu'}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-marine-900">
                    {tx.amount} {tx.currency}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      tx.status === 'completed' ? 'border-success-100 text-success-600 bg-success-50' :
                      tx.status === 'rejected' ? 'border-danger/10 text-danger bg-danger/50' :
                      tx.status === 'pending' ? 'border-electric-100 text-electric-500 bg-electric-50' :
                      'border-gray-100 text-gray-600 bg-gray-50'
                    }`}
                    >
                      {tx.status === 'pending' ? 'En attente' : tx.status === 'processing' ? 'En cours' : tx.status === 'completed' ? 'Validée' : 'Rejetée'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(tx.created_at).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
              {(recentActivity?.length || 0) === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    Aucune activité récente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p className="font-medium text-marine-900 mb-2">Note importante</p>
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
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-100' },
  };
  const cfg = colorConfigs[color] || colorConfigs.blue;

  return (
    <div className={`card p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-marine-900">{value}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.text} ${cfg.bg.replace('50', '100')}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
