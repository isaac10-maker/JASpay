import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invokeEdge } from '../lib/edgeFunctions';

const TYPE_LABELS = {
  info: 'Information',
  warning: 'Avertissement',
  error: 'Erreur',
  success: 'Succès',
};

export default function AdminAnnouncements() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-config',
        '/api/admin/announcements',
        'GET'
      );

      if (err) {
        if (err.status === 401 || err.status === 403) {
          navigate('/login', { replace: true });
          return;
        }
        throw new Error(err.message || 'Erreur lors du chargement des annonces.');
      }

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
      const payload = {
        title: form.title,
        content: form.content,
        type: form.type,
        is_active: form.is_active,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };

      const { data, error: err } = isEditing && editingId
        ? await invokeEdge(
            'jaspay-admin-config',
            `/api/admin/announcements/${editingId}`,
            'PUT',
            payload
          )
        : await invokeEdge(
            'jaspay-admin-config',
            '/api/admin/announcements',
            'POST',
            payload
          );

      if (err) throw new Error(err.message || 'Erreur lors de l\'enregistrement.');

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
    if (!window.confirm(`Voulez-vous vraiment ${currentActive ? 'dépublicer' : 'publier'} l'annonce \"${title}\" ?`)) return;

    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-config',
        `/api/admin/announcements/${id}`,
        'PUT',
        { is_active: !currentActive }
      );

      if (err) throw new Error(err.message || 'Erreur lors du changement de statut.');

      setSuccess(`Annonce ${!currentActive ? 'publiée' : 'dépubliée'}.`);
      await loadAnnouncements();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
  };

  const handleArchive = async (id, title) => {
    if (!window.confirm(`ATTENTION : Voulez-vous vraiment archiver définitivement l'annonce \"${title}\" ? Cette action est irréversible.`)) return;

    try {
      const { data, error: err } = await invokeEdge(
        'jaspay-admin-config',
        `/api/admin/announcements/${id}`,
        'DELETE'
      );

      if (err) throw new Error(err.message || 'Erreur lors de l\'archivage.');

      setSuccess('Annonce archivée.');
      await loadAnnouncements();
    } catch (err) {
      setError(err.message || 'Erreur inattendue.');
    }
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
          <h1 className="text-2xl font-bold text-marine-900">Gestion des annonces</h1>
          <p className="text-gray-600">
            Créez, modifiez et archivez les annonces affichées aux utilisateurs.
          </p>
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

      {/* Formulaire */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-marine-900 mb-4">
          {isEditing ? 'Modifier l\'annonce' : 'Créer une annonce'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Titre</label>
            <input
              type="text"
              className="input-field w-full"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Contenu</label>
            <textarea
              className="input-field w-full"
              rows={4}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
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
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Début</label>
              <input
                type="datetime-local"
                className="input-field w-full"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Fin</label>
              <input
                type="datetime-local"
                className="input-field w-full"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 text-electric-500 border-gray-300 rounded focus:ring-electric-500"
            />
            <label className="text-sm text-gray-700 leading-none">Active</label>
          </div>
          <button type="submit" className="btn-primary w-full">
            {isEditing ? 'Modifier' : 'Créer'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="btn-secondary w-full"
            >
              Annuler
            </button>
          )}
        </form>
      </div>

      {/* Liste des annonces */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-marine-900 mb-4">Annonces existantes</h2>
        {announcements.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Aucune annonce.</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="flex justify-between items-center p-4 border border-gray-100 rounded-lg bg-gray-50">
                <div>
                  <h3 className="font-bold text-marine-900">{a.title}</h3>
                  <p className="text-sm text-gray-600">{a.content}</p>
                  <div className="flex gap-3 text-xs mt-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                      a.type === 'info' ? 'bg-blue-50 text-blue-600' :
                      a.type === 'warning' ? 'bg-yellow-50 text-yellow-600' :
                      a.type === 'error' ? 'bg-red-50 text-red-600' :
                      'bg-success-50 text-success-600'
                    }`}>
                      {TYPE_LABELS[a.type] || a.type}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                      a.is_active ? 'bg-success-50 text-success-600' :
                      'bg-gray-50 text-gray-600'
                    }`}>
                      {a.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(a)}
                    className="text-xs text-electric-500 hover:text-electric-600 font-medium"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleToggleActive(a.id, a.is_active, a.title)}
                    className="text-xs font-medium"
                    style={{ color: a.is_active ? '#dc2626' : '#16a34a' }}
                  >
                    {a.is_active ? 'Dépublicer' : 'Publier'}
                  </button>
                  <button
                    onClick={() => handleArchive(a.id, a.title)}
                    className="text-xs text-danger hover:text-danger/80 font-medium"
                  >
                    Archiver
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}