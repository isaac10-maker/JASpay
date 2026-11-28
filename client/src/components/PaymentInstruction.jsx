import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * PaymentInstruction — charte de paiement Mobile Money.
 *
 * Affiche la syntaxe USSD que l'utilisateur doit composer, avec un bouton qui
 * pré-remplit sa numérotation (`tel:`). Les valeurs viennent de la table
 * `payment_instructions` : aucune syntaxe n'est codée en dur dans le frontend,
 * donc un changement de numéro marchand ne demande pas de redéploiement.
 *
 * Deux cas de figure, volontairement traités différemment :
 *  - `requires_receipt = false` (Moov Money) : la syntaxe porte le numéro
 *    marchand, la somme est prélevée directement. L'utilisateur compose et
 *    valide lui-même ; la transaction est initiée par l'opérateur.
 *  - `requires_receipt = true` (Mixx by Yas) : le dépôt part vers un numéro
 *    marchand sans prélèvement automatique. Une personne malveillante pourrait
 *    annuler l'opération, donc une capture du reçu est exigée.
 */
export default function PaymentInstruction({ providerId, direction = 'deposit' }) {
  const [instruction, setInstruction] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let annule = false;
    if (!providerId) {
      setInstruction(null);
      setChargement(false);
      return undefined;
    }

    (async () => {
      const { data } = await supabase
        .from('payment_instructions')
        .select('*')
        .eq('provider_id', providerId)
        .eq('direction', direction)
        .eq('is_active', true)
        .is('bookmaker_id', null)
        .maybeSingle();

      if (!annule) {
        setInstruction(data || null);
        setChargement(false);
      }
    })();

    return () => {
      annule = true;
    };
  }, [providerId, direction]);

  if (chargement || !instruction || !instruction.ussd_code) return null;

  // Le `#` final doit rester littéral : `tel:` l'encode en %23, ce qui suffit
  // à la plupart des composeurs, mais on prépare aussi une version lisible.
  const codeAffiche = `${instruction.ussd_code}${instruction.requires_receipt ? '' : 'montant#'}`;
  const lienTel = `tel:${encodeURIComponent(codeAffiche)}`;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(codeAffiche);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setCopie(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-electric-500/30 bg-electric-500/5 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-white">Syntaxe de dépôt</p>
          <p className="text-xs text-gray-300 mt-0.5">
            {instruction.merchant_name ? `Marchand : ${instruction.merchant_name}` : 'Numéro marchand'}
            {instruction.merchant_number ? ` — ${instruction.merchant_number}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-space-900/80 border border-white/10 px-3 py-2.5 mb-3">
        <code className="text-electric-300 text-sm break-all font-mono select-all">{codeAffiche}</code>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={lienTel}
          className="btn-primary text-xs px-3 py-2 inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 0 1 2-2h2.6a1 1 0 0 1 1 .8l.8 3.6a1 1 0 0 1-.5 1.1L7.5 9.7a12 12 0 0 0 6.8 6.8l1.2-1.4a1 1 0 0 1 1.1-.5l3.6.8a1 1 0 0 1 .8 1V19a2 2 0 0 1-2 2h-1A15 15 0 0 1 3 6V5z" />
          </svg>
          Composer sur mon téléphone
        </a>
        <button type="button" onClick={copier} className="btn-secondary text-xs px-3 py-2">
          {copie ? 'Copié' : 'Copier le code'}
        </button>
      </div>

      {instruction.requires_receipt && (
        <p className="mt-3 text-xs text-amber-300/90 flex items-start gap-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <span>
            Ce dépôt n'est pas prélevé automatiquement. Envoyez la somme au numéro marchand,
            puis joignez la capture du reçu à l'étape suivante : sans elle, la transaction
            peut être annulée et ne sera pas validée par un agent.
          </span>
        </p>
      )}

      {instruction.note && (
        <p className="mt-2 text-xs text-gray-400">{instruction.note}</p>
      )}
    </div>
  );
}
