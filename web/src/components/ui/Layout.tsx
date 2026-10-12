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

  // Los textos aparecen con fade cuando termina de ensancharse el menú (350 ms)
  // y se desvanecen antes de desmontarse al contraerlo.
  const [textosMontados, setTextosMontados] = useState(!colapsado);
  const [textosVisibles, setTextosVisibles] = useState(!colapsado);
  useEffect(() => {
    if (colapsado) {
      setTextosVisibles(false);
      const t = setTimeout(() => setTextosMontados(false), 150);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setTextosMontados(true);
      requestAnimationFrame(() => setTextosVisibles(true));
    }, 200);
    return () => clearTimeout(t);
  }, [colapsado]);
  const fade = `transition-opacity duration-150 ${textosVisibles ? 'opacity-100' : 'opacity-0'}`;

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-secondary)]">
      <aside
        className={`sticky top-0 h-screen relative bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] flex flex-col transition-[width] duration-[350ms] ease-in-out ${
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
            <div className={`${colapsado ? 'w-9 h-9' : 'w-10 h-10'} bg-[var(--color-brand-blue)] rounded-lg flex items-center justify-center flex-shrink-0`}>
              <FileSearch className={`${colapsado ? 'w-[18px] h-[18px]' : 'w-5 h-5'} text-white`} />
            </div>
            {textosMontados && (
              <p className={`text-lg font-bold whitespace-nowrap text-[var(--color-text-primary)] leading-tight ${fade}`}>Lector<br />de Pólizas</p>
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
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[var(--color-nav-active-bg)] text-[var(--color-nav-active-text)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {textosMontados && <span className={fade}>{label}</span>}
            </NavLink>
          ))}
        </nav>

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

        {textosMontados && (
          <div className={`px-4 py-3 border-t border-[var(--color-border)] whitespace-nowrap ${fade}`}>
            <p className="text-[10px] text-[var(--color-text-secondary)]">v2.0 · Multi-compañía</p>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
