import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:3001/api';

export default function AdminConfig() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bookmakers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Données
  const [bookmakers, setBookmakers] = useState([]);
  const [providers, setProviders] = useState([]);
  const [settings, setSettings] = useState([]);

  // Formulaires
  const [newBookmaker, setNewBookmaker] = useState({ name: '', technical_id: '', logo_url: '', is_active: true, display_order: 0 });
  const [newProvider, setNewProvider] = useState({ name: '', technical_id: '', is_active: true, supports_deposit: true, supports_withdrawal: true, ussd_instructions: '' });
  const [newSetting, setNewSetting] = useState({ setting_key: '', setting_value: {}, description: '', is_public: false });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('jaspay_token');

      const [bmRes, provRes, setRes] = await Promise.all([
        fetch(`${API_BASE}/admin/bookmakers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/admin/payment-providers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/admin/settings`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (bmRes.status === 401 || bmRes.status === 403) {
        navigate('/login', { replace: true });
        return;
      }

      if (!bmRes.ok) throw new Error('Erreur chargement bookmakers.');
      if (!provRes.ok) throw new Error('Erreur chargement opérateurs.');
      if (!setRes.ok) throw new Error('Erreur chargement paramètres.');

      const bmData = await bmRes.json();
      const provData = await provRes.json();
      const setData = await setRes.json();

      setBookmakers(bmData.bookmakers || []);
      setProviders(provData.providers || []);
      setSettings(setData.settings || []);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBookmaker = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/bookmakers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newBookmaker),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de la création.');
      }
      setSuccessMsg('Bookmaker créé.');
      setNewBookmaker({ name: '', technical_id: '', logo_url: '', is_active: true, display_order: 0 });
      await loadAll();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleAddProvider = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/payment-providers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newProvider),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de la création.');
      }
      setSuccessMsg('Opérateur créé.');
      setNewProvider({ name: '', technical_id: '', is_active: true, supports_deposit: true, supports_withdrawal: true, ussd_instructions: '' });
      await loadAll();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleAddSetting = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newSetting),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de la création.');
      }
      setSuccessMsg('Paramètre créé.');
      setNewSetting({ setting_key: '', setting_value: {}, description: '', is_public: false });
      await loadAll();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const [successMsg, setSuccessMsg] = useState('');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-marine-900 font-medium">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-marine-900">Configuration de la plateforme</h1>
        <p className="text-gray-600">
          Gérez les bookmakers, opérateurs de paiement et paramètres généraux.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-success-100 border border-success-200 text-success-700 text-sm rounded-lg">
          {successMsg}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        {['bookmakers', 'providers', 'settings'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-electric-500 text-electric-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'bookmakers' ? 'Bookmakers' : tab === 'providers' ? 'Opérateurs de paiement' : 'Paramètres'}
          </button>
        ))}
      </div>

      {/* Tab Bookmakers */}
      {activeTab === 'bookmakers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-marine-900 mb-4">Bookmakers configurés</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Nom</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">ID technique</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Statut</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Ordre</th>
                  </tr>
                </thead>
                <tbody>
                  {bookmakers.length === 0 ? (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Aucun bookmaker.</td></tr>
                  ) : (
                    bookmakers.map((b) => (
                      <tr key={b.id} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-sm text-gray-700">{b.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">{b.technical_id}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            b.is_active ? 'bg-success-50 text-success-600 border border-success-100' :
                            'bg-red-50 text-red-600 border border-red-100'
                          }`}
                          >
                            {b.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{b.display_order}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-marine-900 mb-3">Ajouter un bookmaker</h3>
            <form onSubmit={handleAddBookmaker} className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Nom</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: 1xBet"
                  value={newBookmaker.name}
                  onChange={(e) => setNewBookmaker({ ...newBookmaker, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Identifiant technique</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: 1xbet"
                  value={newBookmaker.technical_id}
                  onChange={(e) => setNewBookmaker({ ...newBookmaker, technical_id: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Ordre d'affichage</label>
                <input
                  type="number"
                  className="input-field"
                  value={newBookmaker.display_order}
                  onChange={(e) => setNewBookmaker({ ...newBookmaker, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newBookmaker.is_active}
                  onChange={(e) => setNewBookmaker({ ...newBookmaker, is_active: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-gray-300 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-700 leading-none">Actif</label>
              </div>
              <button type="submit" className="btn-primary w-full">
                Créer le bookmaker
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab Opérateurs */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-marine-900 mb-4">Opérateurs de paiement</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Nom</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">ID technique</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Dépôt</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Retrait</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.length === 0 ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">Aucun opérateur.</td></tr>
                  ) : (
                    providers.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-sm text-gray-700">{p.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">{p.technical_id}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.supports_deposit ? 'bg-success-50 text-success-600 border border-success-100' :
                            'bg-red-50 text-red-600 border border-red-100'
                          }`}
                          >
                            {p.supports_deposit ? 'Oui' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.supports_withdrawal ? 'bg-success-50 text-success-600 border border-success-100' :
                            'bg-red-50 text-red-600 border border-red-100'
                          }`}
                          >
                            {p.supports_withdrawal ? 'Oui' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.is_active ? 'bg-success-50 text-success-600 border border-success-100' :
                            'bg-red-50 text-red-600 border border-red-100'
                          }`}
                          >
                            {p.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-marine-900 mb-3">Ajouter un opérateur</h3>
            <form onSubmit={handleAddProvider} className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Nom</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Mixx by Yas"
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Identifiant technique</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: mixx"
                  value={newProvider.technical_id}
                  onChange={(e) => setNewProvider({ ...newProvider, technical_id: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Instructions USSD (optionnel)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  placeholder="Aucune syntaxe USSD inventée — configurée après vérification officielle"
                  value={newProvider.ussd_instructions}
                  onChange={(e) => setNewProvider({ ...newProvider, ussd_instructions: e.target.value })}
                />
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newProvider.supports_deposit}
                  onChange={(e) => setNewProvider({ ...newProvider, supports_deposit: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-gray-300 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-700 leading-none">Accepte les dépôts</label>
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newProvider.supports_withdrawal}
                  onChange={(e) => setNewProvider({ ...newProvider, supports_withdrawal: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-gray-300 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-700 leading-none">Accepte les retraits</label>
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newProvider.is_active}
                  onChange={(e) => setNewProvider({ ...newProvider, is_active: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-gray-300 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-700 leading-none">Actif</label>
              </div>
              <button type="submit" className="btn-primary w-full">
                Créer l'opérateur
              </button>
            </form>
            <p className="text-xs text-gray-500 mt-3">
              ⚠️ Aucune syntaxe USSD n'est inventée. Les instructions doivent être vérifiées auprès de l'opérateur avant activation.
            </p>
          </div>
        </div>
      )}

      {/* Tab Paramètres */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-marine-900 mb-4">Paramètres de la plateforme</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Clé</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Valeur</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Public</th>
                    <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.length === 0 ? (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">Aucun paramètre.</td></tr>
                  ) : (
                    settings.map((s) => (
                      <tr key={s.id} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-sm font-mono text-gray-700">{s.setting_key}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 break-all">
                          {JSON.stringify(s.setting_value).slice(0, 50)}{JSON.stringify(s.setting_value).length > 50 ? '…' : ''}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.is_public ? 'bg-success-50 text-success-600 border border-success-100' :
                            'bg-red-50 text-red-600 border border-red-100'
                          }`}
                          >
                            {s.is_public ? 'Oui' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.description || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-marine-900 mb-3">Ajouter un paramètre</h3>
            <form onSubmit={handleAddSetting} className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Clé</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: site_maintenance"
                  value={newSetting.setting_key}
                  onChange={(e) => setNewSetting({ ...newSetting, setting_key: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Valeur (JSON)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder='Ex: {"enabled": true}'
                  value={JSON.stringify(newSetting.setting_value)}
                  onChange={(e) => {
                    try {
                      setNewSetting({ ...newSetting, setting_value: JSON.parse(e.target.value || '{}') });
                    } catch {}
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Description</label>
                <input
                  type="text"
                  className="input-field"
                  value={newSetting.description}
                  onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })}
                />
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newSetting.is_public}
                  onChange={(e) => setNewSetting({ ...newSetting, is_public: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-gray-300 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-700 leading-none">Visible par les utilisateurs</label>
              </div>
              <button type="submit" className="btn-primary w-full">
                Créer le paramètre
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
