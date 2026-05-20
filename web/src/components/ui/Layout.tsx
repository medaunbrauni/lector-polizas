import { NavLink } from 'react-router-dom';
import { FileSearch, BookOpen, Zap, History, Code2 } from 'lucide-react';

const NAV = [
  { to: '/',              icon: FileSearch, label: 'Extractor',     exact: true  },
  { to: '/historial',     icon: History,    label: 'Historial',     exact: false },
  { to: '/catalogos',     icon: BookOpen,   label: 'Catálogos',     exact: false },
  { to: '/reglas',        icon: Zap,        label: 'Reglas',        exact: true  },
  { to: '/reglas/codigo', icon: Code2,      label: 'Código Reglas', exact: false },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileSearch className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">Lector</p>
              <p className="text-[10px] text-gray-400 mt-0.5">de Pólizas</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">v2.0 · Multi-compañía</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
