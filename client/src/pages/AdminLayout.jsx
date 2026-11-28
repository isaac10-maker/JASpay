import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * AdminLayout — Disposition de l'espace administrateur (thème spatial).
 * N'est jamais rendue dans la navigation des utilisateurs ordinaires.
 * Le contrôle d'accès est effectué côté serveur (backend + RLS).
 */
export default function AdminLayout() {
  const { user, userRoles, isAuthenticated, signOut } = useAuth();
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
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {/* Barre supérieure admin - glassmorphism */}
      <header className="bg-space-900/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 bg-gradient-to-br from-electric-500 to-marine-900 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(14,165,233,0.4)]">
                <span className="text-white font-bold text-sm">J</span>
              </div>
              <span className="font-bold text-lg text-white tracking-tight">JASpay Admin</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/70 capitalize">
                {user?.email}
              </span>
              <span className="text-xs text-electric-300 bg-electric-500/10 px-2 py-1 rounded border border-electric-500/20">
                {userRoles.length > 0 ? userRoles.join(', ') : 'admin'}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-white/70 hover:text-electric-400 transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar - glassmorphism flottante */}
        <aside className="hidden md:flex shrink-0 w-64 bg-white/5 border-r border-white/10 backdrop-blur-md flex-col z-30">
          <div className="p-4">
            <nav className="space-y-1">
              {sidebarItems.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/admin' && location.pathname.startsWith(item.path));
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-white/10 text-white border border-electric-500/30 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                        : 'text-white/50 hover:text-white hover:bg-white/5 hover:border-white/10'
                    }`}
                  >
                    <span className="w-6 text-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Contenu principal */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
