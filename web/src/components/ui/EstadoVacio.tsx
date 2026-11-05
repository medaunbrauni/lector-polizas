import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import AurorasLuz from './AurorasLuz';

/** Estado vacío: aros como marca de agua tenue, icono, mensaje y acción opcional. */
export default function EstadoVacio({ icono: Icono, texto, accion, className = '' }: {
  icono: LucideIcon; texto: string; accion?: ReactNode; className?: string;
}) {
  return (
    <div className={`relative overflow-hidden text-center py-12 text-[var(--color-text-secondary)] ${className}`}>
      <div className="absolute inset-0 opacity-[0.12] pointer-events-none cargando-aros" aria-hidden="true">
        <AurorasLuz tamano="min(100%, 220px)" />
      </div>
      <div className="relative">
        <Icono className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">{texto}</p>
        {accion && <div className="mt-3">{accion}</div>}
      </div>
    </div>
  );
}
