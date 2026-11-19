import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';
import CGU from './pages/CGU';
import Confidentialite from './pages/Confidentialite';
import Dashboard from './pages/Dashboard';
import Deposit from './pages/Deposit';
import Withdraw from './pages/Withdraw';
import Transactions from './pages/Transactions';
import SavedNumbers from './pages/SavedNumbers';
import TransactionDetail from './pages/TransactionDetail';
import AdminLayout from './pages/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminTransactions from './pages/AdminTransactions';
import AdminConfig from './pages/AdminConfig';
import AdminAnnouncements from './pages/AdminAnnouncements';
import AdminSurveillance from './pages/AdminSurveillance';
import Starfield from './components/Starfield';

/**
 * Route protégée : rend le composant enfant uniquement si l'utilisateur est authentifié.
 * Le contrôle de rôle repose exclusivement sur `user_roles` (source de vérité côté serveur).
 */
function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, isAdmin, isSuperAdmin, isAgent, isModerator, hasRole } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    let hasAccess = false;
    switch (requiredRole) {
      case 'super_admin':
        hasAccess = isSuperAdmin;
        break;
      case 'admin':
        hasAccess = isAdmin;
        break;
      case 'agent':
        hasAccess = isSuperAdmin || isAdmin || isAgent;
        break;
      case 'moderator':
        hasAccess = isSuperAdmin || isAdmin || isAgent || isModerator;
        break;
      default:
        hasAccess = true;
    }
    if (!hasAccess) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}

export default function App() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setInitialized(true);
    });
  }, []);

  if (!initialized) {
    return null;
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <Starfield />
        <Navbar />

        <Routes>
          {/* Pages publiques */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/cgu" element={<CGU />} />
          <Route path="/confidentialite" element={<Confidentialite />} />

          {/* Routes protégées (utilisateur connecté) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/depot" element={<Deposit />} />
            <Route path="/retrait" element={<Withdraw />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transactions/:id" element={<TransactionDetail />} />
            <Route path="/saved-numbers" element={<SavedNumbers />} />
          </Route>

          {/* Routes admin (layout AdminLayout, contrôle d'accès côté serveur + RLS) */}
          <Route
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/transactions" element={<AdminTransactions />} />
            <Route path="admin/config" element={<AdminConfig />} />
            <Route path="admin/announcements" element={<AdminAnnouncements />} />
            <Route path="admin/audit" element={<AdminSurveillance />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}
