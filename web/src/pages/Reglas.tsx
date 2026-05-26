import { useEffect, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  getCompanias, getRamos, getSubramos, getCampos,
  identificarModulo,
  subirPolizasEntrenamiento, eliminarPolizaEntrenamiento,
  urlPdfEntrenamiento, guardarSeleccion, eliminarSeleccion,
  getEstadoLote, generarRegexLote, probarRegexLote, guardarReglaLote,
} from '../lib/api';
import type {
  Compania, Ramo, Subramo, Campo,
  PolizaEntrenamiento, MapaSelecciones, ResultadoRegexLote, AutoDeteccion, BBox,
} from '../lib/types';
import {
  Upload, Trash2, ChevronLeft, ChevronRight, ScanSearch,
  Zap, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  FileText, MousePointer2, Sparkles, Save, Eye,
} from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ─────────────────────────────────────────────────────────────────────────────

export default function Reglas() {
  // ── Catálogos ──────────────────────────────────────────────────────────────
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [subramos, setSubramos] = useState<Subramo[]>([]);
  const [campos, setCampos] = useState<Campo[]>([]);

  const [selCompania, setSelCompania] = useState('');
  const [selRamo, setSelRamo] = useState('');
  const [selSubramo, setSelSubramo] = useState('');

  // ── Lote de pólizas ────────────────────────────────────────────────────────
  const [polizas, setPolizas] = useState<PolizaEntrenamiento[]>([]);
  const [polizaIdx, setPolizaIdx] = useState(0);
  const [subiendo, setSubiendo] = useState(false);

  // ── Selecciones y reglas ───────────────────────────────────────────────────
  const [selecciones, setSelecciones] = useState<MapaSelecciones>({});
  const [reglas, setReglas] = useState<Record<string, { id: number; patron_regex: string; cobertura_lote: number | null; total_lote: number | null; creado_por: string }>>({});

  // ── Estado del campo activo ────────────────────────────────────────────────
  const [campoActivo, setCampoActivo] = useState('');
  const [textoSeleccionado, setTextoSeleccionado] = useState('');
  const [bboxCapturado, setBboxCapturado] = useState<BBox | null>(null);

  // ── Regex y resultados ─────────────────────────────────────────────────────
  const [resultados, setResultados] = useState<Record<string, ResultadoRegexLote>>({});
  const [regexEditado, setRegexEditado] = useState<Record<string, string>>({});
  const [generando, setGenerando] = useState<string | null>(null);  // nombre_campo en proceso
  const [probando, setProbando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Auto-detección ─────────────────────────────────────────────────────────
  const [autoDeteccion, setAutoDeteccion] = useState<AutoDeteccion[]>([]);

  // ── Detección por PDF (identificar módulo) ─────────────────────────────────
  const [detectando, setDetectando] = useState(false);
  const [detectMsg, setDetectMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const pendingAutoSelect = useRef<{ ramo_id: number; subramo_id: number } | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loteInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(520);

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => { getCompanias().then(setCompanias); }, []);

  useEffect(() => {
    const pending = pendingAutoSelect.current;
    if (pending) {
      setSelRamo(String(pending.ramo_id));
    } else {
      if (selCompania) getRamos(Number(selCompania)).then(setRamos);
      setSelRamo(''); setSelSubramo('');
    }
  }, [selCompania]);

  useEffect(() => {
    const pending = pendingAutoSelect.current;
    if (pending) {
      const sid = pending.subramo_id;
      pendingAutoSelect.current = null;
      setSelSubramo(String(sid));
    } else {
      if (selRamo) getSubramos(Number(selRamo)).then(setSubramos);
      setSelSubramo('');
    }
  }, [selRamo]);

  useEffect(() => {
    if (!selSubramo) return;
    const sid = Number(selSubramo);
    getCampos(sid).then(setCampos);
    cargarEstado(sid);
    setCampoActivo('');
    setTextoSeleccionado('');
    setBboxCapturado(null);
    setResultados({});
    setRegexEditado({});
    setAutoDeteccion([]);
  }, [selSubramo]);

  async function cargarEstado(subramoId: number) {
    const estado = await getEstadoLote(subramoId);
    setPolizas(estado.polizas);
    setSelecciones(estado.selecciones);
    setReglas(estado.reglas);
    setPolizaIdx(0);
  }

  // ── ResizeObserver para el ancho del visor PDF ─────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPageWidth(el.clientWidth - 2);
    const ro = new ResizeObserver((entries) => {
      setPageWidth(Math.floor(entries[0].contentRect.width) - 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Auto-scroll al highlight del texto extraído ────────────────────────────
  useEffect(() => {
    if (!textoSeleccionado) return;
    const t = setTimeout(() => {
      document.getElementById('extracted-highlight')?.scrollIntoView({
        behavior: 'smooth', block: 'nearest',
      });
    }, 120);
    return () => clearTimeout(t);
  }, [textoSeleccionado]);

  // ── Póliza activa ──────────────────────────────────────────────────────────
  const polizaActiva = polizas[polizaIdx] ?? null;
  const pdfUrl = polizaActiva ? urlPdfEntrenamiento(polizaActiva.id) : null;
  const textoPolizaActiva: string = (() => {
    // Buscamos en el estado de selecciones para obtener contexto
    // El texto real no se carga al frontend (puede ser grande); se usa solo para validación inline
    // Lo reconstruimos desde selecciones si está disponible
    return '';
  })();

  // ── Subir pólizas al lote ──────────────────────────────────────────────────
  async function handleSubirPolizas(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !selSubramo) return;
    e.target.value = '';
    setSubiendo(true);
    try {
      const nuevas = await subirPolizasEntrenamiento(Number(selSubramo), files);
      setPolizas((prev) => {
        const merged = [...prev];
        for (const n of nuevas) {
          if (!merged.find((p) => p.id === n.id)) merged.push(n);
        }
        return merged;
      });
      if (polizas.length === 0) setPolizaIdx(0);
    } finally {
      setSubiendo(false);
    }
  }

  // ── Detectar módulo desde PDF ──────────────────────────────────────────────
  async function handleDetectarPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setDetectando(true); setDetectMsg(null);
    try {
      const res = await identificarModulo(file);
      if (!res.compania_id) {
        setDetectMsg({ ok: false, texto: 'No se reconoció la compañía' });
        return;
      }
      const [ramosData, subramosData] = await Promise.all([
        getRamos(res.compania_id),
        res.ramo_id ? getSubramos(res.ramo_id) : Promise.resolve([]),
      ]);
      setRamos(ramosData);
      if (res.ramo_id && subramosData.length) setSubramos(subramosData);
      const label = [res.compania_nombre, res.ramo_nombre, res.subramo_nombre].filter(Boolean).join(' › ');
      setDetectMsg({ ok: true, texto: `Detectado: ${label}` });
      if (res.ramo_id && res.subramo_id) {
        pendingAutoSelect.current = { ramo_id: res.ramo_id, subramo_id: res.subramo_id };
      }
      setSelCompania(String(res.compania_id));
    } catch (err) {
      setDetectMsg({ ok: false, texto: err instanceof Error ? err.message : 'Error' });
    } finally {
      setDetectando(false);
    }
  }

  // ── Eliminar póliza del lote ───────────────────────────────────────────────
  async function handleEliminarPoliza(id: number) {
    await eliminarPolizaEntrenamiento(id);
    setPolizas((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (polizaIdx >= next.length) setPolizaIdx(Math.max(0, next.length - 1));
      return next;
    });
  }

  // ── Captura de selección desde el visor PDF ────────────────────────────────
  const handleSeleccion = useCallback(() => {
    if (!campoActivo || !polizaActiva) return;
    const sel = window.getSelection();
    if (!sel || !sel.toString().trim()) return;
    const txt = sel.toString().trim();

    // Capturar bbox
    let bbox: BBox | null = null;
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const selRect = range.getBoundingClientRect();
      let node: Node | null = range.startContainer;
      let pageEl: Element | null = null;
      while (node) {
        if (node instanceof Element && node.classList.contains('react-pdf__Page')) {
          pageEl = node; break;
        }
        node = node.parentNode;
      }
      if (pageEl && selRect.width > 0) {
        const pageNum = parseInt(pageEl.getAttribute('data-page-number') || '1', 10);
        const pageRect = pageEl.getBoundingClientRect();
        bbox = {
          page: pageNum,
          x0: Math.max(0, (selRect.left - pageRect.left) / pageRect.width),
          top: Math.max(0, (selRect.top - pageRect.top) / pageRect.height),
          x1: Math.min(1, (selRect.right - pageRect.left) / pageRect.width),
          bottom: Math.min(1, (selRect.bottom - pageRect.top) / pageRect.height),
        };
      }
    }

    setTextoSeleccionado(txt);
    setBboxCapturado(bbox);
    setAutoDeteccion([]);
  }, [campoActivo, polizaActiva]);

  // ── Guardar selección ──────────────────────────────────────────────────────
  async function handleGuardarSeleccion() {
    if (!polizaActiva || !campoActivo || !textoSeleccionado) return;
    const res = await guardarSeleccion({
      poliza_id: polizaActiva.id,
      nombre_campo: campoActivo,
      texto_seleccionado: textoSeleccionado,
      bbox: bboxCapturado,
      es_auto: false,
    });
    // Actualizar mapa local
    setSelecciones((prev) => ({
      ...prev,
      [campoActivo]: {
        ...(prev[campoActivo] ?? {}),
        [polizaActiva.id]: res.seleccion,
      },
    }));
    // Actualizar contador en la lista de pólizas
    setPolizas((prev) =>
      prev.map((p) =>
        p.id === polizaActiva.id
          ? { ...p, num_selecciones: p.num_selecciones + (selecciones[campoActivo]?.[polizaActiva.id] ? 0 : 1) }
          : p
      )
    );
    setAutoDeteccion(res.auto_deteccion ?? []);
    setTextoSeleccionado('');
    setBboxCapturado(null);
  }

  // ── Generar regex ──────────────────────────────────────────────────────────
  async function handleGenerarRegex(nombreCampo: string) {
    const campoObj = campos.find((c) => c.nombre === nombreCampo);
    setGenerando(nombreCampo);
    setErrorMsg(null);
    try {
      const res = await generarRegexLote(Number(selSubramo), nombreCampo, campoObj?.label ?? nombreCampo);
      setResultados((prev) => ({ ...prev, [nombreCampo]: res }));
      setRegexEditado((prev) => ({ ...prev, [nombreCampo]: res.patron_regex }));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al generar regex');
    } finally {
      setGenerando(null);
    }
  }

  // ── Reintentar con regex editado ───────────────────────────────────────────
  async function handleProbarRegex(nombreCampo: string) {
    const patron = regexEditado[nombreCampo];
    if (!patron) return;
    setProbando(nombreCampo);
    try {
      const res = await probarRegexLote(Number(selSubramo), nombreCampo, patron);
      setResultados((prev) => ({
        ...prev,
        [nombreCampo]: { ...prev[nombreCampo], ...res, patron_regex: patron },
      }));
    } finally {
      setProbando(null);
    }
  }

  // ── Guardar regla ──────────────────────────────────────────────────────────
  async function handleGuardarRegla(nombreCampo: string) {
    const resultado = resultados[nombreCampo];
    const patron = regexEditado[nombreCampo];
    if (!resultado || !patron) return;
    setGuardando(nombreCampo);
    try {
      await guardarReglaLote(Number(selSubramo), {
        nombre_campo: nombreCampo,
        patron_regex: patron,
        cobertura_lote: resultado.cobertura,
        total_lote: resultado.total,
        confianza: resultado.confianza,
      });
      // Refrescar estado
      const estado = await getEstadoLote(Number(selSubramo));
      setReglas(estado.reglas);
      setResultados((prev) => { const n = { ...prev }; delete n[nombreCampo]; return n; });
    } finally {
      setGuardando(null);
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const camposConRegla = new Set(Object.keys(reglas));
  const camposValorFijo = new Set(campos.filter((c) => c.valor_fijo !== null).map((c) => c.nombre));
  const camposOrdenados = [...campos].sort((a, b) => {
    const aOk = camposConRegla.has(a.nombre) || camposValorFijo.has(a.nombre);
    const bOk = camposConRegla.has(b.nombre) || camposValorFijo.has(b.nombre);
    if (aOk !== bOk) return aOk ? -1 : 1;
    return a.orden - b.orden;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Entrenamiento de Reglas</h1>
          <p className="text-xs text-gray-400">Sube pólizas, selecciona valores, genera regex que funcionen en todo el lote</p>
        </div>

        {/* Detectar módulo */}
        <div className="ml-auto flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleDetectarPDF} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={detectando}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <ScanSearch className="w-3.5 h-3.5" />
            {detectando ? 'Analizando…' : 'Detectar con PDF'}
          </button>
          {detectMsg && (
            <span className={`text-xs font-medium ${detectMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {detectMsg.ok ? '✓' : '✕'} {detectMsg.texto}
            </span>
          )}
        </div>
      </div>

      {/* ── Selector compañía / ramo / subramo ── */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex gap-3">
        <select value={selCompania} onChange={(e) => setSelCompania(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Compañía…</option>
          {companias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={selRamo} onChange={(e) => setSelRamo(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Ramo…</option>
          {ramos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <select value={selSubramo} onChange={(e) => setSelSubramo(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Subramo…</option>
          {subramos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>

      {!selSubramo ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecciona Compañía → Ramo → Subramo para empezar</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* ══ Panel izquierdo: Lote de pólizas ══ */}
          <div className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Lote de pólizas
              </span>
              <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded-full">
                {polizas.length} / 5
              </span>
            </div>

            {/* Upload */}
            <div className="p-3 border-b border-gray-100">
              <input
                ref={loteInputRef} type="file" accept=".pdf" multiple className="hidden"
                onChange={handleSubirPolizas}
              />
              <button
                onClick={() => loteInputRef.current?.click()}
                disabled={subiendo}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 rounded-lg text-xs font-medium text-gray-600 hover:text-blue-600 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                {subiendo ? 'Subiendo…' : 'Agregar PDFs'}
              </button>
            </div>

            {/* Lista de pólizas */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {polizas.length === 0 && (
                <div className="p-4 text-center text-xs text-gray-400">
                  Sin pólizas. Agrega al menos una para empezar.
                </div>
              )}
              {polizas.map((p, idx) => {
                const selCount = Object.values(selecciones).filter((m) => m[p.id]).length;
                const totalCampos = campos.filter((c) => !c.valor_fijo).length;
                return (
                  <div
                    key={p.id}
                    onClick={() => setPolizaIdx(idx)}
                    className={`px-3 py-2.5 cursor-pointer transition-colors flex items-start gap-2 ${
                      idx === polizaIdx ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate leading-tight">
                        {p.nombre_archivo}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-gray-400">
                          {p.paginas ? `${p.paginas} págs.` : '–'}
                        </span>
                        <span className={`text-[10px] font-medium ${
                          selCount === totalCampos && totalCampos > 0
                            ? 'text-emerald-600' : 'text-gray-400'
                        }`}>
                          {selCount}/{totalCampos} campos
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEliminarPoliza(p.id); }}
                      className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors mt-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══ Centro: Visor PDF ══ */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Barra de navegación del visor */}
            {polizaActiva && (
              <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-3">
                <button
                  onClick={() => setPolizaIdx((i) => Math.max(0, i - 1))}
                  disabled={polizaIdx === 0}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-gray-700 flex-1 text-center truncate">
                  {polizaActiva.nombre_archivo}
                  <span className="text-gray-400 ml-2">({polizaIdx + 1} / {polizas.length})</span>
                </span>
                <button
                  onClick={() => setPolizaIdx((i) => Math.min(polizas.length - 1, i + 1))}
                  disabled={polizaIdx === polizas.length - 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Campo activo badge */}
                {campoActivo && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                    <MousePointer2 className="w-3 h-3" />
                    Seleccionando: {campos.find((c) => c.nombre === campoActivo)?.label ?? campoActivo}
                  </div>
                )}
              </div>
            )}

            {/* Visor PDF */}
            <div
              ref={containerRef}
              className="flex-1 overflow-y-auto bg-gray-200 relative"
              onMouseUp={polizaActiva ? handleSeleccion : undefined}
            >
              {!polizaActiva ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Agrega pólizas al lote para empezar
                </div>
              ) : (
                <PdfVisor url={pdfUrl!} width={pageWidth} />
              )}
            </div>

            {/* Panel de selección capturada */}
            {polizaActiva && campoActivo && (
              <div className="bg-white border-t border-gray-200 px-4 py-3 space-y-2">
                {textoSeleccionado ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-blue-600 uppercase">Capturado</span>
                      <code className="flex-1 text-sm font-mono font-bold text-blue-900 truncate">
                        "{textoSeleccionado}"
                      </code>
                      {bboxCapturado && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                          📍 p.{bboxCapturado.page}
                        </span>
                      )}
                      <button
                        onClick={() => { setTextoSeleccionado(''); setBboxCapturado(null); }}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                      >✕</button>
                    </div>
                    <button
                      onClick={handleGuardarSeleccion}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Guardar selección para "{campos.find((c) => c.nombre === campoActivo)?.label}"
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-1">
                    Arrastra para seleccionar el valor de <strong>{campos.find((c) => c.nombre === campoActivo)?.label}</strong> en el PDF
                  </p>
                )}

                {/* Auto-detección en otras pólizas */}
                {autoDeteccion.length > 0 && (
                  <div className="mt-1 space-y-1">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Búsqueda automática en las demás pólizas
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {autoDeteccion.map((ad) => (
                        <span
                          key={ad.poliza_id}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            ad.encontrado
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {ad.encontrado ? '✓' : '?'} {ad.nombre_archivo.substring(0, 20)}
                          {ad.texto_encontrado ? `: "${ad.texto_encontrado.substring(0, 15)}"` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ Panel derecho: Campos ══ */}
          <div className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Campos</span>
              <span className="text-[10px] text-gray-400">
                {camposConRegla.size + camposValorFijo.size}/{campos.length} cubiertos
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {camposOrdenados.map((campo) => {
                const tieneRegla = camposConRegla.has(campo.nombre);
                const esValorFijo = camposValorFijo.has(campo.nombre);
                const esActivo = campoActivo === campo.nombre;
                const sels = selecciones[campo.nombre] ?? {};
                const numSels = Object.keys(sels).length;
                const tieneResultado = !!resultados[campo.nombre];

                return (
                  <div key={campo.id}>
                    {/* Fila del campo */}
                    <div
                      onClick={() => !esValorFijo && setCampoActivo(campo.nombre === campoActivo ? '' : campo.nombre)}
                      className={`px-4 py-2.5 border-b border-gray-50 transition-colors ${
                        esValorFijo ? 'opacity-60 cursor-default' :
                        esActivo ? 'bg-blue-50 border-l-2 border-blue-500 cursor-pointer' :
                        'hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{campo.label}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{campo.nombre}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          {tieneRegla && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              {reglas[campo.nombre]?.cobertura_lote != null
                                ? `${reglas[campo.nombre].cobertura_lote}/${reglas[campo.nombre].total_lote}`
                                : 'OK'}
                            </span>
                          )}
                          {esValorFijo && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                              🔒 {campo.valor_fijo}
                            </span>
                          )}
                          {!tieneRegla && !esValorFijo && numSels > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">
                              {numSels} sel.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mini-matrix de selecciones por póliza */}
                      {!esValorFijo && polizas.length > 0 && (
                        <div className="flex gap-0.5 mt-1.5">
                          {polizas.map((p, i) => {
                            const sel = sels[p.id];
                            return (
                              <div
                                key={p.id}
                                title={sel ? `"${sel.texto_seleccionado}"` : p.nombre_archivo}
                                className={`flex-1 h-1.5 rounded-full ${
                                  sel ? (sel.es_auto ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-gray-200'
                                }`}
                              />
                            );
                          })}
                          {Array.from({ length: Math.max(0, 5 - polizas.length) }).map((_, i) => (
                            <div key={`empty-${i}`} className="flex-1 h-1.5 rounded-full bg-gray-100" />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Expandido: generar regex para este campo */}
                    {esActivo && !esValorFijo && (
                      <div className="bg-blue-50 border-b border-blue-100 px-4 py-3 space-y-2">
                        {/* Selecciones guardadas */}
                        {numSels > 0 && (
                          <div className="space-y-1">
                            {polizas.map((p) => {
                              const sel = sels[p.id];
                              if (!sel) return (
                                <div key={p.id} className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                  <div className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
                                  {p.nombre_archivo.substring(0, 25)} — pendiente
                                </div>
                              );
                              return (
                                <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sel.es_auto ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                                  <span className="text-gray-600 truncate">{p.nombre_archivo.substring(0, 20)}</span>
                                  <code className="font-mono text-blue-700 truncate flex-1">"{sel.texto_seleccionado.substring(0, 20)}"</code>
                                  {sel.es_auto && <span className="text-amber-600 flex-shrink-0">auto</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Botón generar regex */}
                        {numSels > 0 && (
                          <button
                            onClick={() => handleGenerarRegex(campo.nombre)}
                            disabled={!!generando}
                            className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
                          >
                            {generando === campo.nombre
                              ? <><SpinIcon />Generando…</>
                              : <><Sparkles className="w-3.5 h-3.5" />{numSels === 1 ? 'Generar regex (1 ejemplo)' : `Generar regex (${numSels} ejemplos)`}</>
                            }
                          </button>
                        )}

                        {numSels === 0 && (
                          <p className="text-[10px] text-blue-600 text-center">
                            Selecciona el valor en el PDF de la izquierda
                          </p>
                        )}

                        {/* Resultado del regex */}
                        {tieneResultado && (
                          <ResultadoPanel
                            campo={campo.nombre}
                            resultado={resultados[campo.nombre]}
                            regexEditado={regexEditado[campo.nombre] ?? ''}
                            probando={probando === campo.nombre}
                            guardando={guardando === campo.nombre}
                            onChangeRegex={(v) => setRegexEditado((p) => ({ ...p, [campo.nombre]: v }))}
                            onProbar={() => handleProbarRegex(campo.nombre)}
                            onGuardar={() => handleGuardarRegla(campo.nombre)}
                          />
                        )}

                        {errorMsg && generando === null && (
                          <div className="flex items-center gap-1.5 p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            {errorMsg}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function PdfVisor({ url, width }: { url: string; width: number }) {
  const [numPages, setNumPages] = useState(0);
  const [cargando, setCargando] = useState(true);

  return (
    <div className="relative select-text">
      {cargando && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-10">
          <span className="text-sm text-gray-500 bg-white px-3 py-2 rounded-lg shadow-sm">Cargando PDF…</span>
        </div>
      )}
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => { setNumPages(numPages); setCargando(false); }}
        onLoadError={() => setCargando(false)}
        loading={null}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div key={i + 1} className={i < numPages - 1 ? 'mb-1' : ''}>
            <Page
              pageNumber={i + 1}
              width={width || 520}
              renderTextLayer
              renderAnnotationLayer={false}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}

function ResultadoPanel({
  campo, resultado, regexEditado, probando, guardando,
  onChangeRegex, onProbar, onGuardar,
}: {
  campo: string;
  resultado: ResultadoRegexLote;
  regexEditado: string;
  probando: boolean;
  guardando: boolean;
  onChangeRegex: (v: string) => void;
  onProbar: () => void;
  onGuardar: () => void;
}) {
  const pasaLote = resultado.pasa_lote;
  const encontrados = resultado.cobertura;
  const total = resultado.total;

  return (
    <div className="space-y-2 pt-1">
      {/* Regex editable */}
      <div>
        <label className="text-[10px] font-semibold text-purple-700 uppercase">Regex (editable)</label>
        <input
          value={regexEditado}
          onChange={(e) => onChangeRegex(e.target.value)}
          className="mt-0.5 w-full border border-purple-200 bg-white rounded-lg px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-purple-400"
        />
      </div>

      {/* Explicación */}
      <p className="text-[10px] text-purple-800 leading-relaxed">{resultado.explicacion}</p>

      {/* Matriz de resultados */}
      <div className="space-y-0.5">
        {resultado.matches.map((m) => (
          <div key={m.poliza_id} className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${
            m.encontrado ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}>
            {m.encontrado
              ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
              : <XCircle className="w-3 h-3 flex-shrink-0" />
            }
            <span className="truncate flex-1">{m.nombre_archivo.substring(0, 22)}</span>
            {m.encontrado && (
              <code className="font-mono truncate max-w-[80px]">"{m.valor_extraido}"</code>
            )}
          </div>
        ))}
      </div>

      {/* Cobertura */}
      <div className={`text-center text-[10px] font-semibold py-1 rounded-lg ${
        pasaLote ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}>
        {pasaLote
          ? `✓ Pasa en todas las pólizas (${encontrados}/${total})`
          : `⚠ Falla en ${total - encontrados} de ${total} pólizas`
        }
      </div>

      {/* Acciones */}
      <div className="flex gap-1.5">
        <button
          onClick={onProbar}
          disabled={probando}
          className="flex-1 py-1.5 border border-gray-300 hover:bg-gray-50 rounded-lg text-[10px] font-medium text-gray-700 disabled:opacity-40 inline-flex items-center justify-center gap-1"
        >
          {probando ? <SpinIcon /> : <RefreshCw className="w-3 h-3" />}
          Reintentar
        </button>
        <button
          onClick={onGuardar}
          disabled={guardando || !pasaLote}
          title={!pasaLote ? 'La regla debe pasar en todas las pólizas del lote' : ''}
          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-[10px] font-semibold disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
        >
          {guardando ? <SpinIcon /> : <Save className="w-3 h-3" />}
          {pasaLote ? 'Guardar regla' : 'No pasa el lote'}
        </button>
      </div>
    </div>
  );
}

function SpinIcon() {
  return (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
