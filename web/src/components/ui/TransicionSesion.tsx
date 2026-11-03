import { useEffect, useState } from 'react';
import AurorasLuz from './AurorasLuz';

/** Tiempo mínimo que el overlay permanece antes de empezar el fade-out. Ajustar aquí. */
export const TRANSICION_MIN_MS = 800;
/** Duración de cada fade (entrada y salida). */
export const TRANSICION_FADE_MS = 250;

interface Props {
  texto: string;
  /** true = visible (fade-in); false = fade-out, y al terminar llama a onFin. */
  activa: boolean;
  onFin: () => void;
}

/** Overlay a pantalla completa para iniciar/cerrar sesión. Anima solo opacity (y los aros, transform). */
export default function TransicionSesion({ texto, activa, onFin }: Props) {
  // Monta con opacity 0 y la sube en el siguiente frame para que el fade-in sí se anime.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!activa) { setVisible(false); return; }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [activa]);

  // Respaldo por si transitionend no llega (pestaña en segundo plano).
  useEffect(() => {
    if (activa) return;
    const id = setTimeout(onFin, TRANSICION_FADE_MS + 100);
    return () => clearTimeout(id);
  }, [activa, onFin]);

  return (
    <div
      role="status"
      aria-live="polite"
      onTransitionEnd={(e) => { if (e.target === e.currentTarget && !activa) onFin(); }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
      style={{
        opacity: visible && activa ? 1 : 0,
        transition: `opacity ${TRANSICION_FADE_MS}ms ease`,
        pointerEvents: 'auto', // bloquea los clics del fondo
      }}
    >
      <div style={{ position: 'relative', width: 'min(34vmin, 260px)', height: 'min(34vmin, 260px)' }}>
        <AurorasLuz cargando tamano="100%" />
      </div>
      <p className="text-sm font-medium">{texto}</p>
    </div>
  );
}
