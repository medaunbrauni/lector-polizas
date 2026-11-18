import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import AurorasLuz, { RINGS, randomHslColor } from './AurorasLuz';
import { useTheme } from '../../contexts/ThemeContext';

/** Estado vacío: aros como marca de agua tenue, icono, mensaje y acción opcional. */
export default function EstadoVacio({ icono: Icono, texto, accion, className = '' }: {
  icono: LucideIcon; texto: string; accion?: ReactNode; className?: string;
}) {
  const { theme } = useTheme();
  const claro = theme === 'light';
  const [colores, setColores] = useState<string[] | null>(null);

  return (
    <div
      onMouseEnter={() => setColores(RINGS.map(() => randomHslColor(claro ? 45 : 65)))}
      onMouseLeave={() => setColores(null)}
      className={`relative overflow-hidden text-center py-12 text-[var(--color-text-secondary)] ${className}`}
    >
      <div className="absolute inset-0 pointer-events-none cargando-aros transition-opacity duration-200" style={{ opacity: claro ? 0.2 : 0.12 }} aria-hidden="true">
        <AurorasLuz adaptar hovered={!!colores} colors={colores ?? undefined} tamano="min(100%, 220px)" />
      </div>
      <div className="relative">
        <Icono className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">{texto}</p>
        {accion && <div className="mt-3">{accion}</div>}
      </div>
    </div>
  );
}
