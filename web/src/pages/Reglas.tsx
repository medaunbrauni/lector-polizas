import { useEffect, useRef, useState, useCallback } from 'react';
import Clasificador from '../components/reglas/Clasificador';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  getCompanias, getRamos, getSubramos, getCampos,
  identificarModulo,
  subirPolizasEntrenamiento, eliminarPolizaEntrenamiento,
  urlPdfEntrenamiento, urlImagenPagina, getTextoPdf,
  guardarSeleccion,
  getEstadoLote, generarRegexLote, probarRegexLote, guardarReglaLote,
  probarDeteccion, generarYGuardarPatrones,
  patchPatrones,
} from '../lib/api';
import type {
  Compania, Ramo, Subramo, Campo,
  PolizaEntrenamiento, MapaSelecciones, ResultadoRegexLote, AutoDeteccion, BBox,
  ResultadoDeteccion, PatronesGenerados, NivelConfianza,
} from '../lib/types';
import {
  Upload, Trash2, ChevronLeft, ChevronRight, ScanSearch,
  Zap, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  FileText, MousePointer2, Sparkles, Save, Image,
  Target, ChevronDown, ChevronUp, Shield, ShieldAlert, ShieldCheck, ShieldOff,
  ZoomIn, ZoomOut, RotateCcw,
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

  // ── Modo imagen / OCR ──────────────────────────────────────────────────────
  const [modoImagen, setModoImagen] = useState(false);
  const [paginaImagen, setPaginaImagen] = useState(1);
  const [textoPdfActivo, setTextoPdfActivo] = useState('');
  const [mostrarTexto, setMostrarTexto] = useState(false);
  // Bbox dibujado manualmente sobre la imagen
  const [ocrBboxDibujando, setOcrBboxDibujando] = useState(false);
  const [ocrBboxStart, setOcrBboxStart] = useState<{x: number; y: number} | null>(null);
  const [ocrBbox, setOcrBbox] = useState<{x0: number; y0: number; x1: number; y1: number; page: number} | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loteInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(520);

  // ── Tab activo ─────────────────────────────────────────────────────────────
  const [tabActivo, setTabActivo] = useState<'reglas' | 'clasificador'>('reglas');

  // ── Paneles redimensionables ─────────────────────────────────────────────────
  const [anchoIzquierdo, setAnchoIzquierdo] = useState<number>(
    Number(localStorage.getItem('reglas-ancho-izq')) || 256
  );
  const [anchoDerecho, setAnchoDerecho] = useState<number>(
    Number(localStorage.getItem('reglas-ancho-der')) || 320
  );
  const [redimensionando, setRedimensionando] = useState<'izq' | 'der' | null>(null);
  const filaPanelesRef = useRef<HTMLDivElement>(null);
  const anchoActualRef = useRef({ izq: anchoIzquierdo, der: anchoDerecho });

  useEffect(() => {
    if (!redimensionando) return;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (e: MouseEvent) => {
      const rect = filaPanelesRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (redimensionando === 'izq') {
        const nuevo = Math.min(500, Math.max(180, e.clientX - rect.left));
        anchoActualRef.current.izq = nuevo;
        setAnchoIzquierdo(nuevo);
      } else {
        const nuevo = Math.min(600, Math.max(240, rect.right - e.clientX));
        anchoActualRef.current.der = nuevo;
        setAnchoDerecho(nuevo);
      }
    };

    const onMouseUp = () => {
      setRedimensionando(null);
      localStorage.setItem('reglas-ancho-izq', String(anchoActualRef.current.izq));
      localStorage.setItem('reglas-ancho-der', String(anchoActualRef.current.der));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redimensionando]);

  // ── Alto del panel de texto extraído (redimensionable verticalmente) ────────
  const [altoTextoExtraido, setAltoTextoExtraido] = useState<number>(
    Number(localStorage.getItem('reglas-alto-texto')) || 240
  );
  const [redimensionandoAlto, setRedimensionandoAlto] = useState(false);
  const altoDragRef = useRef({ startY: 0, startAlto: altoTextoExtraido });
  const altoActualRef = useRef(altoTextoExtraido);

  useEffect(() => {
    if (!redimensionandoAlto) return;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const onMouseMove = (e: MouseEvent) => {
      const delta = altoDragRef.current.startY - e.clientY; // arrastrar hacia arriba = crecer
      const nuevo = Math.min(600, Math.max(100, altoDragRef.current.startAlto + delta));
      altoActualRef.current = nuevo;
      setAltoTextoExtraido(nuevo);
    };

    const onMouseUp = () => {
      setRedimensionandoAlto(false);
      localStorage.setItem('reglas-alto-texto', String(altoActualRef.current));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redimensionandoAlto]);

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

  // Cargar texto extraído cuando cambia la póliza activa
  useEffect(() => {
    if (!polizaActiva) { setTextoPdfActivo(''); return; }
    getTextoPdf(polizaActiva.id)
      .then(setTextoPdfActivo)
      .catch(() => setTextoPdfActivo(''));
  }, [polizaActiva?.id]);

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

  // ── Estado panel detección ────────────────────────────────────────────────
  const [panelDeteccionAbierto, setPanelDeteccionAbierto] = useState(false);
  const [deteccionActual, setDeteccionActual] = useState<ResultadoDeteccion | null>(null);
  const [probandoDeteccion, setProbandoDeteccion] = useState(false);
  const [generandoPatrones, setGenerandoPatrones] = useState(false);
  const [patronesPreview, setPatronesPreview] = useState<PatronesGenerados | null>(null);
  const [patronesEditados, setPatronesEditados] = useState<{compania: string[]; ramo: string[]; subramo: string[]}>({compania:[], ramo:[], subramo:[]});
  const [guardandoPatrones, setGuardandoPatrones] = useState(false);
  const [msgPatrones, setMsgPatrones] = useState<{ok: boolean; texto: string} | null>(null);

  // Auto-probar detección cuando cambia subramo y hay pólizas
  useEffect(() => {
    if (!selSubramo || polizas.length === 0) { setDeteccionActual(null); return; }
    const p = polizas[0];
    if (!p) return;
    getTextoPdf(p.id).then((texto) => {
      if (texto) probarDeteccion(texto).then(setDeteccionActual).catch(() => {});
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSubramo, polizas.length]);

  async function handleProbarDeteccion() {
    if (!polizaActiva) return;
    setProbandoDeteccion(true);
    try {
      const texto = await getTextoPdf(polizaActiva.id);
      const res = await probarDeteccion(texto);
      setDeteccionActual(res);
    } finally {
      setProbandoDeteccion(false);
    }
  }

  async function handleGenerarPatrones() {
    if (!polizaActiva || !selSubramo) return;
    setGenerandoPatrones(true);
    setMsgPatrones(null);
    try {
      const texto = await getTextoPdf(polizaActiva.id);
      const res = await generarYGuardarPatrones(Number(selSubramo), texto, false); // preview first
      setPatronesPreview(res);
      setPatronesEditados({ compania: res.compania, ramo: res.ramo, subramo: res.subramo });
    } catch (e) {
      setMsgPatrones({ ok: false, texto: e instanceof Error ? e.message : 'Error' });
    } finally {
      setGenerandoPatrones(false);
    }
  }

  async function handleGuardarPatrones() {
    if (!patronesPreview || !selSubramo) return;
    setGuardandoPatrones(true);
    setMsgPatrones(null);
    try {
      // Guardar nivel por nivel con los valores editados
      await Promise.all([
        patchPatrones('companias', patronesPreview.compania_id, patronesEditados.compania),
        patchPatrones('ramos',     patronesPreview.ramo_id,     patronesEditados.ramo),
        patchPatrones('subramos',  patronesPreview.subramo_id,  patronesEditados.subramo),
      ]);
      setMsgPatrones({ ok: true, texto: 'Patrones guardados. Probando…' });
      // Re-probar
      if (polizaActiva) {
        const texto = await getTextoPdf(polizaActiva.id);
        const res = await probarDeteccion(texto);
        setDeteccionActual(res);
      }
      setPatronesPreview(null);
    } catch (e) {
      setMsgPatrones({ ok: false, texto: e instanceof Error ? e.message : 'Error al guardar' });
    } finally {
      setGuardandoPatrones(false);
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
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">

      {/* ── Header ── */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Reglas</h1>
          <p className="text-xs text-gray-400">
            {tabActivo === 'clasificador'
              ? 'Sube pólizas, clasifícalas con IA y envíalas al entrenamiento automáticamente'
              : 'Sube pólizas, selecciona valores, genera regex que funcionen en todo el lote'}
          </p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTabActivo('clasificador')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tabActivo === 'clasificador'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Clasificador
          </button>
          <button
            onClick={() => setTabActivo('reglas')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tabActivo === 'reglas'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Entrenamiento
          </button>
        </div>

        {/* Detectar módulo (solo en tab Entrenamiento) */}
        {tabActivo === 'reglas' && (
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
        )}
      </div>

      {/* ── Tab Clasificador ── */}
      {tabActivo === 'clasificador' && (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Clasificador companias={companias} />
        </div>
      )}

      {/* ── Tab Entrenamiento ── */}
      {tabActivo === 'reglas' && (<>

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

      {/* ── Panel de Detección Automática ── */}
      {selSubramo && (
        <PanelDeteccion
          abierto={panelDeteccionAbierto}
          onToggle={() => setPanelDeteccionAbierto((v) => !v)}
          deteccion={deteccionActual}
          probando={probandoDeteccion}
          generando={generandoPatrones}
          guardando={guardandoPatrones}
          preview={patronesPreview}
          patronesEditados={patronesEditados}
          onPatronesChange={setPatronesEditados}
          onProbar={handleProbarDeteccion}
          onGenerar={handleGenerarPatrones}
          onGuardar={handleGuardarPatrones}
          onCancelarPreview={() => setPatronesPreview(null)}
          msgPatrones={msgPatrones}
          hayPolizas={polizas.length > 0}
          companiaNombre={companias.find((c) => c.id === Number(selCompania))?.nombre}
          ramoNombre={ramos.find((r) => r.id === Number(selRamo))?.nombre}
          subramoNombre={subramos.find((s) => s.id === Number(selSubramo))?.nombre}
        />
      )}

      {!selSubramo ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecciona Compañía → Ramo → Subramo para empezar</p>
          </div>
        </div>
      ) : (
        <div ref={filaPanelesRef} className="flex flex-1 min-h-0 overflow-hidden">

          {/* ══ Panel izquierdo: Lote de pólizas ══ */}
          <div style={{ width: anchoIzquierdo }} className="flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
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

          {/* Handle de arrastre — panel izquierdo */}
          <div
            onMouseDown={() => setRedimensionando('izq')}
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors"
          />

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

                {/* Toggle PDF texto / Imagen */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                  <button
                    onClick={() => setModoImagen(false)}
                    className={`px-2.5 py-1 flex items-center gap-1 transition-colors ${!modoImagen ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <FileText className="w-3 h-3" />PDF
                  </button>
                  <button
                    onClick={() => setModoImagen(true)}
                    className={`px-2.5 py-1 flex items-center gap-1 transition-colors ${modoImagen ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <Image className="w-3 h-3" />Imagen
                  </button>
                </div>

                {/* Toggle texto extraído */}
                <button
                  onClick={() => setMostrarTexto((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors border ${mostrarTexto ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  <FileText className="w-3 h-3" />
                  Texto extraído
                </button>

                {/* Campo activo badge */}
                {campoActivo && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                    <MousePointer2 className="w-3 h-3" />
                    {campos.find((c) => c.nombre === campoActivo)?.label ?? campoActivo}
                  </div>
                )}
              </div>
            )}

            {/* Visor principal — flex-1 para ocupar espacio restante */}
            <div
              ref={containerRef}
              className="flex-1 min-h-0 relative overflow-hidden"
              onMouseUp={(!modoImagen && polizaActiva) ? handleSeleccion : undefined}
            >
              {!polizaActiva ? (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm bg-gray-200">
                  Agrega pólizas al lote para empezar
                </div>
              ) : modoImagen ? (
                <div className="absolute inset-0 overflow-y-auto bg-gray-200">
                  <VisorImagen
                    polizaId={polizaActiva.id}
                    page={paginaImagen}
                    totalPages={polizaActiva.paginas ?? 1}
                    onPageChange={setPaginaImagen}
                    ocrBbox={ocrBbox}
                    onBboxChange={setOcrBbox}
                    campoActivo={campoActivo}
                  />
                </div>
              ) : (
                <PdfVisor url={pdfUrl!} width={pageWidth} />
              )}
            </div>

            {/* Panel texto extraído — debajo del visor, alto ajustable */}
            {mostrarTexto && polizaActiva && (
              <>
                {/* Handle de arrastre — alto del panel de texto extraído */}
                <div
                  onMouseDown={(e) => {
                    altoDragRef.current = { startY: e.clientY, startAlto: altoTextoExtraido };
                    setRedimensionandoAlto(true);
                  }}
                  className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-400 active:bg-blue-500 transition-colors"
                />
                <div className="border-t border-gray-200 bg-white flex-shrink-0">
                <TextoExtraido
                  texto={textoPdfActivo}
                  highlight={textoSeleccionado}
                  alto={altoTextoExtraido}
                  onCapturarTexto={(texto) => {
                    setTextoSeleccionado(texto);
                    setBboxCapturado(null); // no hay bbox porque no viene del PDF visual
                  }}
                />
                </div>
              </>
            )}

            {/* Botón guardar selección — SIEMPRE visible cuando hay campo activo */}
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

          {/* Handle de arrastre — panel derecho */}
          <div
            onMouseDown={() => setRedimensionando('der')}
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors"
          />

          {/* ══ Panel derecho: Campos ══ */}
          <div style={{ width: anchoDerecho }} className="flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
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
                  <div key={`${campo.es_global ? 'g' : 'e'}-${campo.id}`}>
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
    </>)} {/* fin tab Entrenamiento */}

    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

// ── Visor de imagen (modo OCR) ─────────────────────────────────────────────────

function VisorImagen({
  polizaId, page, totalPages, onPageChange, ocrBbox, onBboxChange, campoActivo,
}: {
  polizaId: number; page: number; totalPages: number;
  onPageChange: (p: number) => void;
  ocrBbox: { x0: number; y0: number; x1: number; y1: number; page: number } | null;
  onBboxChange: (b: { x0: number; y0: number; x1: number; y1: number; page: number } | null) => void;
  campoActivo: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [startPt, setStartPt] = useState<{x: number; y: number} | null>(null);
  const [rect, setRect] = useState<{x: number; y: number; w: number; h: number} | null>(null);
  const imgUrl = urlImagenPagina(polizaId, page);

  // Resetear cuando cambia página o póliza
  useEffect(() => {
    setImgLoaded(false);
    setRect(null);
  }, [polizaId, page]);

  // Sincronizar canvas con imagen
  function syncCanvas() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
  }

  function handleImgLoad() {
    syncCanvas();
    setImgLoaded(true);
  }

  // Redibujar rect cuando cambia o imagen carga
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgLoaded) return;
    syncCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (rect) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = 'rgba(37,99,235,0.10)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }, [rect, imgLoaded]);

  function getPt(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!campoActivo) return;
    const pt = getPt(e);
    setStartPt(pt);
    setDragging(true);
    setRect(null);
    onBboxChange(null);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging || !startPt) return;
    const pt = getPt(e);
    setRect({ x: Math.min(startPt.x, pt.x), y: Math.min(startPt.y, pt.y), w: Math.abs(pt.x - startPt.x), h: Math.abs(pt.y - startPt.y) });
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging || !startPt || !imgRef.current) return;
    setDragging(false);
    const pt = getPt(e);
    const iw = imgRef.current.offsetWidth;
    const ih = imgRef.current.offsetHeight;
    if (!iw || !ih) return;
    const x0 = Math.min(startPt.x, pt.x) / iw;
    const y0 = Math.min(startPt.y, pt.y) / ih;
    const x1 = Math.max(startPt.x, pt.x) / iw;
    const y1 = Math.max(startPt.y, pt.y) / ih;
    if (x1 - x0 > 0.01 && y1 - y0 > 0.01) {
      onBboxChange({ x0, y0, x1, y1, page });
    }
  }

  return (
    <div className="flex flex-col items-center py-2 gap-2">
      {/* Navegación de página */}
      <div className="flex items-center gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1 shadow-sm">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="disabled:opacity-30 hover:text-blue-600">‹</button>
        <span>Página {page} / {totalPages}</span>
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="disabled:opacity-30 hover:text-blue-600">›</button>
      </div>

      {!campoActivo && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
          Elige un campo en el panel derecho para empezar a dibujar el área
        </div>
      )}
      {campoActivo && (
        <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1">
          Arrastra para marcar el área donde aparece el valor
          {ocrBbox && <span className="ml-2 font-semibold text-emerald-600">✓ Área capturada</span>}
        </div>
      )}

      {/* Spinner mientras carga */}
      {!imgLoaded && (
        <div className="text-xs text-gray-400 py-4">Cargando imagen…</div>
      )}

      {/* Imagen con canvas superpuesto */}
      <div className={`relative inline-block shadow-md rounded overflow-hidden ${!imgLoaded ? 'opacity-0 h-0' : ''}`}>
        <img
          ref={imgRef}
          src={imgUrl}
          alt={`Página ${page}`}
          onLoad={handleImgLoad}
          className="block max-w-full"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${campoActivo ? 'cursor-crosshair' : 'cursor-default'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </div>
    </div>
  );
}

// ── Panel de texto extraído con highlight ─────────────────────────────────────

function TextoExtraido({
  texto, highlight, alto = 384, onCapturarTexto,
}: {
  texto: string;
  highlight: string;
  alto?: number;
  onCapturarTexto?: (texto: string) => void;
}) {
  const [zoomTexto, setZoomTexto] = useState(100);

  if (!texto) {
    return (
      <div className="px-4 py-3 text-xs text-gray-400 italic">Sin texto extraído disponible para esta póliza.</div>
    );
  }

  const lineas = texto.split('\n');

  // ── Ubicar la línea que contiene el highlight (primera coincidencia) ────────
  let lineaHighlightIdx = -1;
  let localIdx = -1;
  if (highlight) {
    lineaHighlightIdx = lineas.findIndex((l) => l.includes(highlight));
    if (lineaHighlightIdx !== -1) {
      localIdx = lineas[lineaHighlightIdx].indexOf(highlight);
    } else {
      const hlLower = highlight.toLowerCase();
      lineaHighlightIdx = lineas.findIndex((l) => l.toLowerCase().includes(hlLower));
      if (lineaHighlightIdx !== -1) {
        localIdx = lineas[lineaHighlightIdx].toLowerCase().indexOf(hlLower);
      }
    }
  }
  const encontrado = lineaHighlightIdx !== -1;

  let header: React.ReactNode;
  if (!highlight) {
    header = <span className="text-gray-400">Selecciona texto en el PDF o aquí abajo ↓</span>;
  } else if (encontrado) {
    header = (
      <span className="font-medium px-2 py-0.5 rounded-full flex items-center gap-1 bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" />Encontrado — el regex lo capturará
      </span>
    );
  } else {
    header = (
      <span className="font-medium px-2 py-0.5 rounded-full flex items-center gap-1 bg-amber-100 text-amber-700">
        <AlertCircle className="w-3 h-3" />No encontrado en el texto extraído
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50 border-b border-gray-100">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
          <FileText className="w-3 h-3" />Texto extraído · validación
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px]">{header}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setZoomTexto((z) => Math.max(60, z - 10))}
              title="Disminuir tamaño de texto"
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-gray-400 w-8 text-center select-none">{zoomTexto}%</span>
            <button
              type="button"
              onClick={() => setZoomTexto((z) => Math.min(200, z + 10))}
              title="Aumentar tamaño de texto"
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setZoomTexto(100)}
              title="Restaurar tamaño de texto"
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      <div
        style={{ height: alto, fontSize: `${(10 * zoomTexto) / 100}px` }}
        className="overflow-y-auto font-mono leading-relaxed"
        onMouseUp={() => {
          const seleccion = window.getSelection()?.toString().trim();
          if (seleccion) onCapturarTexto?.(seleccion);
        }}
      >
        {lineas.map((linea, i) => {
          const numero = i + 1;
          const tieneHighlightAqui = i === lineaHighlightIdx;

          return (
            <div
              key={i}
              className="grid grid-cols-[2.5rem_1fr] hover:bg-gray-50"
            >
              <span className="select-none text-right pr-2 text-gray-400 border-r border-gray-100">
                {numero}
              </span>
              <span className="px-2 text-gray-600 whitespace-pre-wrap break-words">
                {tieneHighlightAqui ? (
                  <>
                    {linea.substring(0, localIdx)}
                    <mark id="extracted-highlight" className="bg-yellow-300 text-gray-900 rounded-sm font-semibold not-italic">
                      {linea.substring(localIdx, localIdx + highlight.length)}
                    </mark>
                    {linea.substring(localIdx + highlight.length)}
                  </>
                ) : (
                  linea || ' '
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PdfVisor({ url, width }: { url: string; width: number }) {
  const [numPages, setNumPages] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [zoom, setZoom] = useState(1.0);

  // Al cambiar de póliza (url), volver a página 1 y resetear zoom
  useEffect(() => { setPagina(1); setCargando(true); setZoom(1.0); }, [url]);

  const zoomOut = () => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
  const zoomIn  = () => setZoom((z) => Math.min(3.0,  Math.round((z + 0.25) * 100) / 100));

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">

      {/* ── Barra de navegación + zoom ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-300 flex-shrink-0 select-none">

        {/* Páginas */}
        <button
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
          disabled={pagina <= 1 || numPages === 0}
          className="px-2 py-0.5 text-xs text-gray-600 hover:text-blue-600 disabled:opacity-30 bg-white border border-gray-200 rounded transition-colors"
        >‹</button>
        <span className="text-xs font-medium text-gray-600 tabular-nums min-w-[72px] text-center">
          {numPages > 0 ? `Pág. ${pagina} / ${numPages}` : '—'}
        </span>
        <button
          onClick={() => setPagina((p) => Math.min(numPages, p + 1))}
          disabled={pagina >= numPages || numPages === 0}
          className="px-2 py-0.5 text-xs text-gray-600 hover:text-blue-600 disabled:opacity-30 bg-white border border-gray-200 rounded transition-colors"
        >›</button>

        {/* Separador */}
        <div className="w-px h-4 bg-gray-300 mx-1" />

        {/* Zoom */}
        <button
          onClick={zoomOut}
          disabled={zoom <= 0.5}
          className="w-6 h-6 flex items-center justify-center text-sm font-bold text-gray-600 hover:text-blue-600 disabled:opacity-30 bg-white border border-gray-200 rounded transition-colors"
          title="Reducir"
        >−</button>
        <button
          onClick={() => setZoom(1.0)}
          className="text-xs font-mono font-semibold text-gray-700 hover:text-blue-600 bg-white border border-gray-200 rounded px-1.5 py-0.5 transition-colors min-w-[44px] text-center"
          title="Restablecer zoom"
        >{Math.round(zoom * 100)}%</button>
        <button
          onClick={zoomIn}
          disabled={zoom >= 3.0}
          className="w-6 h-6 flex items-center justify-center text-sm font-bold text-gray-600 hover:text-blue-600 disabled:opacity-30 bg-white border border-gray-200 rounded transition-colors"
          title="Ampliar"
        >+</button>
      </div>

      {/* ── Página actual — scroll dentro del visor ── */}
      <div className="flex-1 overflow-y-auto overflow-x-auto relative select-text bg-gray-200">
        {cargando && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-sm text-gray-500 bg-white px-3 py-2 rounded-lg shadow-sm">Cargando PDF…</span>
          </div>
        )}
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => { setNumPages(numPages); setCargando(false); }}
          onLoadError={() => setCargando(false)}
          loading={null}
        >
          <Page
            pageNumber={pagina}
            width={Math.round((width || 700) * zoom)}
            renderTextLayer
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
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

// ── Panel de Detección Automática ─────────────────────────────────────────────

const CONFIANZA_CONFIG: Record<NivelConfianza, { label: string; cls: string; icon: React.ReactNode }> = {
  alta:      { label: 'Alta',      cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  media:     { label: 'Media',     cls: 'bg-amber-50 border-amber-200 text-amber-700',       icon: <Shield className="w-3.5 h-3.5" /> },
  baja:      { label: 'Baja',      cls: 'bg-red-50 border-red-200 text-red-600',             icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  sin_datos: { label: 'Sin datos', cls: 'bg-gray-50 border-gray-200 text-gray-500',          icon: <ShieldOff className="w-3.5 h-3.5" /> },
};

function BadgeConfianza({ confianza }: { confianza: NivelConfianza }) {
  const cfg = CONFIANZA_CONFIG[confianza];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function PatronesList({
  titulo, patrones, onChange, cls,
}: {
  titulo: string;
  patrones: string[];
  onChange: (v: string[]) => void;
  cls?: string;
}) {
  return (
    <div className={`space-y-1.5 ${cls}`}>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{titulo}</p>
      {patrones.length === 0 && (
        <p className="text-[10px] text-gray-400 italic">Sin patrones</p>
      )}
      {patrones.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={p}
            onChange={(e) => { const n = [...patrones]; n[i] = e.target.value; onChange(n); }}
            className="flex-1 font-mono text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={() => onChange(patrones.filter((_, j) => j !== i))}
            className="text-gray-300 hover:text-red-500 flex-shrink-0"
          >×</button>
        </div>
      ))}
      <button
        onClick={() => onChange([...patrones, ''])}
        className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
      >+ Agregar patrón</button>
    </div>
  );
}

interface PanelDeteccionProps {
  abierto: boolean;
  onToggle: () => void;
  deteccion: ResultadoDeteccion | null;
  probando: boolean;
  generando: boolean;
  guardando: boolean;
  preview: PatronesGenerados | null;
  patronesEditados: { compania: string[]; ramo: string[]; subramo: string[] };
  onPatronesChange: (v: { compania: string[]; ramo: string[]; subramo: string[] }) => void;
  onProbar: () => void;
  onGenerar: () => void;
  onGuardar: () => void;
  onCancelarPreview: () => void;
  msgPatrones: { ok: boolean; texto: string } | null;
  hayPolizas: boolean;
  companiaNombre?: string;
  ramoNombre?: string;
  subramoNombre?: string;
}

function PanelDeteccion({
  abierto, onToggle,
  deteccion, probando, generando, guardando,
  preview, patronesEditados, onPatronesChange,
  onProbar, onGenerar, onGuardar, onCancelarPreview,
  msgPatrones, hayPolizas,
  companiaNombre, ramoNombre, subramoNombre,
}: PanelDeteccionProps) {
  const confianza = deteccion?.confianza ?? 'sin_datos';
  const alertar = confianza === 'sin_datos' || confianza === 'baja';

  return (
    <div className={`bg-white border-b flex-shrink-0 ${alertar && !abierto ? 'border-amber-200' : 'border-gray-200'}`}>
      {/* ── Cabecera colapsable ── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-left"
      >
        <Target className={`w-3.5 h-3.5 flex-shrink-0 ${alertar ? 'text-amber-500' : 'text-emerald-600'}`} />
        <span className="text-xs font-semibold text-gray-700">Detección automática</span>

        {/* Resumen en línea */}
        {deteccion ? (
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <BadgeConfianza confianza={deteccion.confianza} />
            <span>
              {deteccion.compania_nombre
                ? `${deteccion.compania_nombre} → ${deteccion.ramo_nombre ?? '?'} → ${deteccion.subramo_nombre ?? '?'}`
                : 'No detectado'}
            </span>
            <span className="text-gray-300">
              ({deteccion.score_compania}+{deteccion.score_ramo}+{deteccion.score_subramo} pts)
            </span>
          </div>
        ) : alertar ? (
          <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {hayPolizas ? 'Verificando…' : 'Agrega pólizas para probar'}
          </span>
        ) : null}

        <span className="ml-auto text-gray-400">
          {abierto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {/* ── Contenido expandido ── */}
      {abierto && (
        <div className="px-4 pb-4 space-y-4">

          {/* Alerta si la confianza es baja */}
          {alertar && deteccion && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
              <div>
                <p className="font-semibold">Detección con confianza {CONFIANZA_CONFIG[confianza].label.toLowerCase()}</p>
                <p className="text-[10px] mt-0.5 text-amber-700">
                  {confianza === 'sin_datos'
                    ? 'No hay patrones de detección configurados. Sin ellos, el sistema usará IA en cada extracción.'
                    : 'Los patrones existentes dan un score bajo. Considera generar o mejorar los patrones.'}
                </p>
              </div>
            </div>
          )}

          {/* ── Resultado de la última prueba ── */}
          {deteccion && (
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: 'Compañía', nombre: companiaNombre, detectado: deteccion.compania_nombre, score: deteccion.score_compania },
                { label: 'Ramo',     nombre: ramoNombre,     detectado: deteccion.ramo_nombre,     score: deteccion.score_ramo },
                { label: 'Subramo',  nombre: subramoNombre,  detectado: deteccion.subramo_nombre,  score: deteccion.score_subramo },
              ] as const).map(({ label, nombre, detectado, score }) => {
                const ok = detectado && nombre && detectado.toLowerCase().includes(nombre.toLowerCase().split(' ')[0]);
                return (
                  <div key={label} className={`p-2.5 rounded-lg border text-[10px] ${ok ? 'bg-emerald-50 border-emerald-200' : detectado ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="font-semibold text-gray-600 uppercase tracking-wide mb-1">{label}</p>
                    <p className={`font-medium truncate ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {detectado ?? '— no detectado'}
                    </p>
                    <p className="text-gray-400 mt-0.5">{score} pts</p>
                    {detectado && nombre && !ok && (
                      <p className="text-amber-600 mt-0.5 text-[9px]">Esperado: {nombre}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Botones de acción ── */}
          {!preview && (
            <div className="flex gap-2">
              <button
                onClick={onProbar}
                disabled={probando || !hayPolizas}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-40 rounded-lg transition-colors"
              >
                {probando ? <SpinIcon /> : <RefreshCw className="w-3 h-3" />}
                Probar con PDF activo
              </button>
              <button
                onClick={onGenerar}
                disabled={generando || !hayPolizas}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                {generando ? <SpinIcon /> : <Sparkles className="w-3 h-3" />}
                {generando ? 'Generando patrones…' : 'Generar patrones con IA'}
              </button>
            </div>
          )}

          {/* ── Preview de patrones generados ── */}
          {preview && (
            <div className="border border-purple-200 rounded-lg bg-purple-50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Patrones sugeridos por IA — revisa y edita antes de guardar
                </p>
                <button onClick={onCancelarPreview} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              </div>

              <p className="text-[10px] text-purple-700 italic">{preview.explicacion}</p>

              <div className="grid grid-cols-3 gap-3">
                <PatronesList
                  titulo="Compañía"
                  patrones={patronesEditados.compania}
                  onChange={(v) => onPatronesChange({ ...patronesEditados, compania: v })}
                />
                <PatronesList
                  titulo="Ramo"
                  patrones={patronesEditados.ramo}
                  onChange={(v) => onPatronesChange({ ...patronesEditados, ramo: v })}
                />
                <PatronesList
                  titulo="Subramo"
                  patrones={patronesEditados.subramo}
                  onChange={(v) => onPatronesChange({ ...patronesEditados, subramo: v })}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onCancelarPreview}
                  className="px-3 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                >Cancelar</button>
                <button
                  onClick={onGuardar}
                  disabled={guardando}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg transition-colors"
                >
                  {guardando ? <SpinIcon /> : <Save className="w-3 h-3" />}
                  Guardar patrones
                </button>
              </div>
            </div>
          )}

          {/* Mensaje resultado */}
          {msgPatrones && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border ${msgPatrones.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {msgPatrones.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {msgPatrones.texto}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
