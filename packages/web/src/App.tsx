import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { InputPage } from './pages/InputPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { VideosPage } from './pages/VideosPage';

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
          isActive
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-500 hover:bg-white hover:text-slate-900'
        }`
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </NavLink>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-[240px_1fr] gap-8 px-8 py-6">
          <aside className="sticky top-6 flex h-[calc(100vh-3rem)] flex-col rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight">Greedy</h1>
              <p className="mt-1 text-sm text-slate-500">TikTok content analytics</p>
            </div>

            <nav className="flex flex-col gap-2">
              <NavItem to="/" label="Input" icon="✍️" />
              <NavItem to="/videos" label="Videos" icon="🎬" />
              <NavItem to="/reports" label="Reports" icon="📈" />
              <NavItem to="/settings" label="Settings" icon="⚙️" />
            </nav>
          </aside>

          <main className="min-w-0 py-2">
            <Routes>
              <Route path="/" element={<InputPage />} />
              <Route path="/videos" element={<VideosPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
