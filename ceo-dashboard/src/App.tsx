import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TenantList from './pages/TenantList';
import AddTenant from './pages/AddTenant';
import TenantDetail from './pages/TenantDetail';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tenants"
          element={
            <ProtectedLayout>
              <TenantList />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tenants/new"
          element={
            <ProtectedLayout>
              <AddTenant />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tenants/:slug"
          element={
            <ProtectedLayout>
              <TenantDetail />
            </ProtectedLayout>
          }
        />
        <Route
          path="*"
          element={
            <Navigate to={isAuthenticated() ? '/' : '/login'} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
