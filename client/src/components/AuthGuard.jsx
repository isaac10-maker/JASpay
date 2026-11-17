import { useEffect, useState } from 'react';
import { navigate } from 'react-router-dom'; // sera utilisé si react-router installé
import { useAuth } from '../hooks/useAuth';

/**
 * AuthGuard protège une route contre l'accès non authentifié.
 * - Si l'utilisateur n'est pas connecté → redirection vers /login
 * - Si connecté → rend les enfants
 *
 * Usage :
 *   <AuthGuard requiredRole="super_admin">
 *     <AdminDashboard />
 *   </AuthGuard>
 */
export function AuthGuard({ children, requiredRole, redirectTo = '/login' }) {
  const { user, profile, loading, isAdmin, isAgent, isModerator } = useAuth();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Redirection gérée par le composant parent (App.jsx)
      setAuthorized(false);
      return;
    }

    // Vérification du rôle si exigée
    if (requiredRole) {
      let hasRole = false;
      switch (requiredRole) {
        case 'super_admin':
          hasRole = profile?.role === 'super_admin';
          break;
        case 'admin':
          hasRole = profile?.role === 'super_admin' || profile?.role === 'admin';
          break;
        case 'agent':
          hasRole = ['super_admin', 'admin', 'agent'].includes(profile?.role);
          break;
        case 'moderator':
          hasRole = ['super_admin', 'admin', 'agent', 'moderator'].includes(profile?.role);
          break;
        case 'user':
          hasRole = true;
          break;
        default:
          hasRole = false;
      }
      setAuthorized(hasRole);
    } else {
      setAuthorized(true);
    }
  }, [user, profile, loading, requiredRole, isAdmin, isAgent, isModerator]);

  if (loading) {
    return null; // ou un squelette de chargement
  }

  if (!user) {
    return null; // App.jsx gère la redirection
  }

  if (!authorized) {
    return null; // Accès refusé
  }

  return children;
}

export default AuthGuard;
