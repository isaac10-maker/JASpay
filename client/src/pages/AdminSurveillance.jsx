import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invokeEdge } from '../lib/edgeFunctions';

const ACTION_LABELS = {
  suspend_user: 'Suspension de compte',
  reactivate_user: 'Réactivation de compte',
  delete_user: 'Suppression de compte',
  assign_role: 'Attribution de rôle',
  revoke_role: 'Révocation de rôle',
  config_change: 'Modification configuration',
  create_bookmaker: 'Création bookmaker',
  update_bookmaker: 'Modification bookmaker',
  create_payment_provider: 'Création opérateur',
  update_payment_provider: 'Modification opérateur',
  create_announcement: 'Création annonce',
  update_announcement: 'Modification annonce',
  delete_announcement: 'Suppression annonce',
  revoke_admin_session: 'Révocation session admin',
  assign_transaction_agent: 'Assignation transaction',
  CREATE_FIRST_SUPER_ADMIN: 'Création premier super admin',
  ASSIGN_ROLE: 'Attribution de rôle',
};

export default function AdminSurveillance() {
  const navigate = useNavigate();
  const [auditLogs, setAuditLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState('');
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  useEffect(() => {
    checkSuperAdmin();
    loadAuditLogs();
    loadSessions();
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-surveillance',
        '/api/admin/sessions',
        'GET'
      );
      setIsSuperAdmin(!err && !!data);
    } catch {
      setIsSuperAdmin(false);
    }
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-surveillance',
        '/api/admin/audit-logs?limit=200',
        'GET'
      );

      if (err) {
        if (err.status === 401 || err.status === 403) {
          navigate('/login', { replace: true });
          return;
        }
        throw new Error(err.message || 'Erreur lors du chargement des journaux.');
      }

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
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-surveillance',
        '/api/admin/sessions',
        'GET'
      );

      if (err) {
        if (err.status === 403) {
          // Pas super_admin, c'est normal — on masque l'onglet sessions
          setSessions([]);
          setSessionsLoading(false);
          return;
        }
        throw new Error(err.message || 'Erreur lors du chargement des sessions.');
      }

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
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-surveillance',
        `/api/admin/sessions/${sessionId}`,
        'DELETE'
      );

      if (err) throw new Error(err.message || 'Erreur lors de la révocation.');

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

  const ACTION_OPTIONS = [
    { value: '', label: 'Toutes les actions' },
    { value: 'suspend_user', label: 'Suspension de compte' },
    { value: 'reactivate_user', label: 'Réactivation de compte' },
    { value: 'delete_user', label: 'Suppression de compte' },
    { value: 'assign_role', label: 'Attribution de rôle' },
    { value: 'revoke_role', label: 'Révocation de rôle' },
    { value: 'config_change', label: 'Modification configuration' },
    { value: 'create_bookmaker', label: 'Création bookmaker' },
    { value: 'update_bookmaker', label: 'Modification bookmaker' },
    { value: 'create_payment_provider', label: 'Création opérateur' },
    { value: 'update_payment_provider', label: 'Modification opérateur' },
    { value: 'create_announcement', label: 'Création annonce' },
    { value: 'update_announcement', label: 'Modification annonce' },
    { value: 'delete_announcement', label: 'Suppression annonce' },
    { value: 'revoke_admin_session', label: 'Révocation session admin' },
  ];

  if (auditLoading || sessionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-white font-medium">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Surveillance et audit</h1>
        <p className="text-gray-300">
          Consultez les journaux d'actions administratives et gérez les sessions actives.
        </p>
      </div>

      {auditError && (
        <div className="p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
          {auditError}
        </div>
      )}

      {sessionsError && (
        <div className="p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
          {sessionsError}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-4 border-b border-white/20 mb-6">
        <button
          onClick={() => { }}
          className="px-4 py-2 text-sm font-medium border-b-2 border-electric-500 text-electric-400"
        >
          Journaux d'audit
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => { }}
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-200"
          >
            Sessions admin
          </button>
        )}
      </div>

      {/* Journaux d'audit */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Journaux d'actions administratives</h2>
          <div className="flex gap-2 mt-4 md:mt-0">
            <input
              type="text"
              placeholder="Filtrer par administrateur…"
              className="input-field w-full md:w-48"
              value={filterAdmin}
              onChange={(e) => setFilterAdmin(e.target.value)}
            />
            <select
              className="input-field w-full md:w-48"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Date</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Administrateur</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Action</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Cible</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Détails</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucune action journalisée.</td></tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/10">
                    <td className="px-4 py-3 text-sm text-gray-200">
                      {new Date(log.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {log.admin?.email || 'Inconnu'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      {ACTION_LABELS[log.action_type] || log.action_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {log.target_entity_type || '-'}: {log.target_entity_id || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {log.details ? JSON.stringify(log.details).slice(0, 80) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sessions admin (super_admin uniquement) */}
      {isSuperAdmin && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Sessions administratives actives</h2>
            <span className="text-xs font-medium text-success-500 bg-success-600/20 px-2 py-1 rounded">
              Super administrateur
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Utilisateur</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Dernière activité</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Expire le</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Statut</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucune session active.</td></tr>
                ) : (
                  sessions.map((s) => {
                    const revoked = s.revoked_at !== null;
                    const expired = new Date(s.expires_at) <= new Date();
                    return (
                      <tr key={s.id} className={`border-b border-white/10 ${revoked || expired ? 'bg-red-500/15' : ''}`}>
                        <td className="px-4 py-3 text-sm text-gray-200">
                          {s.admin?.email || 'Inconnu'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {new Date(s.last_activity).toLocaleString('fr-FR')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {new Date(s.expires_at).toLocaleString('fr-FR')}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            revoked ? 'bg-red-500/15 text-red-400' :
                            expired ? 'bg-orange-500/15 text-orange-400' :
                            'bg-success-600/15 text-success-500'
                          }`}>
                            {revoked ? 'Révoquée' : expired ? 'Expirée' : 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {!revoked && !expired && (
                            <button
                              onClick={() => handleRevokeSession(s.id, s.admin?.email)}
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
        </div>
      )}
    </div>
  );
}