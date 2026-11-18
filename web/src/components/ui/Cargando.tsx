import AurorasLuz from './AurorasLuz';

/** Indicador de carga con los aros del login. `tamano` en px; sin texto queda solo el aro. */
export default function Cargando({ texto, tamano = 40, className = '' }: { texto?: string; tamano?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-2 text-[var(--color-text-secondary)] ${className}`}>
      <div className="cargando-aros relative" style={{ width: tamano, height: tamano }}>
        <AurorasLuz cargando adaptar tamano="100%" />
      </div>
      {texto && <span className="text-xs">{texto}</span>}
    </div>
  );
}
