import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import jaspayMark from '../assets/images/logos/jaspay-mark.png';
import BackgroundRotation from './BackgroundRotation';
import FloatingElements from './FloatingElements';

/**
 * PageShell — squelette commun aux pages de l'application.
 *
 * Avant ce composant, chaque page recopiait sa propre barre : seule la page
 * d'accueil en avait une, les autres (dépôt, retrait, transactions, numéros)
 * n'avaient aucun menu. La barre vivait donc dans `Dashboard.jsx`, ce qui
 * obligeait à la dupliquer à chaque nouvelle page.
 *
 * Ici la barre est unique et partagée :
 *   - logo officiel JASpay (asset `jaspay-logo.png`) ;
 *   - liens de navigation avec état actif (`NavLink`) ;
 *   - bloc utilisateur + déconnexion ;
 *   - menu mobile (aucun menu n'existait sous 768 px auparavant).
 *
 * Le contenu de la page est passé en `children` et rendu sous la barre.
 * `sticky` (et non `fixed`) : la barre occupe sa hauteur dans le flux, donc
 * elle ne recouvre jamais le début de la page.
 */
export default function PageShell({ children, maxWidth = 'max-w-7xl' }) {
  const { user, signOut, isAdmin, isSuperAdmin, isAgent, isModerator } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdminOrAgent = isSuperAdmin || isAdmin || isAgent || isModerator;

  const links = [
    { to: '/', label: 'Accueil', end: true },
    { to: '/depot', label: 'Dépôt' },
    { to: '/retrait', label: 'Retrait' },
    { to: '/transactions', label: 'Mes transactions' },
    { to: '/saved-numbers', label: 'Mes numéros' },
  ];

  return (
    <div
      // Pas de fond opaque ici : les calques de fond (étoiles, scènes sportives)
      // sont en `fixed z-[-1]` ; un `bg-space-900` sur ce conteneur les masquerait
      // entièrement. La couleur de repli est portée par <body> dans index.css.
      className="min-h-screen text-white relative overflow-x-clip"
      style={{ '--back-top': '5rem' }}
    >
      {/* Fonds communs : scènes sportives en rotation (5 min) + objets flottants.
          Montés ici plutôt que dans chaque page, pour que toute l'application
          partage le même univers visuel. Sans ce montage, ces deux composants
          existaient dans le dépôt mais ne s'affichaient jamais. */}
      <BackgroundRotation />
      <FloatingElements />

      <nav className="sticky top-0 z-50">
        <div className="bg-space-900/80 backdrop-blur-md border-b border-white/10">
          <div className={`${maxWidth} mx-auto px-4 sm:px-6 lg:px-8`}>
            <div className="flex items-center justify-between h-16 gap-3">
              {/* Logo officiel */}
              <Link to="/" className="flex items-center gap-2.5 shrink-0">
                <img
                  src={jaspayMark}
                  alt="JASpay"
                  className="h-9 w-9 rounded-lg drop-shadow-[0_0_14px_rgba(14,165,233,0.45)]"
                  width="36"
                  height="36"
                />
                <span className="font-bold text-lg text-white tracking-tight">JASpay</span>
              </Link>

              {/* Liens — desktop */}
              <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
                {links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      `text-sm font-medium px-3.5 py-2.5 rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'text-electric-400 bg-white/10 border border-electric-500/30 shadow-[0_0_15px_rgba(14,165,233,0.2)]'
                          : 'text-white/60 border border-transparent hover:text-electric-400 hover:bg-white/5'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
                {isAdminOrAgent && (
                  <NavLink
                    to="/admin"
                    className="text-sm font-medium px-3.5 py-2.5 rounded-lg text-electric-400 bg-white/10 border border-electric-500/30 shadow-[0_0_15px_rgba(14,165,233,0.2)]"
                  >
                    Administration
                  </NavLink>
                )}
              </div>

              {/* Bloc utilisateur + menu mobile */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden md:flex flex-col items-end">
                  <p className="text-sm font-medium text-white max-w-[14rem] truncate">{user?.email}</p>
                </div>
                <button
                  onClick={signOut}
                  className="btn-danger text-xs px-3 py-1.5 hidden sm:block"
                >
                  Déconnexion
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                  className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-white/70 hover:text-electric-400 hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    {menuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Panneau mobile */}
        {menuOpen && (
          <div className="md:hidden bg-space-900/95 backdrop-blur-md border-b border-white/10">
            <div className="px-4 sm:px-6 py-3 space-y-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `block text-sm font-medium rounded-lg px-4 py-3 transition-colors ${
                      isActive
                        ? 'text-electric-400 bg-white/10 border border-electric-500/30'
                        : 'text-white/60 hover:text-electric-400 hover:bg-white/5'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              {isAdminOrAgent && (
                <NavLink
                  to="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="block text-sm font-medium rounded-lg px-4 py-3 text-electric-400 bg-white/10 border border-electric-500/30"
                >
                  Administration
                </NavLink>
              )}
              <div className="pt-2 mt-2 border-t border-white/10">
                <p className="px-4 py-2 text-xs text-white/40 truncate">{user?.email}</p>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="w-full text-left text-sm font-medium rounded-lg px-4 py-3 text-danger-400 hover:bg-danger-500/10 transition-colors"
                >
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {children}
    </div>
  );
}
