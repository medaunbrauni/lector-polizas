import { useEffect, useState } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { getProduccion, setProduccion } from '../../lib/api';
import type { EstadoProduccion } from '../../lib/api';

/** Activa o desactiva el subramo en producción: /extraer lo procesa con las reglas entrenadas. */
export default function ProduccionSubramo({ subramoId }: { subramoId: number }) {
  const [estado, setEstado] = useState<EstadoProduccion | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(false);

  // Las reglas cambian mientras se entrena: se recalcula al montar y al cambiar de subramo.
  useEffect(() => {
    setEstado(null);
    getProduccion(subramoId).then(setEstado).catch(() => setError(true));
  }, [subramoId]);

  async function cambiar(habilitado: boolean) {
    setTrabajando(true);
    try { setEstado(await setProduccion(subramoId, habilitado)); setError(false); }
    catch { setError(true); }
    finally { setTrabajando(false); setConfirmar(false); }
  }

  if (!estado) return error ? <p className="text-[10px] text-red-500">No se pudo leer el estado de producción.</p> : null;

  if (estado.dedicado) {
    return <p className="text-[10px] text-[var(--color-text-secondary)]">Producción: <strong className="text-emerald-500">activa</strong> (extractor dedicado)</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="text-[var(--color-text-secondary)]">
          Producción: <strong className={estado.habilitado ? 'text-emerald-500' : 'text-[var(--color-text-primary)]'}>{estado.habilitado ? 'activa' : 'inactiva'}</strong>
        </span>
        {estado.habilitado ? (
          <button disabled={trabajando} onClick={() => cambiar(false)} className="font-semibold text-red-500 hover:underline disabled:opacity-50">Desactivar</button>
        ) : (
          <button disabled={!estado.puede || trabajando} onClick={() => setConfirmar(true)}
            className="font-semibold text-[var(--color-brand-blue)] hover:underline disabled:opacity-40 disabled:no-underline">Activar</button>
        )}
      </div>
      {!estado.habilitado && !estado.puede && (
        <ul className="text-[10px] text-[var(--color-text-secondary)] list-disc pl-4">
          {estado.razones.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {error && <p className="text-[10px] text-red-500">No se pudo cambiar el estado.</p>}

      <ConfirmDialog
        open={confirmar}
        variant="warning"
        title="¿Activar este subramo en producción?"
        message="Desde ahora, los PDFs que lleguen a /extraer y se detecten en este subramo se procesarán con las reglas entrenadas. Si faltan campos básicos, se rechazan y vuelven al Entrenador. Puedes desactivarlo cuando quieras."
        confirmLabel="Activar"
        procesando={trabajando}
        onConfirm={() => cambiar(true)}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
