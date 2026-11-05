import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type Tipo = 'info' | 'exito' | 'aviso';
interface Toast { id: number; texto: string; tipo: Tipo }

const ToastContext = createContext<(texto: string, tipo?: Tipo) => void>(() => {});
const DURACION_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const siguiente = useRef(0);

  const quitar = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const mostrar = useCallback((texto: string, tipo: Tipo = 'info') => {
    setToasts((t) => [...t.slice(-3), { id: siguiente.current++, texto, tipo }]);
  }, []);

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9000] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => <ToastItem key={t.id} toast={t} onClose={quitar} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  useEffect(() => {
    const id = setTimeout(() => onClose(toast.id), DURACION_MS);
    return () => clearTimeout(id);
  }, [toast.id, onClose]);
  const Icono = toast.tipo === 'exito' ? CheckCircle2 : AlertCircle;
  const color = toast.tipo === 'exito' ? 'text-emerald-400' : toast.tipo === 'aviso' ? 'text-amber-400' : 'text-blue-400';
  return (
    <div role="status" className="toast-entrada flex items-start gap-3 p-4 bg-gray-900 border border-[var(--color-border)] text-white rounded-xl shadow-lg">
      <Icono className={`w-5 h-5 flex-shrink-0 mt-0.5 ${color}`} />
      <p className="text-sm flex-1">{toast.texto}</p>
      <button onClick={() => onClose(toast.id)} aria-label="Cerrar"><X className="w-4 h-4 text-gray-400 hover:text-white" /></button>
    </div>
  );
}

export const useToast = () => useContext(ToastContext);
