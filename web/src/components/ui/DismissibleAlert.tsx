/**
 * Banner/aviso que se auto-cierra tras `duracionMs`, con la misma
 * animación de salida (colapsa + fade) tanto por timeout como por el
 * botón "Cerrar" manual — y cancela el timeout pendiente si se cierra
 * a mano antes de tiempo.
 *
 * `resetKey` (opcional): si el aviso debe poder volver a aparecer para
 * un contexto distinto (ej. otra póliza activa) aunque `show` siga en
 * true todo el tiempo, pásale un valor que cambie con ese contexto
 * (ej. polizaActiva?.id). Cada vez que cambia, se reinicia el
 * temporizador y se vuelve a mostrar si `show` es true.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

const DURACION_ANIM_MS = 300;

interface DismissibleAlertProps {
  show: boolean;
  duracionMs: number;
  resetKey?: unknown;
  onClose?: () => void;
  /** Clases del contenedor cuando está visible (color, bordes, padding). */
  className: string;
  cerrarLabel?: string;
  cerrarClassName?: string;
  children: ReactNode;
}

export default function DismissibleAlert({
  show,
  duracionMs,
  resetKey,
  onClose,
  className,
  cerrarLabel = 'Cerrar',
  cerrarClassName = 'text-[10px] text-amber-700 hover:text-amber-900 font-medium flex-shrink-0',
  children,
}: DismissibleAlertProps) {
  const [fase, setFase] = useState<'visible' | 'saliendo'>('visible');
  const [cerradoParaKey, setCerradoParaKey] = useState<unknown>(Symbol('init'));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const yaCerrado = cerradoParaKey === resetKey;

  useEffect(() => {
    if (!show || yaCerrado) return;
    setFase('visible');
    timeoutRef.current = setTimeout(cerrar, duracionMs);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, resetKey]);

  useEffect(() => () => {
    if (animRef.current) clearTimeout(animRef.current);
  }, []);

  function cerrar() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setFase('saliendo');
    animRef.current = setTimeout(() => {
      setCerradoParaKey(resetKey);
      onClose?.();
    }, DURACION_ANIM_MS);
  }

  if (!show) return null;
  if (yaCerrado && fase !== 'saliendo') return null;

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-in-out ${
        fase === 'saliendo' ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100'
      }`}
    >
      <div className={className}>
        <div className="min-w-0 flex-1">{children}</div>
        <button onClick={cerrar} className={cerrarClassName}>
          {cerrarLabel}
        </button>
      </div>
    </div>
  );
}
