/**
 * Clasificador — pestaña dentro de Reglas
 *
 * Flujo:
 *  1. Upload de PDFs → se guardan en carpeta local + clasificación automática
 *  2. Cola de revisión con estado por item
 *  3. Override manual de Compañía/Ramo/Subramo si la IA se equivoca
 *  4. Confirmación individual o por lote → enviado a polizas_entrenamiento
 *  5. Aprobación de patrones regex de detección generados por IA
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, RefreshCw, CheckCircle2, AlertCircle, XCircle,
  ChevronDown, ChevronRight, Trash2, Cpu, Shield,
  ShieldCheck, ShieldAlert, ShieldOff, Folder, Zap, Info,
} from 'lucide-react';
import type { Compania, ItemCola, NivelConfianza, ResultadoUpload } from '../../lib/types';
import {
  uploadClasificador, getColaClasificador,
  confirmarItemCola, confirmarLoteCola,
  aprobarPatronesCola, descartarItemCola,
  clasificadorInfo, getRamos, getSubramos,
} from '../../lib/api';

// ── Tipos locales ─────────────────────────────────────────────────────────────

interface OverrideState {
  companiaId: string;
  ramoId: string;
  subramoId: string;
  ramos: { id: number; nombre: string }[];
  subramos: { id: number; nombre: string }[];
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

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, cls: 'bg-gray-100 text-gray-500', Icon: Info };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
      <cfg.Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function ConfianzaBadge({ confianza }: { confianza: NivelConfianza | null }) {
  if (!confianza) return null;
  const cfg = CONF_CONFIG[confianza];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
      <cfg.Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  companias: Compania[];
}

export default function Clasificador({ companias }: Props) {
  const [cola, setCola] = useState<ItemCola[]>([]);
  const [carpeta, setCarpeta] = useState('');
  const [watcherActivo, setWatcherActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorUpload, setErrorUpload] = useState<string | null>(null);
  const [resultadosUpload, setResultadosUpload] = useState<ResultadoUpload[]>([]);
  const [drag, setDrag] = useState(false);
  const [confirmandoLote, setConfirmandoLote] = useState(false);

  // Override inline por item
  const [overrides, setOverrides] = useState<Record<number, OverrideState>>({});
  const [overrideActivo, setOverrideActivo] = useState<number | null>(null);

  // Patrones expandidos
  const [patronesAbiertos, setPatronesAbiertos] = useState<Set<number>>(new Set());
  const [patronesSeleccionados, setPatronesSeleccionados] = useState<
    Record<number, { compania: Set<string>; ramo: Set<string>; subramo: Set<string> }>
  >({});
  const [guardandoPatrones, setGuardandoPatrones] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Carga inicial ──────────────────────────────────────────────────────────
  const cargarCola = useCallback(async () => {
    setCargando(true);
    try {
      const items = await getColaClasificador();
      setCola(items);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarCola();
    clasificadorInfo().then((info) => {
      setCarpeta(info.carpeta);
      setWatcherActivo(info.watcher.activo);
    });
  }, [cargarCola]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const procesarArchivos = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) { setErrorUpload('Selecciona archivos PDF'); return; }
    setSubiendo(true);
    setErrorUpload(null);
    setResultadosUpload([]);
    try {
      const resultados = await uploadClasificador(pdfs);
      setResultadosUpload(resultados);
      await cargarCola();
    } catch (e: unknown) {
      setErrorUpload(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSubiendo(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    procesarArchivos(e.dataTransfer.files);
  }, []);

  // ── Override de clasificación ──────────────────────────────────────────────
  const abrirOverride = async (item: ItemCola) => {
    if (overrideActivo === item.id) { setOverrideActivo(null); return; }
    setOverrideActivo(item.id);
    if (overrides[item.id]) return;

    const compId = String(item.compania_id_prop ?? '');
    let ramos: { id: number; nombre: string }[] = [];
    let subramos: { id: number; nombre: string }[] = [];
    if (item.compania_id_prop) {
      ramos = await getRamos(item.compania_id_prop);
      if (item.ramo_id_prop) subramos = await getSubramos(item.ramo_id_prop);
    }
    setOverrides((prev) => ({
      ...prev,
      [item.id]: {
        companiaId: compId,
        ramoId: String(item.ramo_id_prop ?? ''),
        subramoId: String(item.subramo_id_prop ?? ''),
        ramos,
        subramos,
      },
    }));
  };

  const onCompaniaChange = async (itemId: number, cid: string) => {
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], companiaId: cid, ramoId: '', subramoId: '', ramos: [], subramos: [] } }));
    if (!cid) return;
    const ramos = await getRamos(Number(cid));
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ramos } }));
  };

  const onRamoChange = async (itemId: number, rid: string) => {
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ramoId: rid, subramoId: '', subramos: [] } }));
    if (!rid) return;
    const subramos = await getSubramos(Number(rid));
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], subramos } }));
  };

  // ── Confirmar item ─────────────────────────────────────────────────────────
  const confirmarItem = async (item: ItemCola) => {
    const ov = overrides[item.id];
    const override = ov && ov.subramoId
      ? { compania_id: Number(ov.companiaId) || undefined, ramo_id: Number(ov.ramoId) || undefined, subramo_id: Number(ov.subramoId) }
      : undefined;
    try {
      const updated = await confirmarItemCola(item.id, override);
      setCola((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      setOverrideActivo(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al confirmar');
    }
  };

  // ── Confirmar lote ─────────────────────────────────────────────────────────
  const confirmarLote = async () => {
    setConfirmandoLote(true);
    try {
      const res = await confirmarLoteCola();
      alert(`✅ ${res.confirmados} confirmados${res.errores.length ? ` · ${res.errores.length} errores` : ''}`);
      await cargarCola();
    } finally {
      setConfirmandoLote(false);
    }
  };

  // ── Descartar ──────────────────────────────────────────────────────────────
  const descartar = async (id: number) => {
    if (!confirm('¿Descartar este PDF de la cola?')) return;
    await descartarItemCola(id);
    setCola((prev) => prev.filter((i) => i.id !== id));
  };

  // ── Patrones ───────────────────────────────────────────────────────────────
  const togglePatrones = (id: number, item: ItemCola) => {
    setPatronesAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
    // Inicializar selección con todos los patrones marcados
    if (!patronesSeleccionados[id] && item.patrones_generados) {
      setPatronesSeleccionados((prev) => ({
        ...prev,
        [id]: {
          compania: new Set(item.patrones_generados!.compania),
          ramo:     new Set(item.patrones_generados!.ramo),
          subramo:  new Set(item.patrones_generados!.subramo),
        },
      }));
    }
  };

  const togglePatron = (itemId: number, nivel: 'compania' | 'ramo' | 'subramo', patron: string) => {
    setPatronesSeleccionados((prev) => {
      const current = prev[itemId] ?? { compania: new Set(), ramo: new Set(), subramo: new Set() };
      const set = new Set(current[nivel]);
      if (set.has(patron)) set.delete(patron); else set.add(patron);
      return { ...prev, [itemId]: { ...current, [nivel]: set } };
    });
  };

  const guardarPatrones = async (item: ItemCola) => {
    const sel = patronesSeleccionados[item.id];
    if (!sel) return;
    setGuardandoPatrones(item.id);
    try {
      await aprobarPatronesCola(item.id, {
        compania: [...sel.compania],
        ramo:     [...sel.ramo],
        subramo:  [...sel.subramo],
      });
      setCola((prev) => prev.map((i) => (i.id === item.id ? { ...i, patrones_guardados: true } : i)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar patrones');
    } finally {
      setGuardandoPatrones(null);
    }
  };

  // ── Estadísticas ───────────────────────────────────────────────────────────
  const stats = {
    total:    cola.length,
    alta:     cola.filter((i) => i.confianza === 'alta' && i.estado === 'clasificado').length,
    revision: cola.filter((i) => ['requiere_manual', 'clasificado'].includes(i.estado) && i.confianza !== 'alta').length,
    enviados: cola.filter((i) => i.estado === 'enviado').length,
    errores:  cola.filter((i) => i.estado === 'error').length,
  };

  const loteDisponible = cola.filter((i) => i.estado === 'clasificado' && i.confianza === 'alta').length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Info carpeta + watchdog ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
        <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-blue-800 font-medium">Carpeta de entrada: </span>
          <span className="text-blue-600 font-mono text-xs break-all">{carpeta || '…'}</span>
        </div>
        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${watcherActivo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${watcherActivo ? 'bg-green-500' : 'bg-gray-300'}`} />
          {watcherActivo ? 'Watchdog activo' : 'Sin watchdog'}
        </span>
      </div>

      {/* ── Zona de upload ──────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-colors
          ${drag ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && procesarArchivos(e.target.files)}
        />
        {subiendo ? (
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        ) : (
          <Upload className="w-8 h-8 text-gray-300" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            {subiendo ? 'Clasificando PDFs…' : 'Arrastra PDFs aquí o haz clic para seleccionar'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            También puedes copiarlos directamente a la carpeta de escritorio
          </p>
        </div>
      </div>

      {errorUpload && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{errorUpload}</p>
      )}

      {/* ── Resultados del último upload ─────────────────────────────────────── */}
      {resultadosUpload.length > 0 && (
        <div className="space-y-1">
          {resultadosUpload.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm
              ${r.error ? 'bg-red-50 text-red-700' : r.advertencia ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>
              {r.error ? <XCircle className="w-4 h-4 flex-shrink-0" /> : r.advertencia ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
              <span className="font-medium truncate">{r.archivo}</span>
              <span className="text-xs opacity-75 ml-auto flex-shrink-0">{r.error ?? r.advertencia ?? (r.item ? `→ ${r.item.estado}` : 'OK')}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Stats + acciones de lote ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Total', val: stats.total, cls: 'bg-gray-100 text-gray-600' },
            { label: '🟢 Conf. alta', val: stats.alta, cls: 'bg-green-50 text-green-700' },
            { label: '🟡 Revisión', val: stats.revision, cls: 'bg-yellow-50 text-yellow-700' },
            { label: '✅ Enviados', val: stats.enviados, cls: 'bg-purple-50 text-purple-700' },
            { label: '❌ Errores', val: stats.errores, cls: 'bg-red-50 text-red-600' },
          ].map((s) => (
            <span key={s.label} className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${s.cls}`}>
              {s.label}: {s.val}
            </span>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={cargarCola}
            disabled={cargando}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          {loteDisponible > 0 && (
            <button
              onClick={confirmarLote}
              disabled={confirmandoLote}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Confirmar {loteDisponible} con confianza alta
            </button>
          )}
        </div>
      </div>

      {/* ── Cola de clasificación ────────────────────────────────────────────── */}
      {cola.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay PDFs en la cola.</p>
          <p className="text-xs mt-1">Sube PDFs arriba o cópialos a la carpeta vigilada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cola.map((item) => {
            const ov = overrides[item.id];
            const overrideOpen = overrideActivo === item.id;
            const patronesOpen = patronesAbiertos.has(item.id);
            const selPat = patronesSeleccionados[item.id];
            const finalComp = ov?.companiaId ? companias.find((c) => c.id === Number(ov.companiaId))?.nombre : null;
            const finalSub = ov?.subramoId ? ov.subramos.find((s) => s.id === Number(ov.subramoId))?.nombre : null;
            const terminado = item.estado === 'enviado' || item.estado === 'confirmado';

            return (
              <div key={item.id} className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">

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
                        onClick={() => abrirOverride(item)}
                        title="Corregir clasificación"
                        className={`p-1.5 rounded-lg text-xs transition-colors ${overrideOpen ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-400'}`}
                      >
                        {overrideOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      {/* Confirmar */}
                      {(item.estado === 'clasificado' || (overrideOpen && ov?.subramoId)) && (
                        <button
                          onClick={() => confirmarItem(item)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmar
                        </button>
                      )}

                      {/* Descartar */}
                      <button
                        onClick={() => descartar(item.id)}
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
                      onClick={() => togglePatrones(item.id, item)}
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
                        onChange={(e) => onCompaniaChange(item.id, e.target.value)}
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
                        onChange={(e) => onRamoChange(item.id, e.target.value)}
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
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [item.id]: { ...prev[item.id], subramoId: e.target.value } }))}
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
                          onClick={() => confirmarItem(item)}
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
                                    onChange={() => togglePatron(item.id, nivel, p)}
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

                    <button
                      onClick={() => guardarPatrones(item)}
                      disabled={guardandoPatrones === item.id || item.patrones_guardados}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                        ${item.patrones_guardados
                          ? 'bg-green-100 text-green-700 cursor-default'
                          : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'}`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      {item.patrones_guardados
                        ? 'Patrones guardados ✓'
                        : guardandoPatrones === item.id
                        ? 'Guardando…'
                        : 'Guardar patrones seleccionados'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
