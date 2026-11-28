import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * MenuMarquee — bande défilante en haut des pages (inspirée du bandeau 1xBet).
 *
 * Les messages viennent de la table `announcements` (type `marquee`), donc
 * l'administrateur les définit depuis sa page : aucun texte n'est codé en dur.
 *
 * Sélection par jour : chaque annonce porte `display_days` (1 = lundi …
 * 7 = dimanche). `NULL` signifie « tous les jours ». La requête filtre côté
 * base avec `contains()`, puis le frontend garde aussi la découpe par jour pour
 * que le message change bien à minuit sans rechargement manuel.
 *
 * Si l'admin n'a rien défini, un jeu de secours est affiché : les bonus de
 * recharge tombent surtout lundi, mercredi et vendredi, donc ces jours-là ont
 * un message plus accrocheur.
 */

// 1 = lundi … 7 = dimanche (convention ISO à laquelle se conforme Postgres/DATE_PART)
const MESSAGES_PAR_DEFAUT = {
  1: "C'est lundi : démarre la semaine avec un bonus de 100 % sur ta recharge et augmente tes chances de gains.",
  2: "Mardi : chaque match compte, dépose aujourd'hui et garde une longueur d'avance.",
  3: "Mercredi, c'est jour de bonus : recharge maintenant et profite de 100 % offerts sur ton dépôt.",
  4: "Jeudi : une petite recharge, un grand pas vers ton prochain gain.",
  5: "Vendredi : le week-end commence fort, recharge avec 100 % de bonus pour attaquer les matchs.",
  6: "Samedi : les gros matchs sont là, sois prêt avec un compte rechargé.",
  7: "Dimanche : termine la semaine en tête, recharge et vise le gain.",
};

const jourIso = () => {
  const d = new Date().getDay(); // 0 = dimanche
  return d === 0 ? 7 : d;
};

export default function MenuMarquee() {
  const [messages, setMessages] = useState([]);
  const [jour, setJour] = useState(jourIso);
  const [reducedMotion, setReducedMotion] = useState(false);
  const trackRef = useRef(null);

  // Préférence d'accessibilité : bandeau figé au lieu d'un défilement continu.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Changement de jour à minuit, sans rechargement.
  useEffect(() => {
    const t = setInterval(() => {
      const j = jourIso();
      if (j !== jour) setJour(j);
    }, 60 * 1000);
    return () => clearInterval(t);
  }, [jour]);

  useEffect(() => {
    let annule = false;

    const charger = async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, content, display_days')
        .eq('type', 'marquee')
        .eq('is_active', true)
        .contains('display_days', [jour]);

      if (annule) return;

      // `contains(['…'])` ne remonte pas les annonces valables tous les jours
      // (`display_days` NULL) : on les récupère par une seconde requête.
      let tousLesJours = [];
      if (!error) {
        const rep = await supabase
          .from('announcements')
          .select('id, content, display_days')
          .eq('type', 'marquee')
          .eq('is_active', true)
          .is('display_days', null);
        tousLesJours = rep.data || [];
      }
      if (annule) return;

      const tous = [...(data || []), ...tousLesJours];
      const textes = tous.map((a) => a.content).filter(Boolean);
      setMessages(textes.length ? textes : [MESSAGES_PAR_DEFAUT[jour]]);
    };

    charger().catch(() => {
      if (!annule) setMessages([MESSAGES_PAR_DEFAUT[jour]]);
    });

    return () => {
      annule = true;
    };
  }, [jour]);

  // Une annonce = un passage. On duplique la liste pour que le défilement soit
  // continu : quand la première copie sort, la seconde prend le relais sans
  // trou visible.
  const boucle = messages.length ? [...messages, ...messages] : [];

  return (
    <div
      className="relative overflow-hidden border-b border-white/10 bg-gradient-to-r from-marine-900/90 via-space-900/95 to-marine-900/90"
      role="marquee"
      aria-label="Annonces du jour"
    >
      <div
        ref={trackRef}
        className={`flex w-max items-center gap-16 py-2 ${reducedMotion ? '' : 'animate-marquee'}`}
        style={{ '--marquee-duration': `${Math.max(messages.length, 1) * 7}s` }}
      >
        {boucle.map((texte, i) => (
          <span
            key={`${i}-${texte.slice(0, 12)}`}
            className="flex items-center gap-3 text-xs sm:text-sm text-white/80 whitespace-nowrap"
            aria-hidden={i >= messages.length}
          >
            <svg className="w-3.5 h-3.5 text-electric-400 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 1l2.4 5.3 5.6.6-4.2 3.9 1.2 5.6L10 13.7 5 16.4l1.2-5.6L2 6.9l5.6-.6L10 1z" />
            </svg>
            {texte}
            <span className="text-electric-500/50">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
