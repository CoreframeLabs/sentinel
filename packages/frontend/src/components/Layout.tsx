import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold tracking-tight">Sentinel</span>
            <nav className="flex gap-1">
              <NavLink to="/" end className={linkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/controls" className={linkClass}>
                Controls
              </NavLink>
              <NavLink to="/audit" className={linkClass}>
                Audit log
              </NavLink>
              {user?.role === 'admin' ? (
                <NavLink to="/team" className={linkClass}>
                  Team
                </NavLink>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {user?.displayName} · <span className="capitalize">{user?.role}</span>
            </span>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-100"
              onClick={() => {
                void logout().then(() => navigate('/login'));
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
