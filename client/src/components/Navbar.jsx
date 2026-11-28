import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Navbar — Navigation principale JASpay (thème spatial)
 * Glassmorphism modéré, fonds semi-transparents, bordures fines lumineuses.
 * Contrôle d'accès par rôle côté client uniquement pour l'affichage (le contrôle réel est côté serveur).
 */
export default function Navbar() {
  const { user, isAuthenticated: isAuth, signOut, userRoles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };
  const isAdminOrAgent = userRoles.includes('super_admin') || userRoles.includes('admin') || userRoles.includes('agent');

  const navLinks = [
    { path: '/', label: 'Accueil' },
    { path: '/depot', label: 'Dépôt', auth: true },
    { path: '/retrait', label: 'Retrait', auth: true },
    { path: '/transactions', label: 'Mes transactions', auth: true },
    { path: '/saved-numbers', label: 'Mes numéros', auth: true },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="bg-space-900/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 bg-gradient-to-br from-electric-500 to-marine-900 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(14,165,233,0.4)]">
                <span className="text-white font-bold text-sm">J</span>
              </div>
              <span className="font-bold text-xl text-white tracking-tight">JASpay</span>
            </div>

            <div className="hidden md:flex items-center gap-2">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.path ||
                  (link.path !== '/' && location.pathname.startsWith(link.path));
                if (link.auth && !isAuth) return null;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`text-sm font-medium rounded-lg px-4 py-2.5 transition-all duration-200 ${
                      isActive
                        ? 'text-electric-400 bg-white/10 border border-electric-500/30 shadow-[0_0_15px_rgba(14,165,233,0.2)]'
                        : 'text-white/60 hover:text-electric-400 hover:bg-white/5'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {isAuth && isAdminOrAgent && (
                <Link
                  to="/admin"
                  className={`text-sm font-medium rounded-lg px-4 py-2.5 transition-all duration-200 ${
                    location.pathname.startsWith('/admin')
                      ? 'text-electric-400 bg-white/10 border border-electric-500/30 shadow-[0_0_15px_rgba(14,165,233,0.2)]'
                      : 'text-white/60 hover:text-electric-400 hover:bg-white/5'
                  }`}
                >
                  Administration
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isAuth ? (
                <div className="hidden md:flex flex-col items-end">
                  <p className="text-sm font-medium text-white">{user?.email}</p>
                  <p className="text-xs text-white/50 capitalize">
                    {userRoles.length > 0 ? userRoles.join(', ') : 'utilisateur'}
                  </p>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                {isAuth ? (
                  <button
                    onClick={handleLogout}
                    className="btn-danger text-xs px-3 py-1.5"
                  >
                    Déconnexion
                  </button>
                ) : (
                  <>
                    <Link to="/login" className="btn-secondary text-xs px-3 py-1.5">
                      Connexion
                    </Link>
                    <Link to="/register" className="btn-primary text-xs px-3 py-1.5">
                      S'inscrire
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
