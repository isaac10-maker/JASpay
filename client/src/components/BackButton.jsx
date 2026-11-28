import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * BackButton — touche de retour commune à toutes les pages.
 *
 * Design : cohérent avec l'identité JASpay (univers spatial, cyan électrique,
 * halo néon, glassmorphism) telle que définie dans les ressources graphiques :
 *   - pastille circulaire glass avec bordure lumineuse ;
 *   - le libellé sort du cercle au survol (`group-hover`) : au repos le bouton
 *     reste discret, au survol il devient explicite ;
 *   - halo cyan qui se dilate, flèche qui glisse vers la gauche ;
 *   - `btn-scan` réutilise l'animation de balayage déjà présente dans
 *     assets/animations/button-effects.css (chargée par main.jsx).
 *
 * Position : `sticky top-4` — décalé du bord haut (il ne colle pas au coin) et
 * il reste accessible pendant le défilement d'une page longue, sans jamais
 * recouvrir le titre puisque le wrapper est dans le flux.
 *
 * Comportement :
 *   - `to` fourni  : navigation déterministe vers cette route ;
 *   - sinon        : retour arrière ;
 *   - historique vide (lien ouvert dans un nouvel onglet, retour depuis un
 *     e-mail) : repli sur `fallback`. `navigate(-1)` seul laisserait
 *     l'utilisateur bloqué.
 */
export default function BackButton({
  to = null,
  fallback = '/',
  label = 'Retour',
  className = '',
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = useCallback(() => {
    if (to) {
      navigate(to);
      return;
    }

    // location.key vaut 'default' pour l'entrée initiale : aucun historique derrière.
    const idx = typeof window !== 'undefined' ? window.history.state?.idx : undefined;
    const hasHistory = location.key !== 'default' && (idx === undefined || idx > 0);

    if (hasHistory) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [to, fallback, navigate, location.key]);

  // `--back-top` est pose par PageShell (barre de navigation = 64 px).
  // Sans cette marge, le bouton se collerait sous la barre en defilant.
  return (
    <div
      className={`sticky z-30 flex ${className}`}
      style={{ top: 'var(--back-top, 1rem)' }}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        title={label}
        className="btn-scan group relative overflow-hidden inline-flex items-center gap-0 hover:gap-2 h-11 min-w-[2.75rem] pl-0 pr-0 hover:pr-4 rounded-full
                   bg-space-900/70 backdrop-blur-md border border-electric-500/30
                   text-white/80 hover:text-white
                   shadow-[0_0_0_0_rgba(14,165,233,0)] hover:shadow-[0_0_24px_0_rgba(14,165,233,0.45)]
                   transition-all duration-300 ease-out
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-electric-400 focus-visible:ring-offset-2 focus-visible:ring-offset-space-900"
      >
        {/* Halo qui se dilate au survol */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-electric-500/0 group-hover:bg-electric-500/10 transition-colors duration-300"
        />

        {/* Pastille de la flèche */}
        <span
          aria-hidden="true"
          className="relative z-10 grid place-items-center w-11 h-11 shrink-0 rounded-full
                     text-electric-400 group-hover:text-white
                     transition-all duration-300
                     group-hover:-translate-x-0.5"
        >
          <svg
            className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </span>

        {/* Libellé : replié au repos, déployé au survol et au focus clavier */}
        <span
          className="relative z-10 max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium
                     opacity-0 translate-x-1
                     transition-all duration-300 ease-out
                     group-hover:max-w-[16rem] group-hover:opacity-100 group-hover:translate-x-0
                     group-focus-visible:max-w-[16rem] group-focus-visible:opacity-100 group-focus-visible:translate-x-0"
        >
          {label}
        </span>
      </button>
    </div>
  );
}
