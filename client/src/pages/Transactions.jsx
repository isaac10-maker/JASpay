import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import BackButton from '../components/BackButton';

const STATUS_LABELS = {
  pending: 'En attente',
  processing: 'En cours de traitement',
  awaiting_user_action: 'Action utilisateur requise',
  completed: 'Validée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
};

const STATUS_COLORS = {
  pending: 'text-electric-500',
  processing: 'text-electric-500',
  awaiting_user_action: 'text-orange-400',
  completed: 'text-success-500',
  rejected: 'text-danger',
  cancelled: 'text-gray-400',
};

const TYPE_LABELS = {
  deposit: 'Dépôt',
  withdrawal: 'Retrait',
};

export default function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    loadTransactions();
  }, [filterStatus]);

  const loadTransactions = async () => {
    setLoading(true);
    setError('');

    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          bookmaker:bookmakers (name, technical_id),
          provider:payment_providers (name, technical_id),
          events:transaction_events (old_status, new_status, changed_by, changed_at, notes)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error: err } = await query;

      if (err) throw err;
      setTransactions(data || []);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des transactions.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => STATUS_COLORS[status] || 'text-gray-400';
  const getStatusLabel = (status) => STATUS_LABELS[status] || status;
  const getTypeLabel = (type) => TYPE_LABELS[type] || type;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-electric-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-white font-medium">Chargement…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
            <BackButton fallback="/" label="Retour" className="mb-4" />
      <div className="responsive-container py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Mes transactions</h1>
            <p className="text-gray-300">
              Historique de vos dépôts et retraits.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-auto md:w-48"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="processing">En cours</option>
              <option value="awaiting_user_action">Action requise</option>
              <option value="completed">Validées</option>
              <option value="rejected">Rejetées</option>
              <option value="cancelled">Annulées</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
            {error}
          </div>
        )}

        {transactions.length === 0 ? (
          <div className="card text-center py-12">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-400">📋</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Aucune transaction</h3>
            <p className="text-gray-300 mb-6">
              Vous n'avez pas encore effectué de dépôt ou de retrait.
            </p>
            <div className="flex justify-center gap-3">
              <a href="/depot" className="btn-primary">Effectuer un dépôt</a>
              <a href="/retrait" className="btn-secondary">Effectuer un retrait</a>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Référence</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Type</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Bookmaker</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Montant</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Statut</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Date</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-white">
                      {tx.transaction_reference}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-200">
                      {getTypeLabel(tx.transaction_type)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-200">
                      {tx.bookmaker?.name || tx.bookmaker_id}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      {tx.amount} {tx.currency}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(tx.status)} border-${getStatusColor(tx.status) === 'text-success-500' ? 'success-100' : getStatusColor(tx.status) === 'text-danger' ? 'danger/10' : 'gray-100'}`}>
                        {getStatusLabel(tx.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {new Date(tx.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <a
                        href={`/transactions/${tx.id}`}
                        className="text-electric-500 font-medium hover:underline"
                      >
                        Détails
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
