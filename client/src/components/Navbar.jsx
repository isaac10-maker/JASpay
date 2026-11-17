import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar({ isAuthenticated, onLogout }) {
  const { user, isAuthenticated: hookIsAuthenticated, onLogout: hookSignOut, userRoles } = useAuth();
  const location = useLocation();

  const isAuth = hookIsAuthenticated || isAuthenticated;
  const signOut = hookSignOut || onLogout;
  const isAdminOrAgent = userRoles.includes('super_admin') || userRoles.includes('admin') || userRoles.includes('agent');

  return (
    <nav className="bg-marine-900/95 backdrop-blur-md border-b border-marine-900/30 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-electric-500 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">J</span>
            </div>
            <span className="font-bold text-xl text-white tracking-tight">JASpay</span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <Link to="/" className={`text-sm font-medium rounded-md px-3 py-2 transition-colors ${location.pathname === '/' ? 'text-electric-400 bg-marine-800/30' : 'text-gray-300 hover:text-electric-400'}`}>
              Accueil
            </Link>
            {isAuth && (
              <>
                <Link to="/depot" className={`text-sm font-medium rounded-md px-3 py-2 transition-colors ${location.pathname === '/depot' ? 'text-electric-400 bg-marine-800/30' : 'text-gray-300 hover:text-electric-400'}`}>
                  Dépôt
                </Link>
                <Link to="/retrait" className={`text-sm font-medium rounded-md px-3 py-2 transition-colors ${location.pathname === '/retrait' ? 'text-electric-400 bg-marine-800/30' : 'text-gray-300 hover:text-electric-400'}`}>
                  Retrait
                </Link>
                <Link to="/transactions" className={`text-sm font-medium rounded-md px-3 py-2 transition-colors ${location.pathname === '/transactions' ? 'text-electric-400 bg-marine-800/30' : 'text-gray-300 hover:text-electric-400'}`}>
                  Mes transactions
                </Link>
                <Link to="/saved-numbers" className={`text-sm font-medium rounded-md px-3 py-2 transition-colors ${location.pathname === '/saved-numbers' ? 'text-electric-400 bg-marine-800/30' : 'text-gray-300 hover:text-electric-400'}`}>
                  Mes numéros
                </Link>
                <Link to="/assistance" className="text-sm font-medium rounded-md px-3 py-2 transition-colors text-gray-300 hover:text-electric-400">
                  Assistance
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            {isAuth ? (
              <div className="flex items-center gap-4">
                <div className="hidden md:flex flex-col items-end">
                  <p className="text-sm font-medium text-white">{user?.email}</p>
                  <p className="text-xs text-gray-400 capitalize">
                    {userRoles.length > 0 ? userRoles.join(', ') : 'utilisateur'}
                  </p>
                </div>
                <button
                  onClick={signOut}
                  className="btn-danger text-xs px-3 py-1.5"
                >
                  Déconnexion
                </button>
              </div>
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
    </nav>
  );
}
