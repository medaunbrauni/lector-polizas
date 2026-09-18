import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FileSearch, BookOpen, Zap, History, Code2, Inbox, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../../contexts/AuthContext';

const NAV = [
  { to: '/',                  icon: FileSearch, label: 'Extractor',      exact: true  },
  { to: '/historial',         icon: History,    label: 'Historial',      exact: false },
  { to: '/catalogos',         icon: BookOpen,   label: 'Catálogos',      exact: false },
  { to: '/reglas',            icon: Zap,        label: 'Entrenador PDFs', exact: true  },
  { to: '/reglas/codigo',     icon: Code2,      label: 'Código Reglas',  exact: false },
  { to: '/clasificador/tickets', icon: Inbox,   label: 'Tickets MOVI',   exact: false },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [colapsado, setColapsado] = useState<boolean>(
    () => localStorage.getItem('sidebar-colapsado') === 'true'
  );
  const { isAuthenticated, logout } = useAuth();

  useEffect(() => {
    localStorage.setItem('sidebar-colapsado', String(colapsado));
  }, [colapsado]);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-secondary)]">
      {/* Sidebar */}
      <aside
        className={`sticky top-0 h-screen relative bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] flex flex-col transition-all duration-200 ${
          colapsado ? 'w-16' : 'w-56'
        }`}
      >
        <button
          type="button"
          onClick={() => setColapsado((c) => !c)}
          title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          className="absolute -right-4 top-6 w-8 h-8 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] shadow-sm z-10"
        >
          {colapsado ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <Link to="/" className="px-5 py-5 border-b border-[var(--color-border)] cursor-pointer hover:opacity-80 transition-opacity">
          <div className={`flex items-center gap-2.5 ${colapsado ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 bg-[var(--color-brand-blue)] rounded-lg flex items-center justify-center flex-shrink-0">
              <FileSearch className="w-4 h-4 text-white" />
            </div>
            {!colapsado && (
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)] leading-none">Lector</p>
                <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">de Pólizas</p>
              </div>
            )}
          </div>
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              title={colapsado ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  colapsado ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-[var(--color-nav-active-bg)] text-[var(--color-nav-active-text)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!colapsado && label}
            </NavLink>
          ))}
        </nav>

        {/* Theme toggle + logout */}
        <div className={`px-3 py-3 border-t border-[var(--color-border)] flex items-center gap-1 ${colapsado ? 'flex-col' : ''}`}>
          <ThemeToggle />
          {isAuthenticated && (
            <button
              type="button"
              onClick={logout}
              title="Cerrar sesión"
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {!colapsado && (
          <div className="px-4 py-3 border-t border-[var(--color-border)]">
            <p className="text-[10px] text-[var(--color-text-secondary)]">v2.0 · Multi-compañía</p>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
