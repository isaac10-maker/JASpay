import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:3001/api';

const ACTION_LABELS = {
  suspend_user: 'Suspension de compte',
  reactivate_user: 'Réactivation de compte',
  delete_user: 'Suppression de compte',
  assign_role: 'Attribution de rôle',
  revoke_role: 'Révocation de rôle',
  config_change: 'Modification de configuration',
  create_bookmaker: 'Création de bookmaker',
  update_bookmaker: 'Modification de bookmaker',
  create_payment_provider: 'Création d\'opérateur',
  update_payment_provider: 'Modification d\'opérateur',
  create_announcement: 'Création d\'annonce',
  update_announcement: 'Modification d\'annonce',
  delete_announcement: 'Archivage d\'annonce',
  transaction_processing: 'Transaction en cours',
  transaction_completed: 'Transaction validée',
  transaction_rejected: 'Transaction rejetée',
  assign_transaction_agent: 'Assignation à un agent',
  revoke_admin_session: 'Révocation de session admin',
};

const ACTION_COLORS = {
  suspend_user: 'bg-orange-50 text-orange-600 border border-orange-100',
  reactivate_user: 'bg-green-50 text-green-600 border border-green-100',
  delete_user: 'bg-red-50 text-red-600 border border-red-100',
  assign_role: 'bg-blue-50 text-blue-600 border border-blue-100',
  revoke_role: 'bg-blue-50 text-blue-600 border border-blue-100',
  config_change: 'bg-purple-50 text-purple-600 border border-purple-100',
  create_bookmaker: 'bg-electric-50 text-electric-600 border border-electric-100',
  update_bookmaker: 'bg-electric-50 text-electric-600 border border-electric-100',
  create_payment_provider: 'bg-electric-50 text-electric-600 border border-electric-100',
  update_payment_provider: 'bg-electric-50 text-electric-600 border border-electric-100',
  create_announcement: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  update_announcement: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  delete_announcement: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  transaction_processing: 'bg-yellow-50 text-yellow-600 border border-yellow-100',
  transaction_completed: 'bg-success-50 text-success-600 border border-success-100',
  transaction_rejected: 'bg-red-50 text-red-600 border border-red-100',
  assign_transaction_agent: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  revoke_admin_session: 'bg-red-50 text-red-600 border border-red-100',
};

export default function AdminSurveillance() {
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Onglets
  const [activeTab, setActiveTab] = useState('audit');

  // Audit logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState('');

  // Sessions admin
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');

  // Filtres audit
  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    checkSuperAdmin();
    loadAuditLogs();
    loadSessions();
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsSuperAdmin(res.ok);
    } catch {
      setIsSuperAdmin(false);
    }
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/audit-logs?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/login', { replace: true });
        return;
      }

      if (!res.ok) throw new Error('Erreur lors du chargement des journaux.');

      const data = await res.json();
      setAuditLogs(data.actions || []);
    } catch (err) {
      setAuditError(err.message || 'Erreur inattendue.');
    } finally {
      setAuditLoading(false);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 403) {
        // Pas super_admin, c'est normal — on masque l'onglet sessions
        setSessions([]);
        setSessionsLoading(false);
        return;
      }

      if (!res.ok) throw new Error('Erreur lors du chargement des sessions.');

      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setSessionsError(err.message || 'Erreur inattendue.');
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId, adminEmail) => {
    if (!window.confirm(`Révoquer la session admin de ${adminEmail} ?`)) return;

    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de la révocation.');
      }

      await loadSessions();
    } catch (err) {
      setSessionsError(err.message || 'Erreur inattendue.');
    }
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (filterAdmin && log.admin?.email?.toLowerCase().includes(filterAdmin.toLowerCase()) === false) {
      return false;
    }
    if (filterAction && log.action_type !== filterAction) {
      return false;
    }
    if (filterDateFrom && new Date(log.created_at) < new Date(filterDateFrom)) {
      return false;
    }
    if (filterDateTo && new Date(log.created_at) > new Date(filterDateTo)) {
      return false;
    }
    return true;
  });

  const uniqueAdmins = [...new Set(auditLogs.map((l) => l.admin?.email).filter(Boolean))];
  const uniqueActions = [...new Set(auditLogs.map((l) => l.action_type))];

  if (auditLoading && sessionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-marine-900 font-medium">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-marine-900">Surveillance et sécurité</h1>
        <p className="text-gray-600">
          Consultez les journaux d'audit, les actions administratives et les sessions actives.
        </p>
      </div>

      {auditError && (
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg">
          {auditError}
        </div>
      )}

      {sessionsError && (
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg">
          {sessionsError}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-electric-500 text-electric-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Journaux d'audit ({auditLogs.length})
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'sessions'
                ? 'border-electric-500 text-electric-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Sessions admin ({sessions.length})
          </button>
        )}
      </div>

      {/* Onglet : Journaux d'audit */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Filtres */}
          <div className="card p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Administrateur</label>
                <input
                  type="text"
                  className="input-field w-full"
                  placeholder="Email de l'admin"
                  value={filterAdmin}
                  onChange={(e) => setFilterAdmin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Type d'action</label>
                <select
                  className="input-field w-full"
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                >
                  <option value="">Tous les types</option>
                  {uniqueActions.map((action) => (
                    <option key={action} value={action}>
                      {ACTION_LABELS[action] || action}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Du</label>
                <input
                  type="date"
                  className="input-field w-full"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Au</label>
                <input
                  type="date"
                  className="input-field w-full"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Tableau des logs */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Date et heure</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Administrateur</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Action</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Cible</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Entité</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Détails</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      Aucun journal trouvé.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100">
                      <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                        {new Date(log.created_at).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {log.admin?.email || 'Système'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${ACTION_COLORS[log.action_type] || 'border-gray-100 text-gray-600 bg-gray-50'}`}>
                          {ACTION_LABELS[log.action_type] || log.action_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.target_user_id ? 'Utilisateur #' + log.target_user_id.slice(0, 8) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                        {log.target_entity_type || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 break-all max-w-xs">
                        {log.details && Object.keys(log.details).length > 0 ? (
                          <span className="text-xs font-mono text-gray-500">
                            {JSON.stringify(log.details).slice(0, 100)}{JSON.stringify(log.details).length > 100 ? '…' : ''}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            <p className="font-medium text-marine-900 mb-2">Sécurité des journaux</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Aucun mot de passe, clé secrète ou token d'authentification n'est jamais enregistré dans les journaux.</li>
              <li>Les journaux d'actions administratives sont immuables (pas de suppression ni de modification depuis le client).</li>
              <li>L'accès aux journaux est réservé aux super administrateurs et administrateurs.</li>
              <li>Toutes les actions sensibles (suspension, suppression, changement de rôle, configuration) sont journalisées automatiquement.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Onglet : Sessions admin (super admin uniquement) */}
      {activeTab === 'sessions' && isSuperAdmin && (
        <div className="space-y-6">
          <div className="card p-4">
            <h2 className="text-lg font-bold text-marine-900 mb-4">Sessions administratives actives</h2>
            <p className="text-sm text-gray-600 mb-4">
              Suivi des connexions admin. Une session peut être révoquée en cas de compromis.
            </p>

            {sessionsLoading ? (
              <div className="flex items-center justify-center h-64">
                <span className="text-marine-900 font-medium">Chargement…</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Administrateur</th>
                      <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Dernière activité</th>
                      <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Expire le</th>
                      <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">IP / Navigateur</th>
                      <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Statut</th>
                      <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                          Aucune session active.
                        </td>
                      </tr>
                    ) : (
                      sessions.map((s) => {
                        const expired = new Date(s.expires_at) < new Date();
                        return (
                          <tr key={s.id} className="border-b border-gray-100">
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {s.admin?.email || 'Inconnu'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                              {new Date(s.last_activity).toLocaleString('fr-FR')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                              {new Date(s.expires_at).toLocaleString('fr-FR')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-xs">
                              {s.ip_address || '—'}<br />
                              {(s.user_agent || '').slice(0, 40)}{s.user_agent && s.user_agent.length > 40 ? '…' : ''}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                expired ? 'bg-red-50 text-red-600 border border-red-100' :
                                'bg-success-50 text-success-600 border border-success-100'
                              }`}
                              >
                                {expired ? 'Expirée' : 'Active'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {!expired && (
                                <button
                                  onClick={() => handleRevokeSession(s.id, s.admin?.email || 'inconnu')}
                                  className="text-xs text-danger hover:text-danger/80 font-medium"
                                >
                                  Révoquer
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            <p className="font-medium text-marine-900 mb-2">Politique de conservation</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Les sessions admin expirent automatiquement selon leur date d'expiration.</li>
              <li>Un super administrateur peut révoquer toute session administrative en cas de suspicion de compromission.</li>
              <li>Les journaux d'audit sont conservés indéfiniment pour des besoins de traçabilité et de conformité.</li>
              <li>Aucune donnée sensible (mot de passe, token) n'est stockée dans les sessions ni dans les journaux.</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && !isSuperAdmin && (
        <div className="card p-8 text-center">
          <p className="text-gray-600">
            L'accès aux sessions administratives est réservé aux super administrateurs.
          </p>
        </div>
      )}
    </div>
  );
}
