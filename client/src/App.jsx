import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards';
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen">
          <Starfield />
          {/* La Navbar globale vivait ici et faisait 64 px de haut (fixed top-0). Aucun
              wrapper ne compensait cette hauteur, donc le haut de chaque page passait
              sous la barre. Elle est retirée : chaque section gère désormais sa propre
              barre (Navbar dans les pages publiques, barre admin dans AdminLayout). */}
          <Routes>
            {/* Visiteurs uniquement : un utilisateur connecté est renvoyé à l'accueil */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            {/* Pages accessibles à tous (liens reçus par e-mail, pages légales) */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/reset-password" element={<Navigate to="/reset-password" replace />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/cgu" element={<CGU />} />
            <Route path="/confidentialite" element={<Confidentialite />} />

            {/* Utilisateur connecté */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/depot" element={<Deposit />} />
              <Route path="/retrait" element={<Withdraw />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/transactions/:id" element={<TransactionDetail />} />
              <Route path="/saved-numbers" element={<SavedNumbers />} />
            </Route>

            {/* Administration (contrôle réel côté serveur + RLS) */}
            <Route element={<ProtectedRoute requiredRole="admin" />}>
              <Route element={<AdminLayout />}>
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="admin/users" element={<AdminUsers />} />
                <Route path="admin/transactions" element={<AdminTransactions />} />
                <Route path="admin/config" element={<AdminConfig />} />
                <Route path="admin/announcements" element={<AdminAnnouncements />} />
                <Route path="admin/audit" element={<AdminSurveillance />} />
              </Route>
            </Route>

            {/* Adresse inconnue */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
