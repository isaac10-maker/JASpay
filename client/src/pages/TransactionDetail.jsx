import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import PageShell from '../components/PageShell';

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

export default function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTransaction();
  }, [id]);

  const loadTransaction = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: err } = await supabase
        .from('transactions')
        .select(`
          *,
          bookmaker:bookmakers (name, technical_id, logo_url),
          provider:payment_providers (name, technical_id),
          events:transaction_events (old_status, new_status, changed_by, changed_at, notes)
        `)
        .eq('id', id)
        .single();

      if (err) throw err;

      setTransaction(data);
    } catch (err) {
      setError(err.message || 'Transaction introuvable.');
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
        <span className="text-white font-medium">Chargement…</span>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <h1 className="text-xl font-bold text-white mb-2">Transaction introuvable</h1>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => navigate('/transactions')}
            className="btn-primary w-full"
          >
            Retour aux transactions
          </button>
        </div>
      </div>
    );
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <BackButton fallback="/" label="Retour" className="mb-4" />
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Détails de la transaction</h1>
            <p className="text-gray-300">
              Suivi de votre opération {getTypeLabel(transaction.transaction_type)}.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button
              onClick={() => navigate('/transactions')}
              className="btn-secondary"
            >
              Retour
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informations principales */}
          <div className="card">
            <h2 className="text-lg font-bold text-white mb-4">Référence</h2>
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Référence de transaction</p>
              <p className="font-mono text-xl font-bold text-white break-all">
                {transaction.transaction_reference}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold shrink-0">
                  {transaction.transaction_type === 'deposit' ? '+' : '-'}
                </div>
                <div>
                  <p className="font-medium text-white">
                    {transaction.transaction_type === 'deposit' ? 'Dépôt' : 'Retrait'}
                  </p>
                  <p className="text-sm text-gray-300">
                    {transaction.bookmaker?.name || 'Bookmaker'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Montant</p>
                <p className="text-2xl font-bold text-white">
                  {transaction.amount} {transaction.currency}
                </p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Compte bookmaker</p>
                <p className="text-sm text-gray-200">{transaction.bookmaker_account_id}</p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Opérateur de paiement</p>
                <p className="text-sm text-gray-200">
                  {transaction.provider?.name || 'Non spécifié'}
                </p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Numéro de téléphone</p>
                <p className="text-sm text-gray-200">{transaction.phone_number}</p>
              </div>
            </div>
          </div>

          {/* Statut et historique */}
          <div className="card">
            <h2 className="text-lg font-bold text-white mb-4">Statut</h2>
            <div className="flex items-center gap-3 mb-6">
              <span
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${getStatusColor(transaction.status)} border-${getStatusColor(transaction.status) === 'text-success-500' ? 'success-100' : getStatusColor(transaction.status) === 'text-danger' ? 'danger/10' : 'gray-100'}`}
              >
                {getStatusLabel(transaction.status)}
              </span>
            </div>

            <h3 className="text-sm font-bold text-white mb-3">Historique des événements</h3>
            <div className="space-y-4">
              {(transaction.events || []).map((event, i) => (
                <div key={i} className="relative pl-8">
                  <div className="absolute left-0 top-1 w-2 h-2 rounded-full bg-white/20"></div>
                  <div className="text-sm text-gray-200 mb-1">
                    {event.new_status ? getStatusLabel(event.new_status) : 'Création'}
                    {event.notes ? ` — ${event.notes}` : ''}
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(event.changed_at).toLocaleString('fr-FR')}
                  </p>
                </div>
              ))}
              {(transaction.events?.length || 0) === 0 && (
                <p className="text-sm text-gray-400">Aucun événement enregistré pour le moment.</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 card p-6 border border-white/10">
          <h3 className="text-sm font-bold text-white mb-3">Informations importantes</h3>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-300">
            <li>
              Cette transaction est traitée par un agent JASpay. La validation dépend de la vérification effective du paiement.
            </li>
            <li>
              Ne communiquez jamais votre code PIN Mobile Money à quiconque, y compris aux agents JASpay.
            </li>
            <li>
              En cas de problème, contactez l'assistance avec votre référence de transaction.
            </li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
