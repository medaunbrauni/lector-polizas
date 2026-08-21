import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileUp, Loader2, CheckCircle2, AlertCircle,
  Download, Eye, X, Car, FileText, Cpu,
  ShieldCheck, Shield, ShieldAlert, ShieldOff, Sparkles,
  PenLine, Trash2, Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResultadoPDF, ExtractionResponse, NivelConfianza, Compania, Ramo, Subramo } from '../lib/types';
import PolizaDetalle from '../components/lector/PolizaDetalle';
import { getCompanias, getRamos, getSubramos, reaplicarExtraccion } from '../lib/api';
import { EXCEL_COLS, formatEntidad } from '../lib/fieldConfig';
import {
  type Tanda, TTL_MS,
  crearTanda, guardarTandas, leerTandasVigentes, limpiarTandas,
} from '../lib/extractorPersistence';

const API_URL = '/api/extraer';

// Mismo tope que ya aplica el backend por solicitud (ver
// MAX_FILES_PER_REQUEST en api/routers/extraccion.py). Ahora que varias
// tandas se acumulan visibles a la vez, este límite se valida contra el
// TOTAL acumulado de todas las tandas en pantalla, no solo la tanda actual.
const MAX_PDFS_ACUMULADOS = 50;

const BADGE_COMPANIA: Record<string, string> = {
  'quálitas':   'bg-red-100 text-red-700',
  'qualitas':   'bg-red-100 text-red-700',
  'gnp':        'bg-blue-100 text-blue-700',
  'gnp seguros':'bg-blue-100 text-blue-700',
  'ana seguros':'bg-green-100 text-green-700',
  'hdi':        'bg-orange-100 text-orange-700',
  'banorte':    'bg-purple-100 text-purple-700',
  'el potosí':  'bg-yellow-100 text-yellow-700',
};

const CONFIANZA_BADGE: Record<NivelConfianza, { cls: string; icon: React.ReactNode; label: string }> = {
  alta:      { cls: 'text-emerald-600', icon: <ShieldCheck className="w-3 h-3" />, label: 'Alta' },
  media:     { cls: 'text-amber-500',   icon: <Shield      className="w-3 h-3" />, label: 'Media' },
  baja:      { cls: 'text-red-500',     icon: <ShieldAlert className="w-3 h-3" />, label: 'Baja' },
  sin_datos: { cls: 'text-gray-400',    icon: <ShieldOff   className="w-3 h-3" />, label: '?' },
};

function badgeCompania(compania?: string) {
  if (!compania) return 'bg-gray-100 text-gray-500';
  return BADGE_COMPANIA[compania.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
}

/* ── Correction state per fila (clave = `${tandaId}:${indice}`) ── */
interface CorrRowState {
  companiaId: number | null;
  ramoId: number | null;
  subramoId: number | null;
  ramos: Ramo[];
  subramos: Subramo[];
  cargando: boolean;
  errorMsg: string | null;
}

function corrKey(tandaId: string, i: number): string {
  return `${tandaId}:${i}`;
}

export default function LectorPolizas() {
  // Lazy initializer: corre una sola vez, de forma sincrónica, al montar —
  // así un F5 o volver a esta página restaura las tandas vigentes (menos de
  // TTL_MS desde que se completaron, cada una con su propio vencimiento)
  // antes del primer render.
  const [tandas, setTandas] = useState<Tanda[]>(() => leerTandasVigentes());
  const [procesando, setProcesando] = useState(false);
  const [procesandoMsg, setProcesandoMsg] = useState('Extrayendo datos…');
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [detalleSel, setDetalleSel] = useState<{ tandaId: string; index: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // El índice de tanda + índice local (no un índice global plano) es lo
  // que se guarda en estado, porque es estable frente a que OTRA tanda
  // expire: si una tanda anterior desaparece, un índice global se
  // correría y apuntaría a una póliza distinta sin avisar. Con
  // {tandaId, index} local, solo se ve afectado si expira la tanda que
  // el modal está mostrando — ver el useEffect de abajo para ese caso.
  const tandaDetalleIdx = detalleSel ? tandas.findIndex((t) => t.id === detalleSel.tandaId) : -1;
  const tandaDetalle = tandaDetalleIdx >= 0 ? tandas[tandaDetalleIdx] : null;
  const detalle = tandaDetalle && detalleSel ? tandaDetalle.resultados[detalleSel.index] ?? null : null;

  // Punto 4: si la tanda que el modal está mostrando expira mientras está
  // abierto, se cierra el modal en vez de dejarlo mostrando datos de una
  // tanda que ya no existe en pantalla — es el comportamiento más simple
  // y menos sorprendente (la alternativa, saltar solo a la tanda vecina,
  // podría sentirse como que la póliza "cambió sola" sin que el usuario
  // lo pidiera).
  useEffect(() => {
    if (detalleSel && tandaDetalleIdx === -1) setDetalleSel(null);
  }, [detalleSel, tandaDetalleIdx]);

  // Posición y total GLOBAL (todas las tandas visibles, en orden), para
  // que "anterior/siguiente" recorra todo el conjunto en vez de quedarse
  // encerrado dentro de una sola tanda.
  const totalPolizasGlobal = tandas.reduce((acc, t) => acc + t.resultados.length, 0);
  const indiceGlobalActual = tandaDetalleIdx >= 0 && detalleSel
    ? tandas.slice(0, tandaDetalleIdx).reduce((acc, t) => acc + t.resultados.length, 0) + detalleSel.index + 1
    : null;

  function irAPolizaAnterior() {
    setDetalleSel((sel) => {
      if (!sel) return sel;
      const tIdx = tandas.findIndex((t) => t.id === sel.tandaId);
      if (tIdx === -1) return sel;
      if (sel.index > 0) return { tandaId: sel.tandaId, index: sel.index - 1 };
      // Cruzar a la tanda anterior (si hay una), a su última póliza.
      for (let j = tIdx - 1; j >= 0; j--) {
        if (tandas[j].resultados.length > 0) {
          return { tandaId: tandas[j].id, index: tandas[j].resultados.length - 1 };
        }
      }
      return sel;
    });
  }

  function irAPolizaSiguiente() {
    setDetalleSel((sel) => {
      if (!sel) return sel;
      const tIdx = tandas.findIndex((t) => t.id === sel.tandaId);
      if (tIdx === -1) return sel;
      const tandaActual = tandas[tIdx];
      if (sel.index < tandaActual.resultados.length - 1) return { tandaId: sel.tandaId, index: sel.index + 1 };
      // Cruzar a la siguiente tanda (si hay una), a su primera póliza.
      for (let j = tIdx + 1; j < tandas.length; j++) {
        if (tandas[j].resultados.length > 0) {
          return { tandaId: tandas[j].id, index: 0 };
        }
      }
      return sel;
    });
  }

  /* Correction state */
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [corrMode, setCorrMode] = useState<Set<string>>(new Set());
  const [corrState, setCorrState] = useState<Record<string, CorrRowState>>({});

  /* Selección de PDFs individuales a borrar (checkboxes en la tabla).
   * Misma clave compuesta que corrMode/corrState (`${tandaId}:${indice}`). */
  const [seleccionEliminar, setSeleccionEliminar] = useState<Set<string>>(new Set());

  /* Notificación ligera, no bloqueante (no hay librería de toast instalada
     en package.json — se revisó antes de escribir esto — así que se
     construye una discreta reusando el mismo estilo de tarjeta/alerta que
     ya usa el resto de esta página). */
  const [toast, setToast] = useState<string | null>(null);

  // Persiste cada vez que cambian las tandas (nueva extracción, corrección
  // aplicada, expiración, o "Limpiar interfaz" dejándolas en []).
  useEffect(() => {
    guardarTandas(tandas);
  }, [tandas]);

  // Cada tanda vence TTL_MS después de completarse, de forma INDEPENDIENTE
  // — revisa periódicamente (cada 30s) y retira de la vista solo las que ya
  // vencieron, sin tocar las demás.
  useEffect(() => {
    const iv = setInterval(() => {
      setTandas((prev) => {
        const vigentes = prev.filter((t) => Date.now() - t.timestamp <= TTL_MS);
        return vigentes.length !== prev.length ? vigentes : prev;
      });
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const totalAcumulado = tandas.reduce((acc, t) => acc + t.resultados.length, 0);
  const limiteAlcanzado = totalAcumulado >= MAX_PDFS_ACUMULADOS;

  async function procesar(files: FileList) {
    if (limiteAlcanzado) {
      setToast(`Límite de ${MAX_PDFS_ACUMULADOS} PDFs alcanzado. Borra PDFs sueltos, una tanda, o usa "Limpiar interfaz".`);
      return;
    }
    setProcesando(true);
    setProcesandoMsg('Analizando PDFs…');
    setError(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));

      const timer  = setTimeout(() => setProcesandoMsg('Detectando compañía, ramo y subramo…'), 1500);
      const timer2 = setTimeout(() => setProcesandoMsg('Generando reglas de detección si es necesario…'), 4000);

      const res = await fetch(API_URL, { method: 'POST', body: formData });
      clearTimeout(timer);
      clearTimeout(timer2);

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Error del servidor: ${res.status} — ${txt}`);
      }
      const json: ExtractionResponse = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Error desconocido');

      const nuevaTanda = crearTanda(json.data);
      setTandas((prev) => {
        const actualizado = [...prev, nuevaTanda];
        const nuevoTotal = actualizado.reduce((acc, t) => acc + t.resultados.length, 0);
        if (nuevoTotal >= MAX_PDFS_ACUMULADOS) {
          setToast(`Límite de ${MAX_PDFS_ACUMULADOS} PDFs alcanzado. Borra PDFs sueltos, una tanda, o usa "Limpiar interfaz".`);
        }
        return actualizado;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setProcesando(false);
    }
  }

  /** Botón "Limpiar interfaz": borra todas las tandas de la vista y del
   * localStorage, y deja la interfaz lista para una tanda nueva sin
   * restricción de límite. */
  function limpiarInterfaz() {
    setTandas([]);
    limpiarTandas();
    setDetalleSel(null);
    setCorrMode(new Set());
    setCorrState({});
    setError(null);
    setToast(null);
  }

  function toggleFilaEliminar(tandaId: string, i: number) {
    const key = corrKey(tandaId, i);
    setSeleccionEliminar((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }

  function toggleTodosEliminar(tanda: Tanda) {
    setSeleccionEliminar((prev) => {
      const s = new Set(prev);
      const todosMarcados = tanda.resultados.every((_, i) => s.has(corrKey(tanda.id, i)));
      tanda.resultados.forEach((_, i) => {
        const key = corrKey(tanda.id, i);
        if (todosMarcados) s.delete(key); else s.add(key);
      });
      return s;
    });
  }

  /** Borra solo los PDFs marcados (de cualquier tanda). Si una tanda queda
   * sin registros, su tabla desaparece junto con ellos. */
  function eliminarSeleccionados() {
    if (seleccionEliminar.size === 0) return;

    // Si el modal de detalle está mostrando una póliza de una tanda
    // afectada por este borrado, se cierra en vez de intentar recalcular
    // si el índice que sobrevive sigue siendo la misma póliza — borrar
    // filas de en medio del arreglo recorre los índices de las que
    // quedan, así que "adivinar" cuál sigue siendo la misma es más
    // riesgo de mostrar datos equivocados que simplemente cerrar (mismo
    // criterio ya usado para expiración por tiempo).
    if (detalleSel) {
      const tandaAfectada = tandas.find((t) => t.id === detalleSel.tandaId);
      const afectaAlAbierto = tandaAfectada?.resultados.some((_, i) => seleccionEliminar.has(corrKey(tandaAfectada.id, i)));
      if (afectaAlAbierto) setDetalleSel(null);
    }

    setTandas((prev) => prev
      .map((t) => ({
        ...t,
        resultados: t.resultados.filter((_, i) => !seleccionEliminar.has(corrKey(t.id, i))),
      }))
      .filter((t) => t.resultados.length > 0));

    setSeleccionEliminar(new Set());
    // Los índices locales de las filas que sobreviven se recorren al
    // borrar de en medio del arreglo, así que cualquier estado de
    // corrección en curso (clave = tandaId:índice) queda referenciando
    // filas equivocadas — más simple y seguro limpiarlo todo que intentar
    // remapear claves.
    setCorrMode(new Set());
    setCorrState({});
  }

  /** Borra una tanda completa de un clic, sin marcar cada PDF. El modal de
   * detalle, si estaba mostrando algo de esta tanda, se cierra solo vía el
   * useEffect que ya existe para cuando una tanda deja de estar en
   * `tandas` (mismo camino que la expiración por tiempo). */
  function eliminarTanda(tandaId: string) {
    setTandas((prev) => prev.filter((t) => t.id !== tandaId));
    setSeleccionEliminar((prev) => {
      const s = new Set(prev);
      for (const key of s) if (key.startsWith(`${tandaId}:`)) s.delete(key);
      return s;
    });
    setCorrMode(new Set());
    setCorrState({});
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(e.type !== 'dragleave');
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) procesar(e.dataTransfer.files);
  }

  /* ── Correction helpers (por tanda + índice local) ── */
  async function entrarCorreccion(tandaId: string, i: number, r: ResultadoPDF) {
    const key = corrKey(tandaId, i);
    // Toggle off
    if (corrMode.has(key)) {
      setCorrMode((prev) => { const s = new Set(prev); s.delete(key); return s; });
      return;
    }

    // Ensure companias are loaded
    let comps = companias;
    if (!comps.length) {
      comps = await getCompanias();
      setCompanias(comps);
    }

    // Pre-fill compañía from detected name
    const comp = comps.find(
      (c) => c.nombre.toLowerCase() === (r.compania ?? '').toLowerCase()
    ) ?? null;

    // Fetch ramos for pre-filled compañía
    let ramos: Ramo[] = [];
    if (comp) ramos = await getRamos(comp.id);

    // Pre-fill ramo from detected name
    const ramo = ramos.find(
      (ra) => ra.nombre.toLowerCase() === (r.ramo ?? '').toLowerCase()
    ) ?? null;

    // Fetch subramos for pre-filled ramo
    let subramos: Subramo[] = [];
    if (ramo) subramos = await getSubramos(ramo.id);

    setCorrMode((prev) => new Set([...prev, key]));
    setCorrState((prev) => ({
      ...prev,
      [key]: {
        companiaId: comp?.id ?? null,
        ramoId:     ramo?.id ?? null,
        subramoId:  null,           // user must explicitly pick subramo
        ramos,
        subramos,
        cargando:   false,
        errorMsg:   null,
      },
    }));
  }

  async function handleCompaniaChange(tandaId: string, i: number, companiaId: number) {
    const key = corrKey(tandaId, i);
    const ramos = await getRamos(companiaId);
    setCorrState((prev) => ({
      ...prev,
      [key]: { ...prev[key], companiaId, ramoId: null, subramoId: null, ramos, subramos: [] },
    }));
  }

  async function handleRamoChange(tandaId: string, i: number, ramoId: number) {
    const key = corrKey(tandaId, i);
    const subramos = await getSubramos(ramoId);
    setCorrState((prev) => ({
      ...prev,
      [key]: { ...prev[key], ramoId, subramoId: null, subramos },
    }));
  }

  function handleSubramoChange(tandaId: string, i: number, subramoId: number) {
    const key = corrKey(tandaId, i);
    setCorrState((prev) => ({ ...prev, [key]: { ...prev[key], subramoId } }));
  }

  async function aplicarCorreccion(tandaId: string, i: number, r: ResultadoPDF) {
    const key = corrKey(tandaId, i);
    const cs = corrState[key];
    if (!cs?.subramoId) return;
    if (r.id == null) {
      setCorrState((prev) => ({ ...prev, [key]: { ...prev[key], errorMsg: 'Esta póliza no tiene ID guardado' } }));
      return;
    }

    setCorrState((prev) => ({ ...prev, [key]: { ...prev[key], cargando: true, errorMsg: null } }));
    try {
      const resultado = await reaplicarExtraccion(r.id, cs.subramoId);
      // Corregir una póliza cuenta como actividad relevante sobre esa
      // tanda: renueva su propio timestamp de vencimiento (no el de las
      // demás tandas).
      setTandas((prev) => prev.map((t) => (
        t.id === tandaId
          ? { ...t, resultados: t.resultados.map((x, j) => (j === i ? resultado : x)), timestamp: Date.now() }
          : t
      )));
      setCorrMode((prev) => { const s = new Set(prev); s.delete(key); return s; });
    } catch (e) {
      setCorrState((prev) => ({
        ...prev,
        [key]: { ...prev[key], cargando: false, errorMsg: e instanceof Error ? e.message : 'Error al reaplicar' },
      }));
    }
  }

  /* ── Exportar a Excel: elegir qué tandas incluir ──────────────────────────
   * Con una sola tanda visible no tiene caso pedirle al usuario que elija —
   * se exporta directo, sin fricción. Con 2 o más, se abre el mini-modal
   * para que escoja cuáles incluir (por defecto todas marcadas, igual que
   * el comportamiento de "exportar todo" que había antes de este cambio). */
  const [modalExportAbierto, setModalExportAbierto] = useState(false);
  const [tandasSeleccionadas, setTandasSeleccionadas] = useState<Set<string>>(new Set());

  function abrirExportar() {
    if (tandas.length <= 1) {
      exportarExcel(tandas.flatMap((t) => t.resultados));
      return;
    }
    setTandasSeleccionadas(new Set(tandas.map((t) => t.id)));
    setModalExportAbierto(true);
  }

  function confirmarExportar() {
    const resultados = tandas
      .filter((t) => tandasSeleccionadas.has(t.id))
      .flatMap((t) => t.resultados);
    setModalExportAbierto(false);
    exportarExcel(resultados);
  }

  function exportarExcel(todosResultados: ResultadoPDF[]) {
    if (!todosResultados.length) return;

    const c = (r: ResultadoPDF, k: string) => {
      const v = r.campos?.[k]?.valor ?? null;
      return k === 'entidad' && v !== null ? formatEntidad(v) : v;
    };

    // Cabeceras: metadatos fijos + todas las columnas de fieldConfig
    const metaHeaders  = ['Archivo', 'Compañía', 'Ramo', 'Subramo'];
    const campoHeaders = EXCEL_COLS.map((col) => col.header);
    const extraHeaders = ['Confianza detección', 'Error', 'Método'];
    const headers      = [...metaHeaders, ...campoHeaders, ...extraHeaders];

    const filas = todosResultados.map((r) => [
      // Metadatos
      r.archivo, r.compania, r.ramo, r.subramo,
      // Campos dinámicos (usa fieldConfig para el orden y nombres)
      ...EXCEL_COLS.map(({ campo }) => c(r, campo)),
      // Extra
      r.deteccion?.confianza ?? '—',
      r.error ?? '',
      r.stats.por_ia > 0
        ? `IA(${r.stats.por_ia}) + Regla(${r.stats.por_regla})`
        : `Regla(${r.stats.por_regla})`,
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...filas]);
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.min(Math.max(h.length, ...filas.map((f) => String(f[i] ?? '').length)) + 2, 40),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pólizas');
    XLSX.writeFile(wb, `polizas_${Date.now()}.xlsx`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Lector de Pólizas</h1>
            <p className="text-xs text-gray-500">GNP · Quálitas · ANA · HDI · Banorte · El Potosí y más</p>
          </div>
        </div>
        {totalAcumulado > 0 && (
          <button
            onClick={abrirExportar}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>
        )}
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-5">

        {/* ── Drop zone ── */}
        <div
          onDragEnter={handleDrag} onDragLeave={handleDrag}
          onDragOver={handleDrag} onDrop={handleDrop}
          onClick={() => !procesando && inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
            ${dragActive ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}
            ${procesando ? 'pointer-events-none opacity-70' : ''}
          `}
        >
          <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden"
            onChange={(e) => e.target.files?.length && procesar(e.target.files)} />

          {procesando ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="font-semibold text-gray-700">{procesandoMsg}</p>
              <p className="text-xs text-gray-400">
                El sistema detecta compañía · ramo · subramo y genera reglas si son necesarias
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-gray-100 rounded-2xl">
                <FileUp className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-semibold text-gray-700">Arrastra archivos PDF aquí</p>
              <p className="text-sm text-gray-400">o haz clic para seleccionar · Múltiples archivos permitidos</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4 inline mr-1.5" />
                Seleccionar Archivos
              </button>
              {limiteAlcanzado && (
                <p className="text-xs text-amber-600 font-medium">
                  Límite de {MAX_PDFS_ACUMULADOS} PDFs alcanzado — usa "Limpiar interfaz" para subir más.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Error global ── */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
          </div>
        )}

        {tandas.length > 0 && (
          <>
            {/* ── Barra global: totales acumulados + Limpiar interfaz ── */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-3 flex-wrap">
                <Chip icon={<FileText className="w-4 h-4" />}
                  label={`${totalAcumulado} archivo${totalAcumulado !== 1 ? 's' : ''} en total`} color="gray" />
                <Chip icon={<Layers className="w-4 h-4" />}
                  label={`${tandas.length} tanda${tandas.length !== 1 ? 's' : ''}`} color="gray" />
              </div>
              <div className="flex items-center gap-2">
                {seleccionEliminar.size > 0 && (
                  <button
                    onClick={eliminarSeleccionados}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 rounded-xl text-sm font-medium transition-colors"
                    title="Borra solo los PDFs marcados"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar seleccionados ({seleccionEliminar.size})
                  </button>
                )}
                <button
                  onClick={limpiarInterfaz}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-medium transition-colors"
                  title="Borra todas las tandas de la vista y del almacenamiento local"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpiar interfaz
                </button>
              </div>
            </div>

            {/* ── Una sección independiente por tanda ── */}
            {tandas.map((tanda, tIdx) => (
              <TandaSeccion
                key={tanda.id}
                tanda={tanda}
                numero={tIdx + 1}
                companias={companias}
                corrMode={corrMode}
                corrState={corrState}
                seleccionEliminar={seleccionEliminar}
                onVerDetalle={(index) => setDetalleSel({ tandaId: tanda.id, index })}
                onEntrarCorreccion={(i, r) => entrarCorreccion(tanda.id, i, r)}
                onCompaniaChange={(i, companiaId) => handleCompaniaChange(tanda.id, i, companiaId)}
                onRamoChange={(i, ramoId) => handleRamoChange(tanda.id, i, ramoId)}
                onSubramoChange={(i, subramoId) => handleSubramoChange(tanda.id, i, subramoId)}
                onAplicarCorreccion={(i, r) => aplicarCorreccion(tanda.id, i, r)}
                onToggleFila={(i) => toggleFilaEliminar(tanda.id, i)}
                onToggleTodos={() => toggleTodosEliminar(tanda)}
                onEliminarTanda={() => eliminarTanda(tanda.id)}
              />
            ))}
          </>
        )}
      </main>

      {detalle && tandaDetalle && detalleSel && indiceGlobalActual != null && (
        <PolizaDetalle
          data={detalle}
          tandaNumero={tandaDetalleIdx + 1}
          onClose={() => setDetalleSel(null)}
          onAnterior={irAPolizaAnterior}
          onSiguiente={irAPolizaSiguiente}
          indiceActual={indiceGlobalActual}
          totalPolizas={totalPolizasGlobal}
        />
      )}

      {/* ── Toast: informativo, no bloqueante ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div className="flex items-start gap-3 p-4 bg-gray-900 text-white rounded-xl shadow-lg">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{toast}</p>
            <button onClick={() => setToast(null)} className="flex-shrink-0">
              <X className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>
      )}

      {modalExportAbierto && (
        <ExportarModal
          tandas={tandas}
          seleccionadas={tandasSeleccionadas}
          onToggle={(id) => setTandasSeleccionadas((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id); else s.add(id);
            return s;
          })}
          onCancelar={() => setModalExportAbierto(false)}
          onConfirmar={confirmarExportar}
        />
      )}
    </div>
  );
}

/** Mini-modal para elegir qué tandas incluir en la exportación a Excel.
 * Solo se muestra cuando hay 2+ tandas visibles (con 1 sola se exporta
 * directo, ver abrirExportar) — no cambia en nada la generación del
 * archivo en sí, solo decide qué subconjunto de resultados se le pasa a
 * exportarExcel(). */
function ExportarModal({
  tandas, seleccionadas, onToggle, onCancelar, onConfirmar,
}: {
  tandas: Tanda[];
  seleccionadas: Set<string>;
  onToggle: (id: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleConfirmar() {
    if (seleccionadas.size === 0) {
      setErrorMsg('Selecciona al menos una tanda para exportar.');
      return;
    }
    onConfirmar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">¿Qué tandas quieres exportar?</h3>
          <p className="text-xs text-gray-500 mt-0.5">Elige una o varias de las tandas visibles en pantalla.</p>
        </div>

        <div className="px-5 py-3 max-h-80 overflow-y-auto space-y-1.5">
          {tandas.map((t, idx) => (
            <label
              key={t.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={seleccionadas.has(t.id)}
                onChange={() => { onToggle(t.id); setErrorMsg(null); }}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400"
              />
              <span className="text-sm text-gray-700">
                Tanda {idx + 1} · {new Date(t.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                {t.resultados.length} archivo{t.resultados.length !== 1 ? 's' : ''}
              </span>
            </label>
          ))}
        </div>

        {errorMsg && (
          <p className="px-5 text-xs text-red-600">{errorMsg}</p>
        )}

        <div className="px-5 py-4 flex items-center justify-end gap-2 border-t border-gray-100 mt-2">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

/** Una tanda = un lote subido de una sola vez. Cada una muestra su propio
 * encabezado "N archivos / N procesados", sus alertas contextuales y su
 * tabla — independiente de las demás tandas acumuladas en pantalla. */
function TandaSeccion({
  tanda, numero, companias, corrMode, corrState, seleccionEliminar,
  onVerDetalle, onEntrarCorreccion, onCompaniaChange, onRamoChange, onSubramoChange, onAplicarCorreccion,
  onToggleFila, onToggleTodos, onEliminarTanda,
}: {
  tanda: Tanda;
  numero: number;
  companias: Compania[];
  corrMode: Set<string>;
  corrState: Record<string, CorrRowState>;
  seleccionEliminar: Set<string>;
  onVerDetalle: (index: number) => void;
  onEntrarCorreccion: (i: number, r: ResultadoPDF) => void;
  onCompaniaChange: (i: number, companiaId: number) => void;
  onRamoChange: (i: number, ramoId: number) => void;
  onSubramoChange: (i: number, subramoId: number) => void;
  onAplicarCorreccion: (i: number, r: ResultadoPDF) => void;
  onToggleFila: (i: number) => void;
  onToggleTodos: () => void;
  onEliminarTanda: () => void;
}) {
  const resultados = tanda.resultados;
  const exitosos      = resultados.filter((r) => !r.error);
  const conError      = resultados.filter((r) => r.error);
  const noReconocidas = resultados.filter((r) => !r.compania && !r.error);
  const conPatrones   = resultados.filter((r) => r.deteccion?.patrones_generados);
  const confianzaBaja = resultados.filter((r) => r.compania && (r.deteccion?.confianza === 'baja' || r.deteccion?.confianza === 'sin_datos'));
  const sinSubramo    = resultados.filter((r) => r.compania && !r.subramo && !r.error);

  return (
    <div className="space-y-3 pt-2 border-t border-gray-200 first:border-t-0 first:pt-0">
      {/* ── Encabezado de la tanda ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-500">
          Tanda {numero} · {new Date(tanda.timestamp).toLocaleTimeString('es-MX')}
        </h2>
        <div className="flex gap-3 flex-wrap">
          <Chip icon={<FileText className="w-4 h-4" />}
            label={`${resultados.length} archivo${resultados.length !== 1 ? 's' : ''}`} color="gray" />
          {exitosos.length > 0 && (
            <Chip icon={<CheckCircle2 className="w-4 h-4" />}
              label={`${exitosos.length} procesado${exitosos.length !== 1 ? 's' : ''}`} color="green" />
          )}
          {conError.length > 0 && (
            <Chip icon={<AlertCircle className="w-4 h-4" />}
              label={`${conError.length} con error`} color="red" />
          )}
          {conPatrones.length > 0 && (
            <Chip icon={<Sparkles className="w-4 h-4" />}
              label={`${conPatrones.length} con reglas nuevas`} color="purple" />
          )}
          <button
            onClick={onEliminarTanda}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
            title="Elimina esta tanda completa de la vista y del almacenamiento local"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar tanda
          </button>
        </div>
      </div>

      {/* ── Notificación: patrones generados ── */}
      {conPatrones.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
          <Sparkles className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-purple-800">
              Reglas de detección generadas automáticamente
            </p>
            <p className="text-xs text-purple-700 mt-0.5">
              Se crearon patrones regex para las siguientes pólizas. A partir de ahora se detectarán sin usar IA.
            </p>
            <div className="mt-2 space-y-1">
              {conPatrones.map((r, i) => {
                const p = r.deteccion?.patrones_nuevos;
                return (
                  <div key={i} className="text-[11px] text-purple-700">
                    <span className="font-semibold">{r.compania} → {r.ramo} → {r.subramo ?? '?'}</span>
                    {p?.compania?.length ? <span className="ml-2 text-purple-500">Compañía: {p.compania.slice(0,2).join(', ')}</span> : null}
                    {p?.ramo?.length     ? <span className="ml-2 text-purple-500">Ramo: {p.ramo[0]}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
          <Link to="/reglas"
            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-purple-700 border border-purple-300 hover:bg-purple-100 rounded-lg transition-colors">
            Ver entrenamiento →
          </Link>
        </div>
      )}

      {/* ── Alerta: subramo no detectado ── */}
      {sinSubramo.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <PenLine className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-800">
              {sinSubramo.length === 1 ? '1 póliza' : `${sinSubramo.length} pólizas`} sin subramo detectado
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Se detectó la compañía y el ramo, pero no el subramo. Usa el botón{' '}
              <span className="font-semibold">Corregir</span> en la fila para seleccionarlo manualmente
              y aplicar las reglas de extracción correctas.
            </p>
          </div>
        </div>
      )}

      {/* ── Alerta: pólizas no reconocidas ── */}
      {noReconocidas.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {noReconocidas.length === 1 ? '1 póliza' : `${noReconocidas.length} pólizas`} no reconocida{noReconocidas.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              No se detectó la compañía. Necesitas entrenar los patrones de detección para este tipo de póliza.
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {noReconocidas.map((r, i) => (
                <span key={i} className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">{r.archivo}</span>
              ))}
            </div>
          </div>
          <Link to="/reglas"
            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">
            Entrenar →
          </Link>
        </div>
      )}

      {/* ── Alerta: detección con confianza baja ── */}
      {confianzaBaja.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
          <Shield className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800">
              Detección con confianza baja en {confianzaBaja.length} póliza{confianzaBaja.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-orange-700 mt-0.5">
              Se detectó la compañía pero los patrones son débiles. Los datos pudieron extraerse incorrectamente.
              Agrega más pólizas al lote de entrenamiento para mejorar los patrones.
            </p>
          </div>
          <Link to="/reglas"
            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold border border-orange-300 text-orange-700 hover:bg-orange-100 rounded-lg transition-colors">
            Mejorar →
          </Link>
        </div>
      )}

      {/* ── Tabla de resultados de esta tanda ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={resultados.length > 0 && resultados.every((_, i) => seleccionEliminar.has(corrKey(tanda.id, i)))}
                    ref={(el) => {
                      if (!el) return;
                      const algunMarcado = resultados.some((_, i) => seleccionEliminar.has(corrKey(tanda.id, i)));
                      const todosMarcados = resultados.length > 0 && resultados.every((_, i) => seleccionEliminar.has(corrKey(tanda.id, i)));
                      el.indeterminate = algunMarcado && !todosMarcados;
                    }}
                    onChange={onToggleTodos}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400"
                    title="Seleccionar todos los PDFs de esta tanda"
                  />
                </th>
                {['Archivo', 'Compañía / Detección', 'N. Póliza', 'Cliente', 'Placas', 'Prima Total', 'Vigencia', 'Método', 'Estado', ''].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resultados.map((r, i) => {
                const det     = r.deteccion;
                const conf    = det?.confianza ?? 'sin_datos';
                const confCfg = CONFIANZA_BADGE[conf];
                const key     = corrKey(tanda.id, i);
                const enCorr  = corrMode.has(key);
                const cs      = corrState[key];

                return (
                  <>
                    {/* ── Main row ── */}
                    <tr key={`row-${i}`} className={`hover:bg-gray-50 transition-colors ${enCorr ? 'bg-blue-50/40' : ''}`}>
                      {/* Checkbox de selección para borrado individual */}
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={seleccionEliminar.has(key)}
                          onChange={() => onToggleFila(i)}
                          className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400"
                        />
                      </td>
                      {/* Archivo */}
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-800 max-w-[140px]">
                        <p className="truncate">{r.archivo}</p>
                      </td>

                      {/* Compañía + ramo + subramo + badge confianza */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          {r.compania
                            ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold self-start ${badgeCompania(r.compania)}`}>{r.compania}</span>
                            : <span className="text-xs text-gray-400">No detectada</span>}
                          {r.ramo && (
                            <span className="text-[10px] text-gray-500">{r.ramo}{r.subramo ? ` › ${r.subramo}` : <span className="text-amber-500 ml-1">(sin subramo)</span>}</span>
                          )}
                          <div className={`flex items-center gap-1 text-[10px] font-medium ${confCfg.cls}`}>
                            {confCfg.icon}
                            <span>{confCfg.label}</span>
                            {det && (
                              <span className="text-gray-400 font-normal">
                                · {det.score_compania}+{det.score_ramo}+{det.score_subramo} pts
                              </span>
                            )}
                            {det?.patrones_generados && (
                              <span className="text-purple-500 flex items-center gap-0.5 ml-1">
                                <Sparkles className="w-2.5 h-2.5" />nuevas reglas
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Campos — nombres canónicos post-migración */}
                      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">
                        {r.campos?.documento?.valor || r.campos?.numero_poliza?.valor || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px] truncate">
                        {r.campos?.nombre_cliente?.valor || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">
                        {r.campos?.placas?.valor || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-800">
                        {r.campos?.prima_total?.valor || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {(r.campos?.desde?.valor || r.campos?.inicio_vigencia?.valor) &&
                         (r.campos?.hasta?.valor || r.campos?.fin_vigencia?.valor)
                          ? `${r.campos?.desde?.valor ?? r.campos?.inicio_vigencia?.valor} – ${r.campos?.hasta?.valor ?? r.campos?.fin_vigencia?.valor}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.stats?.por_ia > 0
                          ? <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 font-medium"><Cpu className="w-3 h-3" />IA ({r.stats.por_ia})</span>
                          : <span className="text-[10px] text-gray-400">Regla ({r.stats?.por_regla ?? 0})</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.error
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium"><AlertCircle className="w-3 h-3" />Error</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium"><CheckCircle2 className="w-3 h-3" />OK</span>}
                      </td>
                      {/* Acciones */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => onVerDetalle(i)} className="text-blue-600 hover:text-blue-800 text-xs font-medium inline-flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />Ver
                          </button>
                          {!r.error && r.id != null && (
                            <button
                              onClick={() => onEntrarCorreccion(i, r)}
                              className={`text-xs font-medium inline-flex items-center gap-1 transition-colors ${enCorr ? 'text-blue-700 font-semibold' : 'text-gray-400 hover:text-gray-700'}`}
                              title="Seleccionar subramo manualmente y re-extraer"
                            >
                              <PenLine className="w-3.5 h-3.5" />
                              {enCorr ? 'Cancelar' : 'Corregir'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Inline correction panel ── */}
                    {enCorr && cs && (
                      <tr key={`corr-${i}`} className="bg-blue-50/60 border-b border-blue-100">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="flex flex-col gap-3">
                            <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                              <PenLine className="w-3.5 h-3.5" />
                              Selecciona el módulo correcto para <span className="font-bold">{r.archivo}</span>
                              {' '}— se re-extraerán los campos con las reglas del subramo elegido
                            </p>

                            <div className="flex flex-wrap items-end gap-3">
                              {/* Compañía selector */}
                              <label className="flex flex-col gap-1 text-[11px] text-gray-600 font-medium">
                                Compañía
                                <select
                                  value={cs.companiaId ?? ''}
                                  onChange={(e) => onCompaniaChange(i, Number(e.target.value))}
                                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white min-w-[140px] focus:ring-2 focus:ring-blue-300 focus:outline-none"
                                >
                                  <option value="">Seleccionar…</option>
                                  {companias.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                  ))}
                                </select>
                              </label>

                              {/* Ramo selector */}
                              <label className="flex flex-col gap-1 text-[11px] text-gray-600 font-medium">
                                Ramo
                                <select
                                  value={cs.ramoId ?? ''}
                                  onChange={(e) => onRamoChange(i, Number(e.target.value))}
                                  disabled={!cs.companiaId}
                                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white min-w-[160px] focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:opacity-50"
                                >
                                  <option value="">Seleccionar…</option>
                                  {cs.ramos.map((ra) => (
                                    <option key={ra.id} value={ra.id}>{ra.nombre}</option>
                                  ))}
                                </select>
                              </label>

                              {/* Subramo selector */}
                              <label className="flex flex-col gap-1 text-[11px] text-gray-600 font-medium">
                                Subramo
                                <select
                                  value={cs.subramoId ?? ''}
                                  onChange={(e) => onSubramoChange(i, Number(e.target.value))}
                                  disabled={!cs.ramoId}
                                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white min-w-[180px] focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:opacity-50"
                                >
                                  <option value="">Seleccionar…</option>
                                  {cs.subramos.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.nombre}
                                      {s.cobertura?.campos_con_regla
                                        ? ` (${s.cobertura.campos_con_regla} reglas)`
                                        : ' (sin reglas)'}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              {/* Buttons */}
                              <div className="flex items-center gap-2 pb-0.5">
                                <button
                                  onClick={() => onAplicarCorreccion(i, r)}
                                  disabled={!cs.subramoId || cs.cargando}
                                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                                >
                                  {cs.cargando
                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Aplicando…</>
                                    : <><CheckCircle2 className="w-3.5 h-3.5" />Aplicar reglas</>}
                                </button>
                              </div>
                            </div>

                            {cs.errorMsg && (
                              <p className="text-[11px] text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />{cs.errorMsg}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, color }: { icon: React.ReactNode; label: string; color: 'gray' | 'green' | 'red' | 'purple' }) {
  const cls = {
    gray:   'bg-gray-100 text-gray-600',
    green:  'bg-emerald-50 text-emerald-700',
    red:    'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
  }[color];
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${cls}`}>
      {icon}{label}
    </div>
  );
}
