import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { InputPage } from './pages/InputPage';
import { ReportsPage } from './pages/ReportsPage';

function TabLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
          isActive ? 'text-indigo-600' : 'text-slate-400'
        }`
      }
    >
      <span className="text-2xl leading-none">{icon}</span>
      {label}
    </NavLink>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-slate-50 text-slate-900">
        <header className="px-4 pt-6 pb-2">
          <h1 className="text-2xl font-bold tracking-tight">Greedy</h1>
          <p className="text-sm text-slate-500">Track your TikTok content & audience</p>
        </header>

        <main className="flex-1 px-4 pb-24">
          <Routes>
            <Route path="/" element={<InputPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl border-t border-slate-200 bg-white/95 backdrop-blur">
          <TabLink to="/" label="Input" icon="✍️" />
          <TabLink to="/reports" label="Reports" icon="📈" />
        </nav>
      </div>
    </BrowserRouter>
  );
}
