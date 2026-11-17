import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * AdminLayout — Disposition de l'espace administrateur.
 * N'est jamais rendue dans la navigation des utilisateurs ordinaires.
 * Le contrôle d'accès est effectué côté serveur (backend + RLS).
 */
export default function AdminLayout() {
  const { user, userRoles, isAuthenticated, onLogout: hookSignOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdminOrSuper = userRoles.includes('super_admin') || userRoles.includes('admin');

  const sidebarItems = [
    { path: '/admin', label: 'Tableau de bord', icon: '📊' },
    { path: '/admin/users', label: 'Utilisateurs', icon: '👥' },
    { path: '/admin/transactions', label: 'Transactions', icon: '💱' },
    { path: '/admin/agents', label: 'Agents et rôles', icon: '🛡️' },
    { path: '/admin/config', label: 'Configuration', icon: '⚙️' },
    { path: '/admin/announcements', label: 'Annonces', icon: '📢' },
    { path: '/admin/audit', label: 'Surveillance', icon: '🔍' },
  ];

  // Vérifier si l'utilisateur a accès à l'admin
  if (!isAuthenticated || !isAdminOrSuper) {
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Barre supérieure admin */}
      <header className="bg-marine-900 text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-electric-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">J</span>
              </div>
              <span className="font-bold text-lg text-white tracking-tight">JASpay Admin</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300 capitalize">
                {user?.email}
              </span>
              <span className="text-xs text-gray-400 bg-marine-800/50 px-2 py-1 rounded">
                {userRoles.length > 0 ? userRoles.join(', ') : 'admin'}
              </span>
              <button
                onClick={hookSignOut}
                className="text-sm hover:text-electric-400 transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="hidden w-64 bg-white border-r border-gray-200 flex-col">
          <div className="p-4">
            <nav className="space-y-1">
              {sidebarItems.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/admin' && location.pathname.startsWith(item.path));
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                      isActive
                        ? 'bg-marine-50 text-marine-900 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-marine-900'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Contenu principal */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
