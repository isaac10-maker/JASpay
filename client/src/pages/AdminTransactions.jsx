import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:3001/api';

const STATUS_LABELS = {
  pending: 'En attente',
  processing: 'En cours de traitement',
  awaiting_user_action: 'Action utilisateur requise',
  completed: 'Validée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
};

const STATUS_COLORS = {
  pending: 'bg-electric-50 text-electric-600 border border-electric-100',
  processing: 'bg-electric-50 text-electric-600 border border-electric-100',
  awaiting_user_action: 'bg-orange-50 text-orange-600 border border-orange-100',
  completed: 'bg-success-50 text-success-600 border border-success-100',
  rejected: 'bg-danger/50 text-danger border border-danger/100',
  cancelled: 'bg-gray-50 text-gray-600 border border-gray-100',
};

export default function AdminTransactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isAgentView, setIsAgentView] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, [filterStatus, isAgentView]);

  const loadTransactions = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('jaspay_token');
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);

      const res = await fetch(`${API_BASE}/agent/transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/login', { replace: true });
        return;
      }

      if (!res.ok) throw new Error('Erreur lors du chargement des transactions.');

      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async (txId, newStatus, notes) => {
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/agent/transactions/${txId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_status: newStatus, notes }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors du traitement.');
      }

      setSuccess('Transaction traitée.');
      setError('');
      await loadTransactions();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const STATUS_OPTIONS = [
    { value: 'processing', label: 'En cours' },
    { value: 'completed', label: 'Valider' },
    { value: 'rejected', label: 'Rejeter' },
    { value: 'cancelled', label: 'Annuler' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-marine-900 font-medium">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-marine-900">
            {isAgentView ? 'Mes opérations assignées' : 'Toutes les transactions'}
          </h1>
          <p className="text-gray-600">
            Gérez et traitez les demandes de dépôt et de retrait.
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
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-success-100 border border-success-200 text-success-700 text-sm rounded-lg">
          {success}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Référence</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Utilisateur</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Type</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Bookmaker</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Montant</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Statut</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                  Aucune transaction trouvée.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-marine-900">
                    {tx.transaction_reference}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {tx.user?.email || 'Inconnu'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {tx.transaction_type === 'deposit' ? 'Dépôt' : 'Retrait'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {tx.bookmaker?.name || tx.bookmaker_id}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-marine-900">
                    {tx.amount} {tx.currency}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[tx.status]}`}>
                      {STATUS_LABELS[tx.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {['pending', 'processing'].includes(tx.status) ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleProcess(tx.id, 'processing', '')}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          disabled={tx.status === 'processing'}
                        >
                          En cours
                        </button>
                        <button
                          onClick={() => {
                            const notes = window.prompt('Motif de validation (optionnel) :');
                            handleProcess(tx.id, 'completed', notes || null);
                          }}
                          className="text-xs text-green-600 hover:text-green-700 font-medium"
                        >
                          Valider
                        </button>
                        <button
                          onClick={() => {
                            const notes = window.prompt('Motif du rejet (requis) :');
                            if (notes && notes.trim()) {
                              handleProcess(tx.id, 'rejected', notes.trim());
                            }
                          }}
                          className="text-xs text-danger hover:text-danger/80 font-medium"
                        >
                          Rejeter
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Déjà traité</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p className="font-medium text-marine-900 mb-2">Règles de traitement</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Une transaction déjà validée, rejetée ou annulée ne peut plus être modifiée.</li>
          <li>Le rejet nécessite un motif explicite.</li>
          <li>Toute action est journalisée dans l'historique des événements.</li>
          <li>Un agent ne peut traiter que les transactions qui lui sont assignées (sauf administrateur).</li>
        </ul>
      </div>
    </div>
  );
}
