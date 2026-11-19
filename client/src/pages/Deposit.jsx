import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invokeEdge } from '../lib/edgeFunctions';

const STEPS = {
  BOOKMAKER: 'bookmaker',
  ACCOUNT: 'account',
  AMOUNT: 'amount',
  OPERATOR: 'operator',
  PHONE: 'phone',
  SUMMARY: 'summary',
  CONFIRMATION: 'confirmation',
};

const STEP_ORDER = [
  STEPS.BOOKMAKER,
  STEPS.ACCOUNT,
  STEPS.AMOUNT,
  STEPS.OPERATOR,
  STEPS.PHONE,
  STEPS.SUMMARY,
  STEPS.CONFIRMATION,
];

export default function Deposit() {
  const navigate = useNavigate();

  const [step, setStep] = useState(STEPS.BOOKMAKER);
  const [bookmakers, setBookmakers] = useState([]);
  const [providers, setProviders] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    bookmaker_id: '',
    bookmaker_account_id: '',
    amount: '',
    payment_provider_id: '',
    phone_number: '',
    transaction_reference: '',
  });

  useEffect(() => {
    loadBookmakers();
    loadProviders();
  }, []);

  const loadBookmakers = async () => {
    try {
      const { data, error } = await invokeEdge('jaspay-config', '/api/bookmakers', 'GET');
      if (error) throw error;
      setBookmakers(data.bookmakers || []);
    } catch (err) {
      const { data, error } = await supabase
        .from('bookmakers')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (!error) setBookmakers(data || []);
    }
  };

  const loadProviders = async () => {
    try {
      const { data, error } = await invokeEdge('jaspay-config', '/api/payment-providers', 'GET');
      if (error) throw error;
      setProviders(data.providers || []);
    } catch (err) {
      const { data, error } = await supabase
        .from('payment_providers')
        .select('*')
        .eq('is_active', true);
      if (!error) setProviders(data || []);
    }
  };

  const loadPaymentMethods = async (bookmakerId) => {
    try {
      const { data, error } = await invokeEdge(
        'jaspay-config',
        `/api/payment-methods?bookmakerId=${bookmakerId}`,
        'GET'
      );
      if (error) throw error;
      setPaymentMethods(data.methods || []);
    } catch (err) {
      const { data, error } = await supabase
        .from('payment_methods')
        .select(`
          *,
          provider:payment_providers (*)
        `)
        .eq('bookmaker_id', bookmakerId)
        .eq('is_active', true);
      if (!error) setPaymentMethods(data || []);
    }
  };

  const handleBookmakerChange = (e) => {
    const id = e.target.value;
    setForm((prev) => ({ ...prev, bookmaker_id: id }));
    loadPaymentMethods(id);
  };

  const generateReference = async (transactionType) => {
    try {
      const { data, error } = await invokeEdge(
        'jaspay-transactions',
        '/api/transactions/reference',
        'POST',
        { transaction_type: transactionType }
      );
      if (error) throw error;
      setForm((prev) => ({ ...prev, transaction_reference: data.transaction_reference }));
    } catch (err) {
      setError(err.message || 'Erreur lors de la génération de la référence.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.bookmaker_id) {
      setError('Veuillez choisir un bookmaker.');
      return;
    }
    if (!form.bookmaker_account_id) {
      setError('Veuillez saisir votre identifiant de compte bookmaker.');
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Veuillez saisir un montant valide.');
      return;
    }
    if (!form.payment_provider_id) {
      setError('Veuillez choisir un opérateur Mobile Money.');
      return;
    }
    if (!form.phone_number) {
      setError('Veuillez saisir votre numéro de téléphone.');
      return;
    }

    setLoading(true);

    try {
      if (!form.transaction_reference) {
        await generateReference('deposit');
      }

      const { data: txData, error: txError } = await invokeEdge(
        'jaspay-transactions',
        '/api/transactions',
        'POST',
        {
          transaction_reference: form.transaction_reference,
          transaction_type: 'deposit',
          bookmaker_id: form.bookmaker_id,
          bookmaker_account_id: form.bookmaker_account_id,
          amount: form.amount,
          currency: 'XOF',
          payment_provider_id: form.payment_provider_id,
          phone_number: form.phone_number,
        }
      );

      if (txError) throw txError;

      setSuccess(true);
      setStep(STEPS.CONFIRMATION);
    } catch (err) {
      setError(err.message || 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const getBookmakerName = (id) => {
    const b = bookmakers.find((b) => b.id === id);
    return b ? b.name : '';
  };

  const getProviderName = (id) => {
    const p = providers.find((p) => p.id === id);
    return p ? p.name : '';
  };

  const currentStepIndex = STEP_ORDER.indexOf(step);

  if (step === STEPS.CONFIRMATION) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-offwhite px-4">
        <div className="max-w-md w-full glass-panel p-8 md:p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success-600 rounded-full mb-6">
            <span className="text-white font-bold text-2xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-marine-900 mb-2">Demande enregistrée</h1>
          <p className="text-gray-600 mb-6">
            Votre demande de dépôt a été créée avec succès.
          </p>
          <div className="card mb-6">
            <p className="text-sm font-medium text-marine-900 mb-2">Référence de transaction</p>
            <p className="text-xl font-mono text-electric-500 font-bold break-all">
              {form.transaction_reference}
            </p>
          </div>
          <div className="space-y-3 text-left text-sm text-gray-600">
            <p><strong>Bookmaker :</strong> {getBookmakerName(form.bookmaker_id)}</p>
            <p><strong>Montant :</strong> {form.amount} XOF</p>
            <p><strong>Opérateur :</strong> {getProviderName(form.payment_provider_id)}</p>
            <p><strong>Numéro :</strong> {form.phone_number}</p>
            <p><strong>Statut :</strong> <span className="text-electric-500 font-medium">En attente</span></p>
          </div>
          <p className="text-xs text-gray-500 mt-6">
            Un agent va vérifier votre paiement. Vous pouvez suivre l'état de votre demande dans "Mes transactions".
          </p>
          <button
            onClick={() => navigate('/transactions')}
            className="mt-6 btn-primary w-full"
          >
            Voir mes transactions
          </button>
        </div>
      </div>
    );
  }

  const goToStep = (index) => {
    setStep(STEP_ORDER[Math.max(0, Math.min(STEP_ORDER.length - 1, index))]);
  };

  return (
        <div className="min-h-screen bg-offwhite">
      <div className="responsive-container py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-marine-900">Effectuer un dépôt</h1>
            <p className="text-gray-600">
              Alimentez votre compte bookmaker via Mobile Money.
            </p>
          </div>
          <div className="mt-4 md:mt-0 w-full md:w-auto flex">
            {STEP_ORDER.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step === s
                      ? 'bg-electric-500 text-white'
                      : i < currentStepIndex
                        ? 'bg-success-600 text-white'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {i + 1}
                </div>
                {i < STEP_ORDER.length - 1 && (
                  <div className={`h-px w-4 ${step === s ? 'bg-electric-500' : 'bg-gray-300'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-6">
          {/* Étape 1 : Bookmaker */}
          {step === STEPS.BOOKMAKER && (
            <>
              <h2 className="text-lg font-bold text-marine-900 mb-4">1. Choisir votre bookmaker</h2>
              <div className="space-y-3">
                {bookmakers.map((b) => (
                  <label key={b.id} className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:border-electric-500 hover:bg-marine-50/50 transition-colors">
                    <input
                      type="radio"
                      name="bookmaker_id"
                      value={b.id}
                      checked={form.bookmaker_id === b.id}
                      onChange={handleBookmakerChange}
                      className="w-4 h-4 text-electric-500"
                    />
                    <div>
                      <div className="font-medium text-marine-900">{b.name}</div>
                      <div className="text-xs text-gray-500">{b.technical_id}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Étape 2 : Identifiant compte */}
          {step === STEPS.ACCOUNT && (
            <>
              <h2 className="text-lg font-bold text-marine-900 mb-4">2. Identifiant du compte bookmaker</h2>
              <p className="text-sm text-gray-600 mb-3">
                Votre identifiant de compte sur {getBookmakerName(form.bookmaker_id) || 'le bookmaker sélectionné'}.
              </p>
              <div className="space-y-2">
                <label className="label-text">Identifiant de compte</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: 123456789"
                  value={form.bookmaker_account_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, bookmaker_account_id: e.target.value }))}
                  required
                />
              </div>
            </>
          )}

          {/* Étape 3 : Montant */}
          {step === STEPS.AMOUNT && (
            <>
              <h2 className="text-lg font-bold text-marine-900 mb-4">3. Montant du dépôt</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="label-text">Montant (XOF)</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="0"
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                {paymentMethods.length > 0 && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600">
                      Limites et frais selon l'opérateur sélectionné à l'étape suivante.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Étape 4 : Opérateur */}
          {step === STEPS.OPERATOR && (
            <>
              <h2 className="text-lg font-bold text-marine-900 mb-4">4. Opérateur Mobile Money</h2>
              <div className="space-y-3">
                {paymentMethods.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:border-electric-500 hover:bg-marine-50/50 transition-colors">
                    <input
                      type="radio"
                      name="payment_provider_id"
                      value={m.provider_id}
                      checked={form.payment_provider_id === m.provider_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, payment_provider_id: e.target.value }))}
                      className="w-4 h-4 text-electric-500"
                    />
                    <div>
                      <div className="font-medium text-marine-900">{m.provider.name}</div>
                      {m.min_amount > 0 || m.max_amount > 0 ? (
                        <div className="text-xs text-gray-500">
                          {m.min_amount} - {m.max_amount} XOF
                        </div>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Étape 5 : Numéro de téléphone */}
          {step === STEPS.PHONE && (
            <>
              <h2 className="text-lg font-bold text-marine-900 mb-4">5. Numéro de téléphone</h2>
              <p className="text-sm text-gray-600 mb-3">
                Ce numéro recevra la demande de paiement Mobile Money.
              </p>
              <div className="space-y-2">
                <label className="label-text">Numéro Mobile Money</label>
                <input
                  type="tel"
                  className="input-field"
                  placeholder="+228 XX XX XX XX"
                  value={form.phone_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone_number: e.target.value }))}
                  required
                />
              </div>
              <div className="p-3 bg-success-50 border border-success-100 rounded-lg">
                <p className="text-sm text-success-700">
                  <strong>Important :</strong> Ne communiquez jamais votre code PIN Mobile Money.
                  Vous devez confirmer l'opération vous-même sur l'interface officielle de votre opérateur.
                </p>
              </div>
            </>
          )}

          {/* Étape 6 : Récapitulatif */}
          {step === STEPS.SUMMARY && (
            <>
              <h2 className="text-lg font-bold text-marine-900 mb-4">6. Récapitulatif</h2>
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Bookmaker</span>
                  <span className="font-medium text-marine-900">{getBookmakerName(form.bookmaker_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Identifiant compte</span>
                  <span className="font-medium text-marine-900">{form.bookmaker_account_id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Montant</span>
                  <span className="font-medium text-marine-900">{form.amount} XOF</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Opérateur</span>
                  <span className="font-medium text-marine-900">{getProviderName(form.payment_provider_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Numéro</span>
                  <span className="font-medium text-marine-900">{form.phone_number}</span>
                </div>
              </div>
            </>
          )}

          {/* Boutons de navigation */}
          <div className="flex flex-col sm:flex-row sm:justify-between gap-4 pt-6">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={() => goToStep(currentStepIndex - 1)}
                className="btn-secondary w-full sm:w-auto"
              >
                Précédent
              </button>
            )}
            {step === STEPS.SUMMARY ? (
              <button
                type="submit"
                className="btn-primary w-full sm:w-auto"
                disabled={loading}
              >
                {loading ? 'Création en cours…' : 'Générer la référence'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goToStep(currentStepIndex + 1)}
                className="btn-primary w-full sm:w-auto"
              >
                Suivant
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p className="font-medium text-marine-900 mb-2">Comment fonctionne le dépôt ?</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Choisissez votre bookmaker (1xBet, MelBet ou 1Win).</li>
            <li>Saisissez votre identifiant de compte bookmaker.</li>
            <li>Indiquez le montant à déposer en XOF.</li>
            <li>Sélectionnez votre opérateur Mobile Money (Mixx by Yas ou Flooz).</li>
            <li>Un agent vérifiera votre paiement et validera votre demande.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
