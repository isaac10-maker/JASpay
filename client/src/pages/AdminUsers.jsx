import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invokeEdge } from '../lib/edgeFunctions';
import BackButton from '../components/BackButton';

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterActive, setFilterActive] = useState('all');
  const [viewingUserId, setViewingUserId] = useState(null);
  const [userDetail, setUserDetail] = useState(null);

  const ROLES = ['super_admin', 'admin', 'agent', 'moderator', 'user'];

  // Récupérer le token JWT depuis la session Supabase
  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  useEffect(() => {
    loadUsers();
  }, [search, filterRole, filterActive]);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterRole !== 'all') params.set('role', filterRole);
      if (filterActive !== 'all') params.set('is_active', filterActive);

      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        `/api/admin/users?${params}`,
        'GET'
      );

      if (err) {
        if (err.status === 401 || err.status === 403) {
          navigate('/login', { replace: true });
          return;
        }
        throw new Error(err.message || 'Erreur lors du chargement des utilisateurs.');
      }

      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  const loadUserDetail = async (userId) => {
    try {
      const token = await getToken();
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        `/api/admin/users/${userId}`,
        'GET'
      );

      if (err) throw new Error(err.message || 'Erreur lors du chargement du profil.');
      setUserDetail(data);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement du profil.');
    }
  };

  const handleSuspend = async (userId, email) => {
    if (!window.confirm(`Voulez-vous vraiment suspendre le compte ${email} ?`)) return;
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        `/api/admin/users/${userId}/suspend`,
        'POST'
      );

      if (err) throw new Error(err.message || 'Erreur lors de la suspension.');
      setSuccess('Compte suspendu.');
      setError('');
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleReactivate = async (userId, email) => {
    if (!window.confirm(`Voulez-vous vraiment réactiver le compte ${email} ?`)) return;
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        `/api/admin/users/${userId}/reactivate`,
        'POST'
      );

      if (err) throw new Error(err.message || 'Erreur lors de la réactivation.');
      setSuccess('Compte réactivé.');
      setError('');
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleDelete = async (userId, email) => {
    if (!window.confirm(`ATTENTION : Voulez-vous vraiment supprimer définitivement le compte ${email} ? Cette action est irréversible.`)) return;
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        `/api/admin/users/${userId}`,
        'DELETE'
      );

      if (err) throw new Error(err.message || 'Erreur lors de la suppression.');
      setSuccess('Compte supprimé.');
      setError('');
      setViewingUserId(null);
      setUserDetail(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleAssignRole = async (userId, role) => {
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        `/api/admin/users/${userId}/roles`,
        'POST',
        { role }
      );

      if (err) throw new Error(err.message || 'Erreur lors de l\'attribution du rôle.');
      setSuccess('Rôle attribué.');
      setError('');
      await loadUsers();
      if (viewingUserId === userId) await loadUserDetail(userId);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleRevokeRole = async (userId, role) => {
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-users',
        `/api/admin/users/${userId}/roles/${role}`,
        'DELETE'
      );

      if (err) throw new Error(err.message || 'Erreur lors de la révocation du rôle.');
      setSuccess('Rôle révoqué.');
      setError('');
      await loadUsers();
      if (viewingUserId === userId) await loadUserDetail(userId);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const ROLE_LABELS = {
    super_admin: 'Super Administrateur',
    admin: 'Administrateur',
    agent: 'Agent',
    moderator: 'Modérateur',
    user: 'Utilisateur',
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
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion des utilisateurs</h1>
          <p className="text-gray-300">
            Consultez et gérez les comptes inscrits sur JASpay.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-success-600/20 border border-success-600/40 text-success-500 text-sm rounded-lg">
          {success}
        </div>
      )}

      {/* Filtres */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-200 mb-1">Recherche</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="Email, référence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-200 mb-1">Rôle</label>
            <select
              className="input-field w-full"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="all">Tous les rôles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-200 mb-1">Statut</label>
            <select
              className="input-field w-full"
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
            >
              <option value="all">Tous les statuts</option>
              <option value="true">Actifs</option>
              <option value="false">Suspendus</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des utilisateurs */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5">
              <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Email</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Rôles</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Statut</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Créé le</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-300 border-b border-white/20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-gray-400">
                  Aucun utilisateur trouvé.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-white/10 hover:bg-white/5">
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(u.roles || []).map((r) => (
                      <span key={r} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        r === 'super_admin' ? 'border-red-500/30 text-red-400 bg-red-500/15' :
                        r === 'admin' ? 'border-blue-500/30 text-blue-400 bg-blue-500/15' :
                        r === 'agent' ? 'border-electric-500/30 text-electric-500 bg-electric-500/10' :
                        r === 'moderator' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/15' :
                        'border-white/10 text-gray-300 bg-white/5'
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.is_active ? 'bg-success-600/15 text-success-500 border border-success-600/30' :
                      'bg-red-500/15 text-red-400 border border-red-500/30'
                    }`}
                    >
                      {u.is_active ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {new Date(u.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => {
                        setViewingUserId(u.id);
                        loadUserDetail(u.id);
                      }}
                      className="text-xs text-electric-500 hover:text-electric-400 font-medium mr-3"
                    >
                      Voir
                    </button>
                    {u.is_active ? (
                      <button
                        onClick={() => handleSuspend(u.id, u.email)}
                        className="text-xs text-orange-400 hover:text-orange-300 font-medium mr-3"
                      >
                        Suspendre
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(u.id, u.email)}
                        className="text-xs text-green-400 hover:text-green-300 font-medium mr-3"
                      >
                        Réactiver
                      </button>
                    )}
                    {u.roles?.includes('super_admin') ? null : (
                      <button
                        onClick={() => handleDelete(u.id, u.email)}
                        className="text-xs text-danger hover:text-danger/80 font-medium"
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Détail utilisateur */}
      {viewingUserId && userDetail && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Détail du compte</h2>
            <button
              onClick={() => setViewingUserId(null)}
              className="text-sm text-gray-400 hover:text-gray-200"
            >
              Fermer
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-400 uppercase">Email</p>
              <p className="text-sm text-gray-200">{userDetail.user.email}</p>

              <p className="text-sm font-semibold text-gray-400 uppercase mt-4">Statut</p>
              <p className={`text-sm font-medium ${
                userDetail.user.is_active ? 'text-green-400' : 'text-red-400'
              }`}>
                {userDetail.user.is_active ? 'Actif' : 'Suspendu'}
              </p>

              <p className="text-sm font-semibold text-gray-400 uppercase mt-4">Rôles</p>
              <div className="flex flex-wrap gap-2">
                {(userDetail.user.roles || []).map((r) => (
                  <span key={r} className="text-xs font-semibold px-2 py-1 rounded bg-white/10 text-gray-200">
                    {ROLE_LABELS[r]}
                  </span>
                ))}
              </div>

              <p className="text-sm font-semibold text-gray-400 uppercase mt-4">Dates</p>
              <p className="text-sm text-gray-200">
                Inscrit le {new Date(userDetail.user.created_at).toLocaleDateString('fr-FR')}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-400 uppercase">Dernières transactions</p>
              {(userDetail.transactions || []).length === 0 ? (
                <p className="text-sm text-gray-400 italic">Aucune transaction.</p>
              ) : (
                <div className="space-y-2">
                  {userDetail.transactions.map((tx) => (
                    <div key={tx.transaction_reference} className="flex justify-between items-center py-2 border-b border-white/10 text-sm">
                      <span className="font-mono text-white">{tx.transaction_reference}</span>
                      <span className="text-gray-300">{tx.transaction_type === 'deposit' ? 'Dépôt' : 'Retrait'} — {tx.amount} {tx.currency}</span>
                      <span className="text-xs font-medium text-gray-400">{tx.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10">
            <h3 className="text-sm font-bold text-white mb-3">Gestion des rôles</h3>
            <div className="space-y-2">
              {ROLES.map((r) => {
                const hasRole = (userDetail.user.roles || []).includes(r);
                return (
                  <div key={r} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <span className="text-sm text-gray-200">{ROLE_LABELS[r]}</span>
                    <div className="flex items-center gap-2">
                      {hasRole ? (
                        <button
                          onClick={() => handleRevokeRole(userDetail.user.id, r)}
                          className="text-xs text-danger hover:text-danger/80 font-medium"
                          disabled={r === 'super_admin' && !userDetail.user.roles.includes('super_admin')}
                        >
                          Révoquer
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAssignRole(userDetail.user.id, r)}
                          className="text-xs text-electric-500 hover:text-electric-400 font-medium"
                        >
                          Attribuer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10">
            {userDetail.user.is_active ? (
              <button
                onClick={() => handleSuspend(userDetail.user.id, userDetail.user.email)}
                className="btn-danger"
              >
                Suspendre le compte
              </button>
            ) : (
              <button
                onClick={() => handleReactivate(userDetail.user.id, userDetail.user.email)}
                className="btn-success"
              >
                Réactiver le compte
              </button>
            )}
            {!userDetail.user.roles.includes('super_admin') && (
              <button
                onClick={() => handleDelete(userDetail.user.id, userDetail.user.email)}
                className="btn-danger ml-3"
              >
                Supprimer le compte
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
