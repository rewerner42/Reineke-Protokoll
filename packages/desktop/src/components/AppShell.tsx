import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`;

export function AppShell(): JSX.Element {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-slate-100 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">Reineke-Protokoll</h1>
          <p className="text-xs text-slate-500 mt-1">Meetings · Transkripte · KI-Protokolle</p>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          <NavLink to="/meetings" className={linkClass}>
            Meetings
          </NavLink>
          <NavLink to="/record" className={linkClass}>
            Aufnehmen
          </NavLink>
          <NavLink to="/settings" className={linkClass}>
            Einstellungen
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
