import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invokeEdge } from '../lib/edgeFunctions';
import BackButton from '../components/BackButton';

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

  const [successMsg, setSuccessMsg] = useState('');

  // Récupérer le token JWT depuis la session Supabase
  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [bmRes, provRes, setRes] = await Promise.all([
        invokeEdge('jaspay-admin-config', '/api/admin/bookmakers', 'GET'),
        invokeEdge('jaspay-admin-config', '/api/admin/payment-providers', 'GET'),
        invokeEdge('jaspay-admin-config', '/api/admin/settings', 'GET'),
      ]);

      if (bmRes.error) throw new Error(bmRes.error.message || 'Erreur chargement bookmakers.');
      if (provRes.error) throw new Error(provRes.error.message || 'Erreur chargement opérateurs.');
      if (setRes.error) throw new Error(setRes.error.message || 'Erreur chargement paramètres.');

      setBookmakers(bmRes.data.bookmakers || []);
      setProviders(provRes.data.providers || []);
      setSettings(setRes.data.settings || []);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [activeTab]);

  const handleAddBookmaker = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-config',
        '/api/admin/bookmakers',
        'POST',
        newBookmaker
      );

      if (err) throw new Error(err.message || 'Erreur lors de la création.');
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
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-config',
        '/api/admin/payment-providers',
        'POST',
        newProvider
      );

      if (err) throw new Error(err.message || 'Erreur lors de la création.');
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
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-config',
        '/api/admin/settings',
        'POST',
        newSetting
      );

      if (err) throw new Error(err.message || 'Erreur lors de la création.');
      setSuccessMsg('Paramètre créé.');
      setNewSetting({ setting_key: '', setting_value: {}, description: '', is_public: false });
      await loadAll();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-white font-medium">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackButton to="/admin" label="Retour au tableau de bord" className="mb-1" />
      <div>
        <h1 className="text-2xl font-bold text-white">Configuration de la plateforme</h1>
        <p className="text-gray-300">
          Gérez les bookmakers, opérateurs de paiement et paramètres généraux.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-success-600/20 border border-success-600/40 text-success-500 text-sm rounded-lg">
          {successMsg}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-4 border-b border-white/20 mb-6">
        {['bookmakers', 'providers', 'settings'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-electric-500 text-electric-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
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
            <h2 className="text-lg font-bold text-white mb-4">Bookmakers configurés</h2>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5">
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Nom</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">ID technique</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Statut</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Ordre</th>
                  </tr>
                </thead>
                <tbody>
                  {bookmakers.length === 0 ? (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">Aucun bookmaker.</td></tr>
                  ) : (
                    bookmakers.map((b) => (
                      <tr key={b.id} className="border-b border-white/10">
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-200 break-words">{b.name}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-300 font-mono break-all">{b.technical_id}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm break-words">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            b.is_active ? 'bg-success-600/15 text-success-500 border border-success-600/30' :
                            'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}>
                            {b.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-300 break-words">{b.display_order}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-white mb-3">Ajouter un bookmaker</h3>
            <form onSubmit={handleAddBookmaker} className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-300">Nom</label>
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
                <label className="block text-xs font-medium text-gray-300">Identifiant technique</label>
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
                <label className="block text-xs font-medium text-gray-300">Ordre d'affichage</label>
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
                  className="w-4 h-4 text-electric-500 border-white/20 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-200 leading-none">Actif</label>
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
            <h2 className="text-lg font-bold text-white mb-4">Opérateurs de paiement</h2>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5">
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Nom</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">ID technique</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Dépôt</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Retrait</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.length === 0 ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun opérateur.</td></tr>
                  ) : (
                    providers.map((p) => (
                      <tr key={p.id} className="border-b border-white/10">
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-200 break-words">{p.name}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-300 font-mono break-all">{p.technical_id}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm break-words">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.supports_deposit ? 'bg-success-600/15 text-success-500 border border-success-600/30' :
                            'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}>
                            {p.supports_deposit ? 'Oui' : 'Non'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-sm break-words">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.supports_withdrawal ? 'bg-success-600/15 text-success-500 border border-success-600/30' :
                            'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}>
                            {p.supports_withdrawal ? 'Oui' : 'Non'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-sm break-words">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.is_active ? 'bg-success-600/15 text-success-500 border border-success-600/30' :
                            'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}>
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
            <h3 className="text-sm font-bold text-white mb-3">Ajouter un opérateur</h3>
            <form onSubmit={handleAddProvider} className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-300">Nom</label>
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
                <label className="block text-xs font-medium text-gray-300">Identifiant technique</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: mixx"
                  value={newProvider.technical_id}
                  onChange={(e) => setNewProvider({ ...newProvider, technical_id: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newProvider.supports_deposit}
                  onChange={(e) => setNewProvider({ ...newProvider, supports_deposit: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-white/20 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-200 leading-none">Dépôt</label>
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newProvider.supports_withdrawal}
                  onChange={(e) => setNewProvider({ ...newProvider, supports_withdrawal: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-white/20 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-200 leading-none">Retrait</label>
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newProvider.is_active}
                  onChange={(e) => setNewProvider({ ...newProvider, is_active: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-white/20 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-200 leading-none">Actif</label>
              </div>
              <button type="submit" className="btn-primary w-full">
                Créer l'opérateur
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab Paramètres */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-white mb-4">Paramètres de la plateforme</h2>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5">
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Clé</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Valeur</th>
                    <th className="px-3 sm:px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20 break-words">Public</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.length === 0 ? (
                    <tr><td colSpan="3" className="px-4 py-8 text-center text-gray-400">Aucun paramètre.</td></tr>
                  ) : (
                    settings.map((s) => (
                      <tr key={s.id} className="border-b border-white/10">
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-200 font-mono break-all">{s.setting_key}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm text-gray-300 break-words">{JSON.stringify(s.setting_value)}</td>
                        <td className="px-3 sm:px-4 py-3 text-sm break-words">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.is_public ? 'bg-success-600/15 text-success-500 border border-success-600/30' :
                            'bg-white/5 text-gray-300 border border-white/10'
                          }`}>
                            {s.is_public ? 'Oui' : 'Non'}
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
            <h3 className="text-sm font-bold text-white mb-3">Ajouter un paramètre</h3>
            <form onSubmit={handleAddSetting} className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-300">Clé</label>
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
                <label className="block text-xs font-medium text-gray-300">Description</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Description du paramètre"
                  value={newSetting.description}
                  onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })}
                />
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={newSetting.is_public}
                  onChange={(e) => setNewSetting({ ...newSetting, is_public: e.target.checked })}
                  className="w-4 h-4 text-electric-500 border-white/20 rounded focus:ring-electric-500"
                />
                <label className="text-sm text-gray-200 leading-none">Public</label>
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