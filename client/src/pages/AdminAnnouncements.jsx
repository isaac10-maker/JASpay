import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:3001/api';

const TYPE_LABELS = {
  info: 'Information',
  warning: 'Avertissement',
  error: 'Erreur',
  success: 'Succès',
};

const TYPE_COLORS = {
  info: 'bg-blue-50 text-blue-600 border border-blue-100',
  warning: 'bg-orange-50 text-orange-600 border border-orange-100',
  error: 'bg-red-50 text-red-600 border border-red-100',
  success: 'bg-success-50 text-success-600 border border-success-100',
};

export default function AdminAnnouncements() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Formulaire
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'info',
    is_active: true,
    starts_at: '',
    ends_at: '',
  });

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/login', { replace: true });
        return;
      }

      if (!res.ok) throw new Error('Erreur lors du chargement des annonces.');

      const data = await res.json();
      setAnnouncements(data.announcements || []);
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setForm({
      title: '',
      content: '',
      type: 'info',
      is_active: true,
      starts_at: '',
      ends_at: '',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const token = localStorage.getItem('jaspay_token');
      const payload = {
        title: form.title,
        content: form.content,
        type: form.type,
        is_active: form.is_active,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };

      const res = isEditing && editingId
        ? await fetch(`${API_BASE}/admin/announcements/${editingId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          })
        : await fetch(`${API_BASE}/admin/announcements`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de l\'enregistrement.');
      }

      setSuccess(isEditing ? 'Annonce modifiée.' : 'Annonce créée.');
      resetForm();
      await loadAnnouncements();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleEdit = (announcement) => {
    setIsEditing(true);
    setEditingId(announcement.id);
    setForm({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type || 'info',
      is_active: announcement.is_active,
      starts_at: announcement.starts_at ? announcement.starts_at.slice(0, 16) : '',
      ends_at: announcement.ends_at ? announcement.ends_at.slice(0, 16) : '',
    });
  };

  const handleToggleActive = async (id, currentActive, title) => {
    if (!window.confirm(`Voulez-vous vraiment ${currentActive ? 'dépublicer' : 'publier'} l'annonce "${title}" ?`)) return;

    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/announcements/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors du changement de statut.');
      }

      setSuccess(`Annonce ${!currentActive ? 'publiée' : 'dépubliée'}.`);
      await loadAnnouncements();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleArchive = async (id, title) => {
    if (!window.confirm(`ATTENTION : Voulez-vous vraiment archiver définitivement l'annonce "${title}" ? Cette action est irréversible.`)) return;

    try {
      const token = localStorage.getItem('jaspay_token');
      const res = await fetch(`${API_BASE}/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de l\'archivage.');
      }

      setSuccess('Annonce archivée.');
      await loadAnnouncements();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const isExpired = (endsAt) => {
    if (!endsAt) return false;
    return new Date(endsAt) < new Date();
  };

  const isScheduled = (startsAt) => {
    if (!startsAt) return false;
    return new Date(startsAt) > new Date();
  };

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
          <h1 className="text-2xl font-bold text-marine-900">Annonces de la plateforme</h1>
          <p className="text-gray-600">
            Diffusez des informations, alertes et messages aux utilisateurs de JASpay.
          </p>
        </div>
        <button
          onClick={resetForm}
          className="mt-4 md:mt-0 btn-primary"
        >
          {isEditing ? 'Nouvelle annonce' : 'Créer une annonce'}
        </button>
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

      {/* Formulaire de création / modification */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-marine-900 mb-4">
          {isEditing ? 'Modifier l\'annonce' : 'Créer une nouvelle annonce'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Titre *</label>
              <input
                type="text"
                className="input-field w-full"
                placeholder="Ex: Maintenance programmée"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                maxLength="200"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                className="input-field w-full"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Contenu *</label>
            <textarea
              className="input-field w-full"
              rows="4"
              placeholder="Message à afficher aux utilisateurs..."
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Date de début</label>
              <input
                type="datetime-local"
                className="input-field w-full"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Laisser vide pour publication immédiate.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Date d'expiration</label>
              <input
                type="datetime-local"
                className="input-field w-full"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Laisser vue pour pas d'expiration.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-4 h-4 text-electric-500 border-gray-300 rounded focus:ring-electric-500"
              />
              <label className="text-sm text-gray-700 leading-none">Actif / publié</label>
            </div>
          </div>

          <button type="submit" className="btn-primary w-auto">
            {isEditing ? 'Enregistrer les modifications' : 'Créer l\'annonce'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="text-sm text-gray-500 hover:text-gray-700 ml-3"
            disabled={!isEditing}
          >
            Annuler
          </button>
        </form>
      </div>

      {/* Liste des annonces */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-marine-900 mb-4">Annonces existantes</h2>

        {announcements.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Aucune annonce configurée.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Titre</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Type</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Statut</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Période</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Créé le</th>
                  <th className="px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((a) => {
                  const expired = isExpired(a.ends_at);
                  const scheduled = isScheduled(a.starts_at);
                  const status = !a.is_active ? 'Dépubliée' : expired ? 'Expirée' : scheduled ? 'Programmée' : 'Active';
                  return (
                    <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700 font-medium">{a.title}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_COLORS[a.type] || TYPE_COLORS.info}`}>
                          {TYPE_LABELS[a.type] || a.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          a.is_active && !expired && !scheduled
                            ? 'bg-success-50 text-success-600 border border-success-100'
                            : !a.is_active
                              ? 'bg-red-50 text-red-600 border border-red-100'
                              : 'bg-gray-50 text-gray-600 border border-gray-100'
                        }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="text-xs">
                          {a.starts_at ? `Début : ${new Date(a.starts_at).toLocaleString('fr-FR')}` : 'Immédiat'}
                          {a.ends_at ? (
                            <>
                              <br />
                              Fin : {new Date(a.ends_at).toLocaleString('fr-FR')}
                            </>
                          ) : (
                            <span className="text-gray-400 ml-2">— pas d'expiration —</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(a.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(a)}
                            className="text-xs text-electric-500 hover:text-electric-600 font-medium"
                          >
                            Modifier
                          </button>
                          {a.is_active ? (
                            <button
                              onClick={() => handleToggleActive(a.id, true, a.title)}
                              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                            >
                              Dépublicer
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleActive(a.id, false, a.title)}
                              className="text-xs text-green-600 hover:text-green-700 font-medium"
                            >
                              Publier
                            </button>
                          )}
                          <button
                            onClick={() => handleArchive(a.id, a.title)}
                            className="text-xs text-danger hover:text-danger/80 font-medium"
                          >
                            Archiver
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p className="font-medium text-marine-900 mb-2">Règles de publication</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Seuls les super administrateurs et administrateurs peuvent créer, modifier et archiver des annonces.</li>
          <li>Une annonce archivée est définitivement supprimée (pas de restauration).</li>
          <li>Les dates de début et d'expiration contrôlent l'affichage aux utilisateurs.</li>
          <li>Toute modification est journalisée dans l'historique des actions administratives.</li>
        </ul>
      </div>
    </div>
  );
}
