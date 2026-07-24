import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './components/toast';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ControlsPage } from './pages/ControlsPage';
import { ControlDetailPage } from './pages/ControlDetailPage';
import { AuditPage } from './pages/AuditPage';
import { TeamPage } from './pages/TeamPage';
import { ImportPage } from './pages/ImportPage';
import { AiSettingsPage } from './pages/AiSettingsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireManagerOrAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'manager') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/controls" element={<ControlsPage />} />
            <Route path="/controls/:id" element={<ControlDetailPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route
              path="/imports"
              element={
                <RequireManagerOrAdmin>
                  <ImportPage />
                </RequireManagerOrAdmin>
              }
            />
            <Route
              path="/team"
              element={
                <RequireAdmin>
                  <TeamPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/ai-settings"
              element={
                <RequireAdmin>
                  <AiSettingsPage />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
