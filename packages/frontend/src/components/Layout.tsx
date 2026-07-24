import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ListChecks, LogOut, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth';
import { initials } from '../lib/format';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, adminOnly: false },
  { to: '/controls', label: 'Controls', icon: ListChecks, end: false, adminOnly: false },
  { to: '/audit', label: 'Audit log', icon: ScrollText, end: false, adminOnly: false },
  { to: '/team', label: 'Team', icon: Users, end: false, adminOnly: true },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-slate-800 text-white'
      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
  }`;
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin');

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (top bar on small screens) */}
      <aside className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 md:inset-y-0 md:right-auto md:w-60 md:flex-col md:items-stretch md:gap-0 md:border-b-0 md:border-r md:px-4 md:py-5">
        <div className="flex items-center gap-2.5 md:mb-8 md:px-2">
          <span className="rounded-lg bg-indigo-500/15 p-1.5">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
          </span>
          <span className="text-base font-bold tracking-tight text-white">Sentinel</span>
        </div>

        <nav className="flex flex-1 items-center gap-1 md:flex-col md:items-stretch md:justify-start">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 md:mt-auto md:border-t md:border-slate-800 md:pt-4">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300 md:flex">
            {initials(user.displayName)}
          </span>
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="truncate text-sm font-medium text-slate-100">{user.displayName}</p>
            <p className="text-xs capitalize text-slate-400">{user.role}</p>
          </div>
          <button
            type="button"
            title="Sign out"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            onClick={() => {
              void logout().then(() => navigate('/login'));
            }}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="mt-14 w-full flex-1 px-4 py-6 md:ml-60 md:mt-0 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
