import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export default function SavedNumbers() {
  const { user } = useAuth();
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ phone_number: '', provider_id: '', is_favorite: false });

  const [newNumber, setNewNumber] = useState({ phone_number: '', provider_id: '', is_favorite: false });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadNumbers();
  }, []);

  const loadNumbers = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('user_saved_numbers')
        .select(`
          *,
          provider:payment_providers (name, technical_id)
        `)
        .eq('user_id', user.id)
        .order('is_favorite', { ascending: false })
        .order('created_at', { ascending: false });

      if (err) throw err;
      setNumbers(data || []);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des numéros.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');

    if (!newNumber.phone_number) {
      setError('Veuillez saisir un numéro de téléphone.');
      return;
    }

    setAdding(true);
    try {
      const { error: err } = await supabase
        .from('user_saved_numbers')
        .insert({
          user_id: user.id,
          phone_number: newNumber.phone_number,
          provider_id: newNumber.provider_id || null,
          is_favorite: newNumber.is_favorite || false,
        });

      if (err) throw err;

      setSuccess('Numéro enregistré avec succès.');
      setNewNumber({ phone_number: '', provider_id: '', is_favorite: false });
      await loadNumbers();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'enregistrement.');
    } finally {
      setAdding(false);
    }
  };

  const handleEditStart = (number) => {
    setEditingId(number.id);
    setEditForm({
      phone_number: number.phone_number,
      provider_id: number.provider_id || '',
      is_favorite: number.is_favorite || false,
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditForm({ phone_number: '', provider_id: '', is_favorite: false });
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setError('');

    if (!editForm.phone_number) {
      setError('Veuillez saisir un numéro de téléphone.');
      return;
    }

    try {
      const { error: err } = await supabase
        .from('user_saved_numbers')
        .update({
          phone_number: editForm.phone_number,
          provider_id: editForm.provider_id || null,
          is_favorite: editForm.is_favorite || false,
        })
        .eq('id', editingId)
        .eq('user_id', user.id);

      if (err) throw err;

      setSuccess('Numéro mis à jour.');
      setEditingId(null);
      await loadNumbers();
    } catch (err) {
      setError(err.message || 'Erreur lors de la modification.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce numéro ?')) return;

    try {
      const { error: err } = await supabase
        .from('user_saved_numbers')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (err) throw err;

      setSuccess('Numéro supprimé.');
      await loadNumbers();
    } catch (err) {
      setError(err.message || 'Erreur lors de la suppression.');
    }
  };

  const setFavorite = async (id, currentFavorite) => {
    try {
      const { error: err } = await supabase
        .from('user_saved_numbers')
        .update({ is_favorite: !currentFavorite })
        .eq('id', id)
        .eq('user_id', user.id);

      if (err) throw err;
      await loadNumbers();
    } catch (err) {
      setError(err.message || 'Erreur lors de la mise à jour du favori.');
    }
  };

  const getProviderName = (provider) => {
    if (!provider) return 'Non spécifié';
    return provider.name;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-white font-medium">Chargement…</span>
      </div>
    );
  }

  const addForm = (
    <div className="card mb-6">
      <h2 className="text-lg font-bold text-white mb-4">Ajouter un numéro</h2>
      <form onSubmit={handleAdd} className="space-y-4">
        <div className="space-y-2">
          <label className="label-text">Numéro Mobile Money</label>
          <input
            type="tel"
            className="input-field"
            placeholder="+228 XX XX XX XX"
            value={newNumber.phone_number}
            onChange={(e) => setNewNumber({ ...newNumber, phone_number: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="label-text">Opérateur (optionnel)</label>
          <select
            className="input-field"
            value={newNumber.provider_id}
            onChange={(e) => setNewNumber({ ...newNumber, provider_id: e.target.value })}
          >
            <option value="">-- Choisir un opérateur --</option>
            <option value="mixx">Mixx by Yas</option>
            <option value="flooz">Flooz</option>
            <option value="orange_money">Orange Money</option>
          </select>
        </div>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="is_favorite"
            checked={newNumber.is_favorite}
            onChange={(e) => setNewNumber({ ...newNumber, is_favorite: e.target.checked })}
            className="w-4 h-4 text-electric-500 border-white/20 rounded focus:ring-electric-500"
          />
          <label htmlFor="is_favorite" className="text-sm text-gray-200 leading-none">
            Définir comme numéro favori
          </label>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={adding}>
          {adding ? 'Enregistrement…' : 'Enregistrer ce numéro'}
        </button>
      </form>
    </div>
  );

  const numbersList = numbers.length === 0 ? (
    <div className="card text-center py-8">
      <p className="text-gray-300">
        Aucun numéro enregistré pour le moment.
      </p>
    </div>
  ) : (
    <div className="space-y-3">
      {numbers.map((num) => (
        <div key={num.id} className="card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold">
              {num.phone_number.substring(0, 2)}
            </div>
            <div>
              <div className="font-medium text-white">{num.phone_number}</div>
              <div className="text-xs text-gray-400">
                {getProviderName(num.provider)} • {num.is_favorite ? 'Favori' : 'Standard'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            {num.is_favorite ? (
              <button
                onClick={() => setFavorite(num.id, true)}
                className="text-xs text-success-500 hover:text-success-500 font-medium"
              >
                Retirer des favoris
              </button>
            ) : (
              <button
                onClick={() => setFavorite(num.id, false)}
                className="text-xs text-gray-300 hover:text-white font-medium"
              >
                Définir comme favori
              </button>
            )}
            <button
              onClick={() => handleEditStart(num)}
              className="text-xs text-electric-500 hover:text-electric-400 font-medium"
            >
              Modifier
            </button>
            <button
              onClick={() => handleDelete(num.id)}
              className="text-xs text-danger hover:text-danger/80 font-medium"
            >
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const editFormSection = editingId ? (
    <div className="card p-4 mt-4 border border-electric-500/30 bg-electric-500/10">
      <h3 className="text-sm font-bold text-white mb-3">Modifier le numéro</h3>
      <form onSubmit={handleEditSave} className="space-y-3">
        <div className="space-y-2">
          <label className="label-text">Numéro</label>
          <input
            type="tel"
            className="input-field"
            value={editForm.phone_number}
            onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="label-text">Opérateur</label>
          <select
            className="input-field"
            value={editForm.provider_id}
            onChange={(e) => setEditForm({ ...editForm, provider_id: e.target.value })}
          >
            <option value="">-- Choisir un opérateur --</option>
            <option value="mixx">Mixx by Yas</option>
            <option value="flooz">Flooz</option>
            <option value="orange_money">Orange Money</option>
          </select>
        </div>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id={`edit_fav_${editingId}`}
            checked={editForm.is_favorite}
            onChange={(e) => setEditForm({ ...editForm, is_favorite: e.target.checked })}
            className="w-4 h-4 text-electric-500 border-white/20 rounded focus:ring-electric-500"
          />
          <label htmlFor={`edit_fav_${editingId}`} className="text-sm text-gray-200 leading-none">
            Numéro favori
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary w-full sm:w-auto">
            Enregistrer
          </button>
          <button
            type="button"
            onClick={handleEditCancel}
            className="btn-secondary w-full sm:w-auto"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Mes numéros enregistrés</h1>
            <p className="text-gray-300">
              Gérez vos numéros Mobile Money pour vos prochaines opérations.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-danger/20 border border-danger/40 text-danger text-sm rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-3 bg-success-600/20 border border-success-600/40 text-success-500 text-sm rounded-lg">
            {success}
          </div>
        )}

        {addForm}
        <h2 className="text-lg font-bold text-white mb-4">Vos numéros enregistrés</h2>
        {numbersList}
        {editFormSection}

        <div className="mt-8 p-4 bg-white/5 rounded-lg text-sm text-gray-300">
          <p className="font-medium text-white mb-2">Comment utiliser vos numéros enregistrés ?</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Lors d'un dépôt ou d'un retrait, vos numéros enregistrés vous seront proposés.</li>
            <li>Un numéro favori s'affichera en priorité dans les formulaires.</li>
            <li>Chaque numéro appartient exclusivement à votre compte.</li>
            <li>Vous pouvez modifier ou supprimer un numéro à tout moment.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
