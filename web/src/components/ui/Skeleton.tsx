/** Bloque gris pulsante: da forma a la pantalla mientras llegan los datos. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)]/40 ${className}`} />;
}

export function SkeletonFilas({ filas = 5, alto = 'h-10' }: { filas?: number; alto?: string }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-2">
      {Array.from({ length: filas }, (_, i) => <Skeleton key={i} className={`w-full ${alto}`} />)}
    </div>
  );
}
