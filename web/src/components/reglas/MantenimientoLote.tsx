import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  actualizarAutomaticos, getCoberturaSubramo, getDuplicados, limpiarDuplicados,
  getHistorialReglas, restaurarRegla,
} from '../../lib/api';
import type { CoberturaCampo, ReglaHistorial } from '../../lib/api';

const BTN = 'flex-1 px-2 py-1 border border-[var(--color-border)] rounded-md text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50 transition-colors';

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{titulo}</h3>
          <button onClick={onClose} aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto text-xs text-[var(--color-text-primary)]">{children}</div>
      </div>
    </div>
  );
}

/** Acciones de mantenimiento del lote: actualizar automáticos, cobertura y copias repetidas. */
export default function MantenimientoLote({ subramoId, onCambio }: { subramoId: number; onCambio: () => void }) {
  const [confirm, setConfirm] = useState<'actualizar' | 'duplicados' | null>(null);
  const [dup, setDup] = useState<{ eliminables: number; requieren_revision: number } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cobertura, setCobertura] = useState<{ total: number; campos: CoberturaCampo[] } | null>(null);

  async function abrirDuplicados() {
    setMsg(null);
    try {
      const d = await getDuplicados(subramoId);
      if (d.eliminables === 0 && d.requieren_revision === 0) { setMsg('No hay copias repetidas.'); return; }
      setDup(d); setConfirm('duplicados');
    } catch { setMsg('No se pudo revisar duplicados.'); }
  }

  async function ejecutar() {
    setTrabajando(true);
    try {
      if (confirm === 'actualizar') {
        const r = await actualizarAutomaticos(subramoId);
        setMsg(`${r.actualizadas} actualizada(s)` + (r.omitidas_entrenadas ? ` · ${r.omitidas_entrenadas} entrenada(s) omitida(s)` : '')
          + (r.rechazadas + r.otro_subramo ? ` · ${r.rechazadas + r.otro_subramo} ya no pasan el extractor` : '') + (r.errores ? ` · ${r.errores} con error` : ''));
      } else {
        const r = await limpiarDuplicados(subramoId);
        setMsg(`${r.borradas} copia(s) eliminada(s)` + (r.requieren_revision ? ` · ${r.requieren_revision} con trabajo tuyo: revísalas a mano` : ''));
      }
      onCambio();
    } catch { setMsg('La operación falló.'); }
    finally { setTrabajando(false); setConfirm(null); }
  }

  async function abrirCobertura() {
    setMsg(null);
    try { setCobertura(await getCoberturaSubramo(subramoId)); } catch { setMsg('No se pudo cargar la cobertura.'); }
  }

  return (
    <div className="p-3 border-b border-[var(--color-border)] space-y-1.5">
      <div className="flex gap-1.5">
        <button className={BTN} onClick={() => { setMsg(null); setConfirm('actualizar'); }} title="Vuelve a correr el extractor sobre los PDFs guardados">Actualizar valores</button>
        <button className={BTN} onClick={abrirCobertura}>Cobertura</button>
        <button className={BTN} onClick={abrirDuplicados}>Quitar copias</button>
      </div>
      {msg && <p className="text-[10px] text-[var(--color-text-secondary)]">{msg}</p>}

      <ConfirmDialog
        open={confirm !== null}
        variant="info"
        title={confirm === 'actualizar' ? '¿Actualizar valores automáticos?' : '¿Quitar copias repetidas?'}
        message={confirm === 'actualizar'
          ? 'Se vuelve a correr el extractor sobre los PDFs del lote y se refrescan solo los valores automáticos (ámbar). Lo que confirmaste o capturaste a mano y las pólizas entrenadas no se tocan.'
          : `Se eliminarán ${dup?.eliminables ?? 0} copia(s) del mismo PDF, conservando la más reciente.`
            + (dup?.requieren_revision ? ` Otras ${dup.requieren_revision} tienen trabajo tuyo y se dejan sin tocar.` : '')}
        confirmLabel={confirm === 'actualizar' ? 'Actualizar' : 'Quitar copias'}
        procesando={trabajando}
        onConfirm={ejecutar}
        onCancel={() => setConfirm(null)}
      />

      {cobertura && (
        <Modal titulo={`Cobertura del lote (${cobertura.total} pólizas)`} onClose={() => setCobertura(null)}>
          <table className="w-full text-left">
            <thead className="text-[10px] text-[var(--color-text-secondary)]">
              <tr><th className="pb-1">Campo</th><th>Confirmadas</th><th>Automáticas</th><th>Sin valor</th><th>Regla</th><th>En producción</th></tr>
            </thead>
            <tbody>
              {cobertura.campos.map((c) => {
                const auto = Object.entries(c.automaticas).map(([m, n]) => `${n} ${m}`).join(', ');
                return (
                  <tr key={c.nombre} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2">{c.label}{c.requerido && <span className="text-red-500"> *</span>}</td>
                    <td>{c.valor_fijo ? '🔒 fijo' : c.confirmadas}</td>
                    <td>{c.valor_fijo ? '' : auto || '—'}</td>
                    <td className={!c.valor_fijo && c.sin_valor > 0 ? 'text-amber-600 font-semibold' : ''}>{c.valor_fijo ? '' : c.sin_valor}</td>
                    <td>{c.regla ? `${c.regla.cobertura ?? '?'}/${c.regla.total ?? '?'}` : '—'}</td>
                    <td>{c.regla?.produccion ? `${c.regla.produccion.aciertos}/${c.regla.produccion.intentos}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

/** Versiones de la regla de un campo, con opción de restaurar una anterior. */
export function HistorialReglasModal({ subramoId, campo, onClose, onRestaurada }: {
  subramoId: number; campo: string; onClose: () => void; onRestaurada: () => void;
}) {
  const [filas, setFilas] = useState<ReglaHistorial[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getHistorialReglas(subramoId, campo).then(setFilas).catch(() => setError(true));
  }, [subramoId, campo]);

  async function restaurar(id: number) {
    try { await restaurarRegla(id); onRestaurada(); onClose(); } catch { setError(true); }
  }

  return (
    <Modal titulo={`Historial de reglas · ${campo}`} onClose={onClose}>
      {error && <p className="text-red-500 mb-2">Ocurrió un error.</p>}
      {!filas ? <p>Cargando…</p> : filas.length === 0 ? <p>Sin versiones.</p> : (
        <ul className="space-y-2">
          {filas.map((r) => (
            <li key={r.id} className="border border-[var(--color-border)] rounded-lg p-2">
              <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-text-secondary)]">
                <span>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : '—'} · {r.creado_por ?? 'manual'}
                  {r.cobertura != null && ` · ${r.cobertura}/${r.total}`}
                </span>
                {r.activo
                  ? <span className="text-emerald-600 font-semibold">Activa</span>
                  : <button className="text-[var(--color-brand-blue)] font-semibold" onClick={() => restaurar(r.id)}>Restaurar</button>}
              </div>
              <code className="block mt-1 font-mono break-all">{r.patron_regex}</code>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
