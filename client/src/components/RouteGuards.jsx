import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-space-900" role="status" aria-label="Chargement">
      <svg className="w-8 h-8 text-electric-400 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  );
}

/**
 * Route protégée.
 * - attend la fin du chargement de l'authentification (plus de redirection parasite au rechargement) ;
 * - sans `children`, rend <Outlet /> (utilisable comme route de mise en page) ;
 * - le contrôle de rôle repose sur `user_roles` (le contrôle réel reste côté serveur + RLS).
 */
export function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, isAdmin, isSuperAdmin, isAgent, isModerator } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (requiredRole) {
    let hasAccess;
    switch (requiredRole) {
      case 'super_admin':
        hasAccess = isSuperAdmin;
        break;
      case 'admin':
        hasAccess = isAdmin;
        break;
      case 'agent':
        hasAccess = isAdmin || isAgent;
        break;
      case 'moderator':
        hasAccess = isAdmin || isAgent || isModerator;
        break;
      default:
        hasAccess = true;
    }
    if (!hasAccess) return <Navigate to="/" replace />;
  }

  return children ?? <Outlet />;
}

/** Pages réservées aux visiteurs (connexion, inscription) : un utilisateur connecté est renvoyé à l'accueil. */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (user) {
    const target = location.state?.from?.pathname || '/';
    return <Navigate to={target} replace />;
  }
  return children ?? <Outlet />;
}
