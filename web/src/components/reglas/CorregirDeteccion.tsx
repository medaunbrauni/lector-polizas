/**
 * CorregirDeteccion — ventana para elegir a mano Compañía › Ramo › Subramo de
 * un PDF cuando "Detectar con PDF" no acertó (o lo dejó incompleto).
 * Solo elige; quien la usa decide qué hacer con el PDF (subirlo, moverlo).
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getRamos, getSubramos } from '../../lib/api';

type Opcion = { id: number; nombre: string };

export interface Clasificacion { compania_id: number; ramo_id: number; subramo_id: number }

const SELECT = 'w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50';

export default function CorregirDeteccion({
  nombreArchivo, motivo, companias, inicial, avisoPerdida, procesando, onCancel, onConfirm,
}: {
  nombreArchivo: string;
  /** Por qué se abre: qué no se pudo detectar. */
  motivo: string;
  companias: Opcion[];
  inicial: Partial<Clasificacion>;
  /** Texto de advertencia si el PDF ya estaba en un lote y se va a mover. */
  avisoPerdida?: string;
  procesando: boolean;
  onCancel: () => void;
  onConfirm: (c: Clasificacion, etiqueta: string) => void;
}) {
  const [cia, setCia] = useState(inicial.compania_id ? String(inicial.compania_id) : '');
  const [ramo, setRamo] = useState(inicial.ramo_id ? String(inicial.ramo_id) : '');
  const [sub, setSub] = useState(inicial.subramo_id ? String(inicial.subramo_id) : '');
  const [ramos, setRamos] = useState<Opcion[]>([]);
  const [subramos, setSubramos] = useState<Opcion[]>([]);

  useEffect(() => {
    if (!cia) { setRamos([]); return; }
    getRamos(Number(cia)).then(setRamos);
  }, [cia]);
  useEffect(() => {
    if (!ramo) { setSubramos([]); return; }
    getSubramos(Number(ramo)).then(setSubramos);
  }, [ramo]);

  const completo = !!cia && !!ramo && !!sub;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={procesando ? undefined : onCancel}>
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Elegir compañía, ramo y subramo</h3>
          <button onClick={onCancel} disabled={procesando} aria-label="Cerrar"><X className="w-4 h-4 text-[var(--color-text-secondary)]" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            <span className="font-medium text-[var(--color-text-primary)]">{nombreArchivo}</span> — {motivo}
          </p>
          <select value={cia} onChange={(e) => { setCia(e.target.value); setRamo(''); setSub(''); }} className={SELECT}>
            <option value="">Compañía…</option>
            {companias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={ramo} onChange={(e) => { setRamo(e.target.value); setSub(''); }} disabled={!cia} className={SELECT}>
            <option value="">Ramo…</option>
            {ramos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <select value={sub} onChange={(e) => setSub(e.target.value)} disabled={!ramo} className={SELECT}>
            <option value="">Subramo…</option>
            {subramos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {avisoPerdida && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">{avisoPerdida}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)]">
          <button
            onClick={onCancel} disabled={procesando}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
          >Cancelar</button>
          <button
            onClick={() => onConfirm(
              { compania_id: Number(cia), ramo_id: Number(ramo), subramo_id: Number(sub) },
              [companias.find((c) => c.id === Number(cia)), ramos.find((r) => r.id === Number(ramo)), subramos.find((x) => x.id === Number(sub))]
                .map((o) => o?.nombre).filter(Boolean).join(' › '),
            )}
            disabled={!completo || procesando}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--color-brand-blue)] text-white hover:opacity-90 disabled:opacity-50"
          >{procesando ? 'Abriendo…' : 'Usar y abrir PDF'}</button>
        </div>
      </div>
    </div>
  );
}
