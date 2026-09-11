/**
 * ColaItemRow — fila de un item de ClasificacionCola.
 *
 * Extraído de Clasificador.tsx para poder reusarse también en el detalle
 * de un ticket de MOVI (pages/TicketsMovi.tsx) sin duplicar la lógica de
 * override/confirmar/patrones.
 */
import {
  RefreshCw, CheckCircle2, AlertCircle, XCircle,
  ChevronDown, ChevronRight, Trash2, Cpu, Shield,
  ShieldCheck, ShieldAlert, ShieldOff, Info,
} from 'lucide-react';
import type { Compania, ItemCola, NivelConfianza } from '../../lib/types';

export interface OverrideState {
  companiaId: string;
  ramoId: string;
  subramoId: string;
  ramos: { id: number; nombre: string }[];
  subramos: { id: number; nombre: string }[];
}

export interface PatronesSeleccion {
  compania: Set<string>;
  ramo: Set<string>;
  subramo: Set<string>;
}

// ── Badges ────────────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  pendiente:       { label: 'Pendiente',   cls: 'bg-gray-100 text-gray-500',   Icon: RefreshCw },
  clasificado:     { label: 'Clasificado', cls: 'bg-blue-100 text-blue-700',   Icon: Shield },
  requiere_manual: { label: 'Acción req.', cls: 'bg-amber-100 text-amber-700', Icon: AlertCircle },
  confirmado:      { label: 'Confirmado',  cls: 'bg-green-100 text-green-700', Icon: CheckCircle2 },
  enviado:         { label: 'En entrena.', cls: 'bg-purple-100 text-purple-700', Icon: ShieldCheck },
  error:           { label: 'Error',       cls: 'bg-red-100 text-red-700',     Icon: XCircle },
};

const CONF_CONFIG: Record<NivelConfianza, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  alta:      { label: 'Alta',     cls: 'bg-green-100 text-green-700',  Icon: ShieldCheck },
  media:     { label: 'Media',    cls: 'bg-yellow-100 text-yellow-700', Icon: ShieldAlert },
  baja:      { label: 'Baja',     cls: 'bg-orange-100 text-orange-700', Icon: ShieldAlert },
  sin_datos: { label: 'Sin datos', cls: 'bg-gray-100 text-gray-500',   Icon: ShieldOff },
};

export function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, cls: 'bg-gray-100 text-gray-500', Icon: Info };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
      <cfg.Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

export function ConfianzaBadge({ confianza }: { confianza: NivelConfianza | null }) {
  if (!confianza) return null;
  const cfg = CONF_CONFIG[confianza];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
      <cfg.Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

// ── Fila ──────────────────────────────────────────────────────────────────────

interface Props {
  item: ItemCola;
  companias: Compania[];
  override?: OverrideState;
  overrideOpen: boolean;
  patronesOpen: boolean;
  patronesSeleccionados?: PatronesSeleccion;
  guardandoPatrones: boolean;
  onAbrirOverride: () => void;
  onCompaniaChange: (cid: string) => void;
  onRamoChange: (rid: string) => void;
  onSubramoChange: (sid: string) => void;
  onConfirmar: () => void;
  onDescartar: () => void;
  onTogglePatrones: () => void;
  onTogglePatron: (nivel: 'compania' | 'ramo' | 'subramo', patron: string) => void;
  onGuardarPatrones: () => void;
}

export default function ColaItemRow({
  item, companias, override: ov, overrideOpen, patronesOpen,
  patronesSeleccionados: selPat, guardandoPatrones,
  onAbrirOverride, onCompaniaChange, onRamoChange, onSubramoChange,
  onConfirmar, onDescartar, onTogglePatrones, onTogglePatron, onGuardarPatrones,
}: Props) {
  const finalComp = ov?.companiaId ? companias.find((c) => c.id === Number(ov.companiaId))?.nombre : null;
  const finalSub = ov?.subramoId ? ov.subramos.find((s) => s.id === Number(ov.subramoId))?.nombre : null;
  const terminado = item.estado === 'enviado' || item.estado === 'confirmado';

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">

      {/* ── Fila principal ─────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Nombre archivo */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{item.nombre_archivo}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {item.paginas ? `${item.paginas} p.` : '?'}
            {item.metodo === 'ia' && <span className="ml-1.5 inline-flex items-center gap-0.5 text-purple-400"><Cpu className="w-3 h-3" />IA</span>}
            {item.razon_ia && <span className="ml-1.5 text-gray-400" title={item.razon_ia}>· {item.razon_ia.slice(0, 60)}…</span>}
          </p>
        </div>

        {/* Estado + confianza */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <EstadoBadge estado={item.estado} />
          <ConfianzaBadge confianza={item.confianza} />
        </div>

        {/* Clasificación propuesta o final */}
        <div className="text-xs text-gray-600 text-right flex-shrink-0 min-w-[160px]">
          {item.estado === 'enviado' || item.estado === 'confirmado' ? (
            <div className="text-green-700">
              <div className="font-medium">{item.compania_final ?? item.compania_prop}</div>
              <div>{item.ramo_final ?? item.ramo_prop} · {item.subramo_final ?? item.subramo_prop}</div>
            </div>
          ) : item.es_compania_nueva ? (
            <div className="text-amber-700 font-medium">
              <div>Compañía nueva detectada:</div>
              <div>"{item.compania_nombre_ia}"</div>
            </div>
          ) : (
            <div>
              <div className="font-medium">{item.compania_prop ?? '—'}</div>
              <div>{item.ramo_prop} {item.subramo_prop ? `· ${item.subramo_prop}` : ''}</div>
            </div>
          )}
        </div>

        {/* Acciones */}
        {!terminado && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Botón Corregir */}
            <button
              onClick={onAbrirOverride}
              title="Corregir clasificación"
              className={`p-1.5 rounded-lg text-xs transition-colors ${overrideOpen ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              {overrideOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {/* Confirmar */}
            {(item.estado === 'clasificado' || (overrideOpen && ov?.subramoId)) && (
              <button
                onClick={onConfirmar}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirmar
              </button>
            )}

            {/* Descartar */}
            <button
              onClick={onDescartar}
              title="Descartar"
              className="p-1.5 hover:bg-red-50 text-gray-300 hover:text-red-400 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Botón patrones (siempre visible si hay patrones generados) */}
        {item.patrones_generados && (
          <button
            onClick={onTogglePatrones}
            title="Ver / aprobar patrones"
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors flex-shrink-0
              ${item.patrones_guardados ? 'border-green-300 text-green-600 bg-green-50' : 'border-purple-200 text-purple-600 hover:bg-purple-50'}`}
          >
            <Shield className="w-3.5 h-3.5" />
            {item.patrones_guardados ? 'Patrones ✓' : 'Patrones'}
          </button>
        )}
      </div>

      {/* ── Alerta compañía nueva ──────────────────────────────── */}
      {item.es_compania_nueva && (
        <div className="mx-4 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <strong>Nueva compañía detectada: "{item.compania_nombre_ia}"</strong>
          {item.ramo_nombre_ia && <> · Ramo: {item.ramo_nombre_ia}</>}
          {item.subramo_nombre_ia && <> · Subramo: {item.subramo_nombre_ia}</>}
          <br />
          Crea la compañía primero en <strong>Catálogos</strong> y luego corrígela aquí.
        </div>
      )}

      {/* ── Override inline ────────────────────────────────────── */}
      {overrideOpen && ov && (
        <div className="mx-4 mb-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Corregir clasificación</p>
          <div className="flex gap-2 flex-wrap">
            {/* Compañía */}
            <select
              value={ov.companiaId}
              onChange={(e) => onCompaniaChange(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="">— Compañía —</option>
              {companias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>

            {/* Ramo */}
            <select
              value={ov.ramoId}
              onChange={(e) => onRamoChange(e.target.value)}
              disabled={!ov.ramos.length}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40"
            >
              <option value="">— Ramo —</option>
              {ov.ramos.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>

            {/* Subramo */}
            <select
              value={ov.subramoId}
              onChange={(e) => onSubramoChange(e.target.value)}
              disabled={!ov.subramos.length}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40"
            >
              <option value="">— Subramo —</option>
              {ov.subramos.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>

            {ov.subramoId && (
              <button
                onClick={onConfirmar}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirmar con corrección
              </button>
            )}
          </div>
          {(finalComp || finalSub) && (
            <p className="text-xs text-gray-400 mt-2">
              → {finalComp} {finalSub ? `· ${finalSub}` : ''}
            </p>
          )}
        </div>
      )}

      {/* ── Panel de patrones ──────────────────────────────────── */}
      {patronesOpen && item.patrones_generados && (
        <div className="mx-4 mb-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-purple-700 uppercase">
              Patrones de detección generados
            </p>
            {item.patrones_generados.explicacion && (
              <p className="text-xs text-purple-500">{item.patrones_generados.explicacion}</p>
            )}
          </div>

          {(['compania', 'ramo', 'subramo'] as const).map((nivel) => {
            const patrones = item.patrones_generados![nivel];
            if (!patrones.length) return null;
            const label = nivel === 'compania' ? 'Compañía' : nivel === 'ramo' ? 'Ramo' : 'Subramo';
            return (
              <div key={nivel}>
                <p className="text-[11px] font-semibold text-purple-600 uppercase mb-1">{label}</p>
                <div className="space-y-1">
                  {patrones.map((p) => {
                    const checked = selPat ? selPat[nivel].has(p) : true;
                    return (
                      <label key={p} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onTogglePatron(nivel, p)}
                          className="w-3.5 h-3.5 accent-purple-600"
                        />
                        <code className={`text-xs font-mono px-2 py-0.5 rounded ${checked ? 'bg-white text-gray-700 border border-purple-200' : 'bg-transparent text-gray-400 line-through'}`}>
                          {p}
                        </code>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Guardar un patrón de "compañía" sin haber confirmado la
              corrección, cuando la propuesta original no era de alta
              confianza, puede terminar asociando el patrón a la
              compañía equivocada (así se corrompió Banorte con
              patrones de Mapfre en su momento) — el backend lo
              rechaza; acá solo se advierte/deshabilita antes de
              que el usuario pierda el click. */}
          {(() => {
            const hayPatronCompania = selPat ? selPat.compania.size > 0 : false;
            const faltaConfirmar = hayPatronCompania
              && item.compania_id_final == null
              && item.confianza !== 'alta';
            return (
              <>
                {faltaConfirmar && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Confirma la compañía correcta antes de guardar estos patrones
                    — la propuesta automática no es de alta confianza.
                  </p>
                )}
                <button
                  onClick={onGuardarPatrones}
                  disabled={guardandoPatrones || item.patrones_guardados || faltaConfirmar}
                  title={faltaConfirmar ? 'Confirma la compañía correcta antes de guardar' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                    ${item.patrones_guardados
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'}`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  {item.patrones_guardados
                    ? 'Patrones guardados ✓'
                    : guardandoPatrones
                    ? 'Guardando…'
                    : 'Guardar patrones seleccionados'}
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
