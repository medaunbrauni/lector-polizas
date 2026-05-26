import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileUp, Loader2, CheckCircle2, AlertCircle,
  Download, Eye, X, Car, FileText, Cpu,
  ShieldCheck, Shield, ShieldAlert, ShieldOff, Sparkles,
  PenLine,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResultadoPDF, ExtractionResponse, NivelConfianza, Compania, Ramo, Subramo } from '../lib/types';
import PolizaDetalle from '../components/lector/PolizaDetalle';
import { getCompanias, getRamos, getSubramos, reaplicarExtraccion } from '../lib/api';
import { EXCEL_COLS } from '../lib/fieldConfig';

const API_URL = '/api/extraer';

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

/* ── Correction state per row ── */
interface CorrRowState {
  companiaId: number | null;
  ramoId: number | null;
  subramoId: number | null;
  ramos: Ramo[];
  subramos: Subramo[];
  cargando: boolean;
  errorMsg: string | null;
}

export default function LectorPolizas() {
  const [resultados, setResultados] = useState<ResultadoPDF[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [procesandoMsg, setProcesandoMsg] = useState('Extrayendo datos…');
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [detalle, setDetalle] = useState<ResultadoPDF | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Correction state */
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [corrMode, setCorrMode] = useState<Set<number>>(new Set());
  const [corrState, setCorrState] = useState<Record<number, CorrRowState>>({});

  async function procesar(files: FileList) {
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
      setResultados(json.data);
      setCorrMode(new Set());
      setCorrState({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setProcesando(false);
    }
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

  /* ── Correction helpers ── */
  async function entrarCorreccion(i: number, r: ResultadoPDF) {
    // Toggle off
    if (corrMode.has(i)) {
      setCorrMode((prev) => { const s = new Set(prev); s.delete(i); return s; });
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

    setCorrMode((prev) => new Set([...prev, i]));
    setCorrState((prev) => ({
      ...prev,
      [i]: {
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

  async function handleCompaniaChange(i: number, companiaId: number) {
    const ramos = await getRamos(companiaId);
    setCorrState((prev) => ({
      ...prev,
      [i]: { ...prev[i], companiaId, ramoId: null, subramoId: null, ramos, subramos: [] },
    }));
  }

  async function handleRamoChange(i: number, ramoId: number) {
    const subramos = await getSubramos(ramoId);
    setCorrState((prev) => ({
      ...prev,
      [i]: { ...prev[i], ramoId, subramoId: null, subramos },
    }));
  }

  function handleSubramoChange(i: number, subramoId: number) {
    setCorrState((prev) => ({ ...prev, [i]: { ...prev[i], subramoId } }));
  }

  async function aplicarCorreccion(i: number, r: ResultadoPDF) {
    const cs = corrState[i];
    if (!cs?.subramoId) return;
    if (r.id == null) {
      setCorrState((prev) => ({ ...prev, [i]: { ...prev[i], errorMsg: 'Esta póliza no tiene ID guardado' } }));
      return;
    }

    setCorrState((prev) => ({ ...prev, [i]: { ...prev[i], cargando: true, errorMsg: null } }));
    try {
      const resultado = await reaplicarExtraccion(r.id, cs.subramoId);
      setResultados((prev) => prev.map((x, j) => (j === i ? resultado : x)));
      setCorrMode((prev) => { const s = new Set(prev); s.delete(i); return s; });
    } catch (e) {
      setCorrState((prev) => ({
        ...prev,
        [i]: { ...prev[i], cargando: false, errorMsg: e instanceof Error ? e.message : 'Error al reaplicar' },
      }));
    }
  }

  function exportarExcel() {
    if (!resultados.length) return;

    const c = (r: ResultadoPDF, k: string) => r.campos?.[k]?.valor ?? null;

    // Cabeceras: metadatos fijos + todas las columnas de fieldConfig
    const metaHeaders  = ['Archivo', 'Compañía', 'Ramo', 'Subramo'];
    const campoHeaders = EXCEL_COLS.map((col) => col.header);
    const extraHeaders = ['Confianza detección', 'Error', 'Método'];
    const headers      = [...metaHeaders, ...campoHeaders, ...extraHeaders];

    const filas = resultados.map((r) => [
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

  const exitosos      = resultados.filter((r) => !r.error);
  const conError      = resultados.filter((r) => r.error);
  const noReconocidas = resultados.filter((r) => !r.compania && !r.error);
  const conPatrones   = resultados.filter((r) => r.deteccion?.patrones_generados);
  const confianzaBaja = resultados.filter((r) => r.compania && (r.deteccion?.confianza === 'baja' || r.deteccion?.confianza === 'sin_datos'));
  const sinSubramo    = resultados.filter((r) => r.compania && !r.subramo && !r.error);

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
        {resultados.length > 0 && (
          <button
            onClick={exportarExcel}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-5">

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

        {resultados.length > 0 && (
          <>
            {/* ── Stats chips ── */}
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

            {/* ── Tabla de resultados ── */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
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
                      const enCorr  = corrMode.has(i);
                      const cs      = corrState[i];

                      return (
                        <>
                          {/* ── Main row ── */}
                          <tr key={`row-${i}`} className={`hover:bg-gray-50 transition-colors ${enCorr ? 'bg-blue-50/40' : ''}`}>
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
                                <button onClick={() => setDetalle(r)} className="text-blue-600 hover:text-blue-800 text-xs font-medium inline-flex items-center gap-1">
                                  <Eye className="w-3.5 h-3.5" />Ver
                                </button>
                                {!r.error && r.id != null && (
                                  <button
                                    onClick={() => entrarCorreccion(i, r)}
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
                              <td colSpan={10} className="px-4 py-3">
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
                                        onChange={(e) => handleCompaniaChange(i, Number(e.target.value))}
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
                                        onChange={(e) => handleRamoChange(i, Number(e.target.value))}
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
                                        onChange={(e) => handleSubramoChange(i, Number(e.target.value))}
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
                                        onClick={() => aplicarCorreccion(i, r)}
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
          </>
        )}
      </main>

      {detalle && <PolizaDetalle data={detalle} onClose={() => setDetalle(null)} />}
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
