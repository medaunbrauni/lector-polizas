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
import { Upload, RefreshCw, CheckCircle2, AlertCircle, XCircle, Folder, Zap } from 'lucide-react';
import type { Compania, ItemCola, ResultadoUpload } from '../../lib/types';
import { uploadClasificador, getColaClasificador, confirmarLoteCola, clasificadorInfo } from '../../lib/api';
import ColaItemRow from './ColaItemRow';
import { useColaAcciones } from './useColaAcciones';

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

  // Filtro de origen — "manual" por defecto para no mezclar con tickets de
  // MOVI, que tienen su propia vista dedicada en /clasificador/tickets.
  const [origenFiltro, setOrigenFiltro] = useState<'manual' | 'movi_beta' | ''>('manual');

  const {
    overrides, overrideActivo, patronesAbiertos, patronesSeleccionados, guardandoPatrones,
    abrirOverride, onCompaniaChange, onRamoChange, onSubramoChange,
    confirmarItem, descartar, togglePatrones, togglePatron, guardarPatrones,
  } = useColaAcciones(setCola);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Carga inicial ──────────────────────────────────────────────────────────
  const cargarCola = useCallback(async () => {
    setCargando(true);
    try {
      const items = await getColaClasificador(undefined, origenFiltro || undefined);
      setCola(items);
    } finally {
      setCargando(false);
    }
  }, [origenFiltro]);

  useEffect(() => {
    cargarCola();
  }, [cargarCola]);

  useEffect(() => {
    clasificadorInfo().then((info) => {
      setCarpeta(info.carpeta);
      setWatcherActivo(info.watcher.activo);
    });
  }, []);

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
          <select
            value={origenFiltro}
            onChange={(e) => setOrigenFiltro(e.target.value as typeof origenFiltro)}
            title="Filtrar por origen"
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600"
          >
            <option value="manual">Origen: Manual</option>
            <option value="movi_beta">Origen: MOVI</option>
            <option value="">Origen: Todos</option>
          </select>
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
          {cola.map((item) => (
            <ColaItemRow
              key={item.id}
              item={item}
              companias={companias}
              override={overrides[item.id]}
              overrideOpen={overrideActivo === item.id}
              patronesOpen={patronesAbiertos.has(item.id)}
              patronesSeleccionados={patronesSeleccionados[item.id]}
              guardandoPatrones={guardandoPatrones === item.id}
              onAbrirOverride={() => abrirOverride(item)}
              onCompaniaChange={(cid) => onCompaniaChange(item.id, cid)}
              onRamoChange={(rid) => onRamoChange(item.id, rid)}
              onSubramoChange={(sid) => onSubramoChange(item.id, sid)}
              onConfirmar={() => confirmarItem(item)}
              onDescartar={() => descartar(item.id)}
              onTogglePatrones={() => togglePatrones(item.id, item)}
              onTogglePatron={(nivel, patron) => togglePatron(item.id, nivel, patron)}
              onGuardarPatrones={() => guardarPatrones(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
