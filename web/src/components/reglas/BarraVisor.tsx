/**
 * BarraVisor — barra de páginas y zoom que comparten el visor de PDF y el de
 * imagen, para que se vean idénticos al cambiar de modo. `children` va a la
 * derecha (avisos propios de cada visor).
 */
import type { ReactNode } from 'react';

const BTN = 'text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)] disabled:opacity-30 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded transition-colors';
const redondear = (z: number) => Math.round(z * 100) / 100;

export default function BarraVisor({
  pagina, numPages, onPagina, zoom, onZoom, children,
}: {
  pagina: number; numPages: number; onPagina: (p: number) => void;
  zoom: number; onZoom: (z: number) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex-shrink-0 select-none">
      <button
        onClick={() => onPagina(Math.max(1, pagina - 1))}
        disabled={pagina <= 1 || numPages === 0}
        className={`px-2 py-0.5 text-xs ${BTN}`}
      >‹</button>
      <span className="text-xs font-medium text-[var(--color-text-secondary)] tabular-nums min-w-[72px] text-center">
        {numPages > 0 ? `Pág. ${pagina} / ${numPages}` : '—'}
      </span>
      <button
        onClick={() => onPagina(Math.min(numPages, pagina + 1))}
        disabled={pagina >= numPages || numPages === 0}
        className={`px-2 py-0.5 text-xs ${BTN}`}
      >›</button>

      <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

      <button
        onClick={() => onZoom(Math.max(0.5, redondear(zoom - 0.25)))}
        disabled={zoom <= 0.5}
        className={`w-6 h-6 flex items-center justify-center text-sm font-bold ${BTN}`}
        title="Reducir"
      >−</button>
      <button
        onClick={() => onZoom(1.0)}
        className="text-xs font-mono font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-brand-blue)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-1.5 py-0.5 transition-colors min-w-[44px] text-center"
        title="Restablecer zoom"
      >{Math.round(zoom * 100)}%</button>
      <button
        onClick={() => onZoom(Math.min(3.0, redondear(zoom + 0.25)))}
        disabled={zoom >= 3.0}
        className={`w-6 h-6 flex items-center justify-center text-sm font-bold ${BTN}`}
        title="Ampliar"
      >+</button>

      {children}
    </div>
  );
}
