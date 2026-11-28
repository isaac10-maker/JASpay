import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * BackButton — touche de retour commune à toutes les pages.
 *
 * Comportement :
 *   - `to` fourni  : navigation vers cette route (déterministe, préférable quand
 *                    la page a une page parente évidente) ;
 *   - sinon        : retour arrière dans l'historique ;
 *   - si l'historique est vide (lien ouvert directement, nouvel onglet, retour
 *     depuis un e-mail), on retombe sur `fallback` — jamais sur une page blanche.
 *
 * `navigate(-1)` seul est un piège : sur un historique vide, il ne fait rien et
 * l'utilisateur reste bloqué. D'où la double vérification `location.key` et
 * `window.history.state.idx`.
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

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className={`inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-electric-400 transition-colors rounded-lg px-2 py-1.5 -ml-2 focus:outline-none focus:ring-2 focus:ring-electric-500 ${className}`}
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
