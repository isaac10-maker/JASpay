/**
 * LeagueStrip — bandeau des grands championnats, en pied de fond animé.
 *
 * Reprend la composition de la référence 1xBet : une ligne discrète de logos
 * monochromes posée en bas des visuels d'arrière-plan.
 *
 * Les quatre premiers sont les championnats que l'utilisateur a explicitement
 * cités : Ligue 1 (France), Premier League (Angleterre), Serie A (Italie),
 * Liga (Espagne). Le cinquième, la Ligue des Champions (UCL), est ajouté pour
 * compléter la ligne : c'est la compétition la plus suivie des parieurs de la
 * zone et sa forme (étoiles, silhouette de coupe) est une création originale,
 * pas une reproduction de blason déposé.
 *
 * Ces marques ne sont pas fournies en image : les formes ci-dessous sont des
 * silhouettes neutres, volontairement génériques, qui doivent être remplacées
 * par les logos officiels dès qu'ils seront disponibles.
 */

const CHAMPIONNATS = [
  {
    id: 'ligue1',
    nom: 'Ligue 1',
    // silhouette : hexagone + ballon stylisé
    svg: (
      <>
        <path d="M12 2.5 21 8v8l-9 5.5L3 16V8l9-5.5Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M12 8.8v-2M12 15.2v2M8.8 12h-2M15.2 12h2" stroke="currentColor" strokeWidth="1.2" />
      </>
    ),
  },
  {
    id: 'premier-league',
    nom: 'Premier League',
    // silhouette : lion assis très simplifié
    svg: (
      <>
        <path
          d="M8 20c-.6-1.6-.4-3 .4-4.2.6-.9 1-1.9.9-3-.1-1.7.7-3.3 2.3-3.9 1.9-.7 4 .2 4.6 2.1.3 1 .2 2-.2 2.9M17 20c.2-1.2 0-2.4-.6-3.4M9.6 8.2c.5-.9 1.4-1.4 2.4-1.5"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="13.4" cy="10.6" r=".7" fill="currentColor" />
        <path d="M7.5 20h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'serie-a',
    nom: 'Serie A',
    // silhouette : écusson avec bande diagonale
    svg: (
      <>
        <path d="M12 2.8 20 5.4v6.3c0 4.2-3.2 7.4-8 9.5-4.8-2.1-8-5.3-8-9.5V5.4L12 2.8Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M8.4 16.6 15.6 6.6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.6 17.6 17.8 7.6" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
  {
    id: 'liga',
    nom: 'LaLiga',
    // silhouette : couronne à trois pointes
    svg: (
      <>
        <path d="M4 16.5 3.2 7.6l4.4 3.1L12 4.8l4.4 5.9 4.4-3.1-.8 8.9H4Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M4.6 18.8h14.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'ucl',
    nom: 'Ligue des Champions',
    // silhouette : coupe à deux anses entourée d'étoiles
    svg: (
      <>
        <path d="M7.6 4h8.8v4.2a4.4 4.4 0 0 1-8.8 0V4Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M7.6 5.6H5.4v1.6a3 3 0 0 0 3 3M16.4 5.6h2.2v1.6a3 3 0 0 1-3 3" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M12 12.6V16M9 16.6h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12 1.4v1M18.2 3.2l-.7.7M5.8 3.2l.7.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </>
    ),
  },
];

export default function LeagueStrip({ className = '' }) {
  return (
    <div
      className={`pointer-events-none select-none flex items-center justify-center gap-6 sm:gap-10 opacity-[0.18] ${className}`}
      aria-label="Championnats partenaires"
    >
      {CHAMPIONNATS.map((c) => (
        <div key={c.id} className="flex flex-col items-center gap-1" title={c.nom}>
          <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-9 sm:h-9 text-white" aria-hidden="true">
            {c.svg}
          </svg>
          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] text-white/70 whitespace-nowrap">
            {c.nom}
          </span>
        </div>
      ))}
    </div>
  );
}
