import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  getCompanias, getRamos, getSubramos, getReglas, getCampos,
  crearRegla, probarRegla, getTextosDisponibles, generarRegexConIA,
  reintentarRegex, getBorradores, activarRegla, identificarModulo,
  generarPatronesDeteccion, patchPatrones,
} from '../lib/api';
import type {
  Compania, Ramo, Subramo, Regla, Campo,
  TextoDisponible, ResultadoRegexIA, BBox,
} from '../lib/types';
import {
  Zap, Plus, CheckCircle2, XCircle, Cpu, MousePointer2,
  FileText, ChevronRight, Sparkles, AlertCircle, Edit3,
  RefreshCw, Clock, ScanSearch, Radio, Save,
} from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type Tab = 'visual' | 'manual';

export default function Reglas() {
  // ── Catálogos ──────────────────────────────────────────────────────
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [subramos, setSubramos] = useState<Subramo[]>([]);
  const [campos, setCampos] = useState<Campo[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [borradores, setBorradores] = useState<Regla[]>([]);

  const [selCompania, setSelCompania] = useState('');
  const [selRamo, setSelRamo] = useState('');
  const [selSubramo, setSelSubramo] = useState('');

  // ── Constructor visual ─────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('visual');
  const [textosDisponibles, setTextosDisponibles] = useState<TextoDisponible[]>([]);
  const [selTextoId, setSelTextoId] = useState('');
  const [textoPdf, setTextoPdf] = useState('');
  const [textoSeleccionado, setTextoSeleccionado] = useState('');
  const [contextoTexto, setContextoTexto] = useState('');
  const [campoBuild, setCampoBuild] = useState('');
  const [generando, setGenerando] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [resultadoIA, setResultadoIA] = useState<ResultadoRegexIA | null>(null);
  const [regexEditado, setRegexEditado] = useState('');
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [bboxCapturado, setBboxCapturado] = useState<BBox | null>(null);
  const visorRef = useRef<HTMLPreElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAutoSelect = useRef<{ ramo_id: number; subramo_id: number } | null>(null);
  const pdfCargadoRef = useRef<{ nombre: string; texto: string } | null>(null);
  const [detectando, setDetectando] = useState(false);
  const [detectMsg, setDetectMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [detectedIds, setDetectedIds] = useState<{ compania_id: number; ramo_id: number; subramo_id: number } | null>(null);
  const [generandoPatrones, setGenerandoPatrones] = useState(false);
  const [patronesSugeridos, setPatronesSugeridos] = useState<{
    compania: string[]; ramo: string[]; subramo: string[]; explicacion: string;
    compania_id: number; ramo_id: number; subramo_id: number;
  } | null>(null);
  const [patronesGuardados, setPatronesGuardados] = useState(false);

  // ── Constructor manual ─────────────────────────────────────────────
  const [form, setForm] = useState({ nombre_campo: '', patron_regex: '', contexto_antes: '', contexto_despues: '' });
  const [testTexto, setTestTexto] = useState('');
  const [testResult, setTestResult] = useState<{ coincidencia: string | null; encontrado: boolean } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Cleanup blob URL on unmount or when replaced
  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
  }, [pdfBlobUrl]);

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
    getReglas(sid).then(setReglas);
    getBorradores(sid).then(setBorradores);
    getTextosDisponibles(sid).then((ts) => {
      const cargado = pdfCargadoRef.current;
      const allTextos: TextoDisponible[] = cargado
        ? [{ id: -1, nombre_archivo: `📄 ${cargado.nombre}`, created_at: null, texto_pdf: cargado.texto }, ...ts]
        : ts;
      setTextosDisponibles(allTextos);
      if (allTextos.length > 0) {
        setSelTextoId(String(allTextos[0].id));
        setTextoPdf(allTextos[0].texto_pdf ?? '');
      } else {
        setSelTextoId(''); setTextoPdf('');
      }
    });
    setTextoSeleccionado(''); setContextoTexto('');
    setResultadoIA(null); setRegexEditado(''); setErrorIA(null);
  }, [selSubramo]);

  useEffect(() => {
    const item = textosDisponibles.find((t) => String(t.id) === selTextoId);
    setTextoPdf(item?.texto_pdf ?? '');
    setTextoSeleccionado(''); setContextoTexto(''); setResultadoIA(null);
  }, [selTextoId]);

  // ── Detectar módulo desde PDF ──────────────────────────────────────
  async function handleDetectarPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setDetectando(true); setDetectMsg(null);
    try {
      const res = await identificarModulo(file);
      if (!res.compania_id) {
        setDetectMsg({ ok: false, texto: 'No se reconoció la compañía en este PDF' });
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

      if (res.texto_pdf) {
        pdfCargadoRef.current = { nombre: file.name, texto: res.texto_pdf };
      }

      // Create blob URL so the PDF can be rendered in the viewer
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(URL.createObjectURL(file));

      if (res.compania_id && res.ramo_id && res.subramo_id) {
        setDetectedIds({ compania_id: res.compania_id, ramo_id: res.ramo_id, subramo_id: res.subramo_id });
      }
      setPatronesSugeridos(null);
      setPatronesGuardados(false);

      if (res.ramo_id && res.subramo_id) {
        pendingAutoSelect.current = { ramo_id: res.ramo_id, subramo_id: res.subramo_id };
      }
      setSelCompania(String(res.compania_id));
    } catch (err) {
      setDetectMsg({ ok: false, texto: err instanceof Error ? err.message : 'Error desconocido' });
    } finally {
      setDetectando(false);
    }
  }

  // ── Generar y guardar patrones de detección ───────────────────────
  async function handleGenerarPatrones() {
    if (!detectedIds || !pdfCargadoRef.current) return;
    setGenerandoPatrones(true);
    try {
      const res = await generarPatronesDeteccion(detectedIds.subramo_id, pdfCargadoRef.current.texto);
      setPatronesSugeridos(res);
    } catch (e) {
      setDetectMsg({ ok: false, texto: e instanceof Error ? e.message : 'Error generando patrones' });
    } finally {
      setGenerandoPatrones(false);
    }
  }

  async function handleGuardarPatrones() {
    if (!patronesSugeridos) return;
    await Promise.all([
      patchPatrones('companias', patronesSugeridos.compania_id, patronesSugeridos.compania),
      patchPatrones('ramos', patronesSugeridos.ramo_id, patronesSugeridos.ramo),
      patchPatrones('subramos', patronesSugeridos.subramo_id, patronesSugeridos.subramo),
    ]);
    setPatronesGuardados(true);
  }

  // ── Captura de selección ──────────────────────────────────────────
  function handleSeleccion() {
    const sel = window.getSelection();
    if (!sel || !sel.toString().trim()) return;
    const txt = sel.toString().trim();
    setTextoSeleccionado(txt);
    setResultadoIA(null); setErrorIA(null);

    // Context lookup in extracted text
    const idx = textoPdf.indexOf(txt);
    if (idx !== -1) {
      const start = Math.max(0, idx - 300);
      const end = Math.min(textoPdf.length, idx + txt.length + 300);
      setContextoTexto(textoPdf.substring(start, end));
    } else {
      setContextoTexto(txt);
    }

    // Capture bbox when using the PDF viewer
    if (mostrarPdfViewer && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const selRect = range.getBoundingClientRect();

      // Walk up the DOM to find the react-pdf page container
      let node: Node | null = range.startContainer;
      let pageEl: Element | null = null;
      while (node) {
        if (node instanceof Element && node.classList.contains('react-pdf__Page')) {
          pageEl = node;
          break;
        }
        node = node.parentNode;
      }

      if (pageEl && selRect.width > 0 && selRect.height > 0) {
        const pageNum = parseInt(pageEl.getAttribute('data-page-number') || '1', 10);
        const pageRect = pageEl.getBoundingClientRect();
        setBboxCapturado({
          page: pageNum,
          x0: Math.max(0, (selRect.left - pageRect.left) / pageRect.width),
          top: Math.max(0, (selRect.top - pageRect.top) / pageRect.height),
          x1: Math.min(1, (selRect.right - pageRect.left) / pageRect.width),
          bottom: Math.min(1, (selRect.bottom - pageRect.top) / pageRect.height),
        });
      } else {
        setBboxCapturado(null);
      }
    } else {
      setBboxCapturado(null);
    }
  }

  // ── Helpers para llamadas a Claude ────────────────────────────────
  function buildContextoIA() {
    const campoObj = campos.find((c) => c.nombre === campoBuild);
    const companiaObj = companias.find((c) => String(c.id) === selCompania);
    const ramoObj = ramos.find((r) => String(r.id) === selRamo);
    const subramoObj = subramos.find((s) => String(s.id) === selSubramo);
    return {
      subramo_id: Number(selSubramo),
      nombre_campo: campoBuild,
      campo_label: campoObj?.label ?? campoBuild,
      texto_seleccionado: textoSeleccionado,
      contexto_texto: contextoTexto,
      texto_completo: textoPdf,
      compania: companiaObj?.nombre,
      ramo: ramoObj?.nombre,
      subramo: (subramoObj as any)?.nombre,
    };
  }

  async function handleGenerarIA() {
    if (!textoSeleccionado || !campoBuild || !textoPdf) return;
    setGenerando(true); setErrorIA(null); setResultadoIA(null);
    try {
      const res = await generarRegexConIA(buildContextoIA());
      setResultadoIA(res);
      setRegexEditado(res.patron_regex);
    } catch (e) {
      setErrorIA(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setGenerando(false);
    }
  }

  async function handleReintentarIA() {
    if (!resultadoIA) return;
    setReintentando(true); setErrorIA(null);
    try {
      const res = await reintentarRegex({
        ...buildContextoIA(),
        patron_fallido: resultadoIA.patron_regex,
      });
      setResultadoIA(res);
      setRegexEditado(res.patron_regex);
    } catch (e) {
      setErrorIA(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setReintentando(false);
    }
  }

  async function handleGuardarIA() {
    if (!selSubramo || !campoBuild || !regexEditado) return;
    setGuardando(true);
    try {
      await crearRegla({
        subramo_id: Number(selSubramo),
        nombre_campo: campoBuild,
        patron_regex: regexEditado,
        confianza: resultadoIA?.confianza ?? 0.9,
        creado_por: 'ia',
        es_borrador: false,
        ejemplos: resultadoIA?.match_test ? [resultadoIA.match_test] : [],
        bbox: bboxCapturado ?? null,
      });
      getReglas(Number(selSubramo)).then(setReglas);
      getBorradores(Number(selSubramo)).then(setBorradores);
      setResultadoIA(null); setRegexEditado('');
      setTextoSeleccionado(''); setContextoTexto(''); setBboxCapturado(null);
    } finally {
      setGuardando(false);
    }
  }

  async function handleGuardarBorrador() {
    if (!selSubramo || !campoBuild || !regexEditado) return;
    setGuardando(true);
    try {
      await crearRegla({
        subramo_id: Number(selSubramo),
        nombre_campo: campoBuild,
        patron_regex: regexEditado,
        confianza: resultadoIA?.confianza ?? 0.5,
        creado_por: 'ia',
        es_borrador: true,
        ejemplos: [],
        bbox: bboxCapturado ?? null,
      });
      getBorradores(Number(selSubramo)).then(setBorradores);
      setResultadoIA(null); setRegexEditado('');
      setTextoSeleccionado(''); setContextoTexto(''); setBboxCapturado(null);
    } finally {
      setGuardando(false);
    }
  }

  async function handleActivarBorrador(id: number) {
    await activarRegla(id);
    getReglas(Number(selSubramo)).then(setReglas);
    getBorradores(Number(selSubramo)).then(setBorradores);
  }

  async function handleProbar() {
    if (!form.patron_regex || !testTexto) return;
    const r = await probarRegla(form.patron_regex, testTexto);
    setTestResult(r);
  }

  async function handleGuardarManual() {
    if (!selSubramo || !form.nombre_campo || !form.patron_regex) return;
    setGuardando(true);
    try {
      await crearRegla({ subramo_id: Number(selSubramo), ...form });
      getReglas(Number(selSubramo)).then(setReglas);
      setForm({ nombre_campo: '', patron_regex: '', contexto_antes: '', contexto_despues: '' });
      setTestResult(null);
    } finally {
      setGuardando(false);
    }
  }

  function clickCampo(nombre: string) {
    if (tab === 'visual') setCampoBuild(nombre);
    else setForm((f) => ({ ...f, nombre_campo: nombre }));
  }

  const camposConRegla = new Set(reglas.map((r) => r.nombre_campo));
  const camposConBorrador = new Map(borradores.map((r) => [r.nombre_campo, r.id]));
  const camposOrdenados = [...campos].sort((a, b) => {
    const aOk = camposConRegla.has(a.nombre);
    const bOk = camposConRegla.has(b.nombre);
    if (aOk !== bOk) return aOk ? -1 : 1;
    const aBorr = camposConBorrador.has(a.nombre);
    const bBorr = camposConBorrador.has(b.nombre);
    if (aBorr !== bBorr) return aBorr ? -1 : 1;
    return a.orden - b.orden;
  });

  const pasoCompleto = (n: 1 | 2 | 3) => {
    if (n === 1) return !!campoBuild;
    if (n === 2) return !!textoSeleccionado;
    return !!resultadoIA;
  };

  // Show PDF viewer only when the uploaded PDF is selected (id === -1)
  const mostrarPdfViewer = pdfBlobUrl && selTextoId === '-1';

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Reglas de Extracción</h1>
        <p className="text-sm text-gray-500 mt-1">Define patrones regex por Compañía · Ramo · Subramo · Campo</p>
      </div>

      {/* Detectar módulo desde PDF */}
      <div className="flex items-center gap-3">
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleDetectarPDF} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={detectando}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {detectando
            ? <><Loader className="w-4 h-4 animate-spin" />Analizando PDF…</>
            : <><ScanSearch className="w-4 h-4" />Detectar con PDF</>}
        </button>
        {detectMsg && (
          <span className={`text-sm font-medium ${detectMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {detectMsg.ok ? '✓' : '✕'} {detectMsg.texto}
          </span>
        )}
      </div>

      {/* Patrones de detección sugeridos */}
      {detectedIds && pdfCargadoRef.current && !patronesGuardados && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
              <Radio className="w-4 h-4" />
              Mejorar detección automática
            </p>
            {!patronesSugeridos && (
              <button
                onClick={handleGenerarPatrones}
                disabled={generandoPatrones}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {generandoPatrones
                  ? <><Loader className="w-3.5 h-3.5 animate-spin" />Analizando…</>
                  : <><Sparkles className="w-3.5 h-3.5" />Generar patrones regex</>}
              </button>
            )}
          </div>
          <p className="text-xs text-indigo-600">
            Genera regex para que el sistema detecte este tipo de póliza sin usar IA en el futuro.
          </p>

          {patronesSugeridos && (
            <div className="space-y-2">
              <p className="text-xs text-indigo-700 italic">{patronesSugeridos.explicacion}</p>
              {(['compania', 'ramo', 'subramo'] as const).map((nivel) => (
                <div key={nivel}>
                  <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">
                    {nivel === 'compania' ? 'Compañía' : nivel === 'ramo' ? 'Ramo' : 'Subramo'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {patronesSugeridos[nivel].map((p, i) => (
                      <code key={i} className="text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded font-mono">
                        {p}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={handleGuardarPatrones}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Guardar patrones en el catálogo
              </button>
            </div>
          )}
        </div>
      )}

      {patronesGuardados && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          Patrones guardados. El sistema detectará este tipo de póliza automáticamente.
        </div>
      )}

      {/* Selector de módulo */}
      <div className="flex gap-3">
        <select value={selCompania} onChange={(e) => setSelCompania(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Compañía…</option>
          {companias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.prioridad ? `P${c.prioridad} · ` : ''}{c.nombre}{c.porcentaje_docs ? ` (${(c.porcentaje_docs*100).toFixed(1)}%)` : ''}
            </option>
          ))}
        </select>
        <select value={selRamo} onChange={(e) => setSelRamo(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Ramo…</option>
          {ramos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <select value={selSubramo} onChange={(e) => setSelSubramo(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Subramo…</option>
          {subramos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.prioridad ? `P${s.prioridad} · ` : ''}{(s as any).nombre}{s.porcentaje_docs ? ` (${(s.porcentaje_docs*100).toFixed(2)}%)` : ''}
            </option>
          ))}
        </select>
      </div>

      {selSubramo ? (
        <div className="grid grid-cols-[280px_1fr] gap-6 items-start">

          {/* ── Panel izquierdo: campos ── */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm sticky top-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Campos del módulo</h2>
              <span className="text-[10px] text-gray-400 font-medium">
                {camposConRegla.size}/{campos.length} con regla
              </span>
            </div>
            <ul className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
              {camposOrdenados.map((c) => {
                const activo = tab === 'visual' ? campoBuild === c.nombre : form.nombre_campo === c.nombre;
                const tieneRegla = camposConRegla.has(c.nombre);
                const tieneBorrador = camposConBorrador.has(c.nombre) && !tieneRegla;
                const borradoId = camposConBorrador.get(c.nombre);
                return (
                  <li
                    key={c.id}
                    onClick={() => clickCampo(c.nombre)}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                      activo ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{c.label}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{c.nombre}</p>
                    </div>
                    {tieneRegla ? (
                      <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" />OK
                      </span>
                    ) : tieneBorrador ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleActivarBorrador(borradoId!); }}
                        className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium whitespace-nowrap hover:bg-amber-200 transition-colors"
                      >
                        <Clock className="w-3 h-3" />Activar
                      </button>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-2 flex-shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Panel derecho: constructor ── */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              <TabBtn active={tab === 'visual'} onClick={() => setTab('visual')} icon={<Sparkles className="w-3.5 h-3.5" />}>
                Constructor Visual + IA
              </TabBtn>
              <TabBtn active={tab === 'manual'} onClick={() => setTab('manual')} icon={<Edit3 className="w-3.5 h-3.5" />}>
                Manual
              </TabBtn>
            </div>

            {/* ── TAB VISUAL ── */}
            {tab === 'visual' && (
              <div className="p-5 space-y-5">

                {/* Pasos indicador */}
                <div className="flex items-center gap-1 text-xs">
                  <Paso n={1} ok={pasoCompleto(1)} label="Elegir campo" />
                  <div className="flex-1 h-px bg-gray-200 mx-1" />
                  <Paso n={2} ok={pasoCompleto(2)} label="Seleccionar valor" />
                  <div className="flex-1 h-px bg-gray-200 mx-1" />
                  <Paso n={3} ok={pasoCompleto(3)} label="Generar regex" />
                </div>

                {/* Paso 1: campo */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    1 · Campo a definir
                  </label>
                  <select
                    value={campoBuild}
                    onChange={(e) => { setCampoBuild(e.target.value); setResultadoIA(null); setTextoSeleccionado(''); }}
                    className="mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar campo…</option>
                    {campos.map((c) => (
                      <option key={c.id} value={c.nombre}>
                        {c.label} {camposConRegla.has(c.nombre) ? '✓' : camposConBorrador.has(c.nombre) ? '⏳' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Paso 2: visor */}
                {campoBuild && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        2 · Selecciona el valor en el PDF
                      </label>
                      {textosDisponibles.length > 0 && (
                        <select
                          value={selTextoId}
                          onChange={(e) => setSelTextoId(e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white max-w-[220px] truncate focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          {textosDisponibles.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre_archivo.substring(0, 35)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {mostrarPdfViewer ? (
                      /* ── Visor PDF real ── */
                      <div className="relative">
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 text-[10px] text-gray-500 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg border border-gray-200 pointer-events-none shadow-sm">
                          <MousePointer2 className="w-3 h-3" />
                          Selecciona texto del PDF
                        </div>
                        <PdfVisor url={pdfBlobUrl} onSeleccion={handleSeleccion} />
                      </div>
                    ) : textoPdf ? (
                      /* ── Visor texto extraído ── */
                      <div className="relative">
                        <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-gray-400 bg-white/90 px-2 py-1 rounded-lg border border-gray-100 z-10 pointer-events-none">
                          <MousePointer2 className="w-3 h-3" />
                          Arrastra para seleccionar
                        </div>
                        <pre
                          ref={visorRef}
                          onMouseUp={handleSeleccion}
                          className="w-full h-56 overflow-auto border border-gray-200 rounded-xl p-3 text-[11px] font-mono text-gray-700 leading-relaxed bg-gray-50 whitespace-pre-wrap cursor-text select-text"
                        >
                          {textoPdf}
                        </pre>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        No hay PDFs procesados para este subramo. Sube una póliza primero.
                      </div>
                    )}

                    {/* Valor seleccionado */}
                    {textoSeleccionado && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                          <span className="text-[10px] font-semibold text-blue-500 uppercase">Seleccionado</span>
                          <code className="flex-1 text-sm font-mono font-bold text-blue-800 truncate">
                            "{textoSeleccionado}"
                          </code>
                          <button
                            onClick={() => { setTextoSeleccionado(''); setContextoTexto(''); setResultadoIA(null); setBboxCapturado(null); }}
                            className="text-blue-400 hover:text-blue-600 text-xs"
                          >✕</button>
                        </div>
                        {bboxCapturado && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <span className="text-[10px]">📍</span>
                            <span className="text-[10px] text-emerald-700 font-medium">
                              Zona capturada · Pág. {bboxCapturado.page}
                              {' '}·{' '}
                              fila {Math.round(bboxCapturado.top * 100)}–{Math.round(bboxCapturado.bottom * 100)}%
                            </span>
                            <span className="ml-auto text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">
                              extracción por zona
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Botón generar */}
                {campoBuild && textoSeleccionado && (
                  <button
                    onClick={handleGenerarIA}
                    disabled={generando}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {generando ? (
                      <><Loader className="w-4 h-4 animate-spin" />Generando regex con Claude…</>
                    ) : (
                      <><Cpu className="w-4 h-4" />Generar regex con IA</>
                    )}
                  </button>
                )}

                {/* Error IA */}
                {errorIA && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{errorIA}</span>
                  </div>
                )}

                {/* Resultado IA */}
                {resultadoIA && (
                  <div className="space-y-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />Regex generado por Claude
                      </span>
                      <div className="flex items-center gap-1.5">
                        {bboxCapturado && (
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                            📍 zona p.{bboxCapturado.page}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                          Confianza {Math.round(resultadoIA.confianza * 100)}%
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-purple-600 uppercase">Patrón (editable)</label>
                      <input
                        value={regexEditado}
                        onChange={(e) => setRegexEditado(e.target.value)}
                        className="mt-1 w-full border border-purple-200 bg-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>

                    <p className="text-xs text-purple-800 leading-relaxed">{resultadoIA.explicacion}</p>

                    <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${
                      resultadoIA.match_ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                    }`}>
                      {resultadoIA.match_ok ? (
                        <><CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          Captura: <strong className="font-mono ml-1">"{resultadoIA.match_test}"</strong></>
                      ) : (
                        <><XCircle className="w-4 h-4 flex-shrink-0" />Sin coincidencia en el PDF</>
                      )}
                    </div>

                    {resultadoIA.match_ok ? (
                      <button
                        onClick={handleGuardarIA}
                        disabled={guardando || !regexEditado}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {guardando ? 'Guardando…' : 'Guardar regla'}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={handleReintentarIA}
                          disabled={reintentando || generando}
                          className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
                        >
                          {reintentando ? (
                            <><Loader className="w-4 h-4 animate-spin" />Generando variante…</>
                          ) : (
                            <><RefreshCw className="w-4 h-4" />Intentar variante más amplia</>
                          )}
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={handleGuardarBorrador}
                            disabled={guardando || !regexEditado}
                            className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {guardando ? 'Guardando…' : 'Guardar borrador'}
                          </button>
                          <button
                            onClick={handleGuardarIA}
                            disabled={guardando || !regexEditado}
                            className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Guardar igual
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400 text-center">
                          Borrador: se guarda para revisión posterior, no se aplica en extracciones
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB MANUAL ── */}
            {tab === 'manual' && (
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Campo</label>
                  <select
                    value={form.nombre_campo}
                    onChange={(e) => setForm((f) => ({ ...f, nombre_campo: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar campo…</option>
                    {campos.map((c) => <option key={c.id} value={c.nombre}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Patrón Regex</label>
                  <input
                    value={form.patron_regex}
                    onChange={(e) => setForm((f) => ({ ...f, patron_regex: e.target.value }))}
                    placeholder="ej. N[uú]mero de P[oó]liza[:\s]+([A-Z0-9\-]+)"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Texto de prueba</label>
                  <textarea
                    value={testTexto}
                    onChange={(e) => setTestTexto(e.target.value)}
                    rows={4}
                    placeholder="Pega aquí un fragmento del PDF para probar el patrón…"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {testResult && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    testResult.encontrado ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {testResult.encontrado
                      ? <><CheckCircle2 className="w-4 h-4" /> Encontrado: <strong className="font-mono ml-1">{testResult.coincidencia}</strong></>
                      : <><XCircle className="w-4 h-4" /> Sin coincidencia</>}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleProbar}
                    disabled={!form.patron_regex || !testTexto}
                    className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Probar
                  </button>
                  <button
                    onClick={handleGuardarManual}
                    disabled={guardando || !form.nombre_campo || !form.patron_regex}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {guardando ? 'Guardando…' : 'Guardar regla'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona Compañía → Ramo → Subramo para construir reglas</p>
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────

function PdfVisor({ url, onSeleccion }: { url: string; onSeleccion: () => void }) {
  const [numPages, setNumPages] = useState(0);
  const [cargando, setCargando] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPageWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setPageWidth(Math.floor(entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseUp={onSeleccion}
      className="relative w-full h-[560px] overflow-y-auto border border-gray-200 rounded-xl bg-gray-100 select-text"
    >
      {cargando && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-gray-400 bg-white px-3 py-2 rounded-lg shadow-sm">Cargando PDF…</span>
        </div>
      )}
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => { setNumPages(numPages); setCargando(false); }}
        onLoadError={() => setCargando(false)}
        loading={null}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div key={i + 1} className={i < numPages - 1 ? 'mb-1 border-b border-gray-300' : ''}>
            <Page
              pageNumber={i + 1}
              width={pageWidth}
              renderTextLayer
              renderAnnotationLayer={false}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'border-blue-500 text-blue-600 bg-blue-50/50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}{children}
    </button>
  );
}

function Paso({ n, ok, label }: { n: number; ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
        ok ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
      }`}>
        {ok ? '✓' : n}
      </div>
      <span className={`whitespace-nowrap ${ok ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>{label}</span>
    </div>
  );
}

function Loader({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
