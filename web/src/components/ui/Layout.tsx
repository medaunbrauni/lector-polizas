import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FileSearch, BookOpen, Zap, History, Code2, ChevronLeft, ChevronRight } from 'lucide-react';

const NAV = [
  { to: '/',              icon: FileSearch, label: 'Extractor',     exact: true  },
  { to: '/historial',     icon: History,    label: 'Historial',     exact: false },
  { to: '/catalogos',     icon: BookOpen,   label: 'Catálogos',     exact: false },
  { to: '/reglas',        icon: Zap,        label: 'Reglas',        exact: true  },
  { to: '/reglas/codigo', icon: Code2,      label: 'Código Reglas', exact: false },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [colapsado, setColapsado] = useState<boolean>(
    () => localStorage.getItem('sidebar-colapsado') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('sidebar-colapsado', String(colapsado));
  }, [colapsado]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`relative bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${
          colapsado ? 'w-16' : 'w-56'
        }`}
      >
        <button
          type="button"
          onClick={() => setColapsado((c) => !c)}
          title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          className="absolute -right-3 top-6 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 shadow-sm z-10"
        >
          {colapsado ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div className="px-5 py-5 border-b border-gray-100">
          <div className={`flex items-center gap-2.5 ${colapsado ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileSearch className="w-4 h-4 text-white" />
            </div>
            {!colapsado && (
              <div>
                <p className="text-sm font-bold text-gray-900 leading-none">Lector</p>
                <p className="text-[10px] text-gray-400 mt-0.5">de Pólizas</p>
              </div>
            )}
          </div>
        </div>
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
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!colapsado && label}
            </NavLink>
          ))}
        </nav>
        {!colapsado && (
          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">v2.0 · Multi-compañía</p>
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
