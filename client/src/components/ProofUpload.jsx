import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * ProofUpload — jointure de la capture du reçu de dépôt.
 *
 * Utilisé quand le dépôt part vers un numéro marchand sans prélèvement
 * automatique (Mixx by Yas) : la preuve de paiement est la seule trace fiable.
 *
 * Le fichier est envoyé dans le bucket privé `payment-proofs`, rangé par
 * identifiant utilisateur. Le chemin est ensuite enregistré sur la transaction
 * (`payment_proof_path`), pour qu'un agent puisse consulter l'image via une URL
 * signée — jamais publique.
 */
const MAX_MO = 5;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProofUpload({ userId, value, onChange, disabled = false }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [apercu, setApercu] = useState(null);

  const choisir = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;

    setErreur('');

    if (!TYPES.includes(fichier.type)) {
      setErreur('Format accepté : JPEG, PNG ou WebP.');
      return;
    }
    if (fichier.size > MAX_MO * 1024 * 1024) {
      setErreur(`La capture ne doit pas dépasser ${MAX_MO} Mo.`);
      return;
    }

    setApercu(URL.createObjectURL(fichier));
    setEnvoi(true);

    try {
      const ext = fichier.name.split('.').pop()?.toLowerCase() || 'jpg';
      const chemin = `${userId}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from('payment-proofs')
        .upload(chemin, fichier, { contentType: fichier.type, upsert: false });

      if (error) throw error;
      onChange(chemin);
    } catch (err) {
      setErreur(err.message || "L'envoi de la capture a échoué.");
      setApercu(null);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div>
      <label className="label-text block mb-2">Capture du reçu de dépôt *</label>

      <label
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
          value
            ? 'border-success-500/50 bg-success-500/5'
            : 'border-white/20 hover:border-electric-500/60 hover:bg-white/5'
        } ${disabled || envoi ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input type="file" accept={TYPES.join(',')} onChange={choisir} className="hidden" disabled={disabled || envoi} />

        {envoi ? (
          <span className="text-sm text-gray-300">Envoi en cours…</span>
        ) : value ? (
          <>
            <svg className="w-7 h-7 text-success-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-success-300">Capture jointe</span>
            <span className="text-xs text-gray-400">Cliquez pour remplacer</span>
          </>
        ) : (
          <>
            <svg className="w-7 h-7 text-electric-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.5M12 3v12m0-12 4 4m-4-4L8 7" />
            </svg>
            <span className="text-sm text-gray-300">Joindre la capture du reçu</span>
            <span className="text-xs text-gray-500">JPEG, PNG ou WebP — {MAX_MO} Mo max.</span>
          </>
        )}
      </label>

      {apercu && (
        <div className="mt-3 flex items-center gap-3">
          <img src={apercu} alt="Aperçu du reçu" className="w-16 h-16 object-cover rounded-lg border border-white/15" />
          <span className="text-xs text-gray-400">Vérifiez que le montant et l'heure sont lisibles.</span>
        </div>
      )}

      {erreur && <p className="mt-2 text-xs text-danger-400">{erreur}</p>}
    </div>
  );
}
