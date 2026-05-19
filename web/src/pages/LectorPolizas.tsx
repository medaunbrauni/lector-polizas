import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileUp, Loader2, CheckCircle2, AlertCircle,
  Download, Eye, X, Car, FileText, Cpu,
} from 'lucide-react';
import type { PolizaExtraida, ExtractionResponse } from '../lib/types';
import PolizaDetalle from '../components/lector/PolizaDetalle';

const API_URL = '/api/extraer';

const BADGE_COMPANIA: Record<string, string> = {
  'quálitas': 'bg-red-100 text-red-700',
  'qualitas': 'bg-red-100 text-red-700',
  'gnp': 'bg-blue-100 text-blue-700',
  'gnp seguros': 'bg-blue-100 text-blue-700',
  'ana seguros': 'bg-green-100 text-green-700',
  'hdi': 'bg-orange-100 text-orange-700',
  'banorte': 'bg-purple-100 text-purple-700',
  'el potosí': 'bg-yellow-100 text-yellow-700',
};

function badgeCompania(compania?: string) {
  if (!compania) return 'bg-gray-100 text-gray-500';
  return BADGE_COMPANIA[compania.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
}

export default function LectorPolizas() {
  const [resultados, setResultados] = useState<PolizaExtraida[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [detalle, setDetalle] = useState<PolizaExtraida | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function procesar(files: FileList) {
    setProcesando(true);
    setError(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));

      const res = await fetch(API_URL, { method: 'POST', body: formData });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Error del servidor: ${res.status} — ${txt}`);
      }
      const json: ExtractionResponse = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Error desconocido');
      setResultados(json.data);
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

  function exportarExcel() {
    if (!resultados.length) return;

    const headers = [
      'Archivo', 'Compañía', 'Ramo', 'N. Póliza', 'Cliente', 'RFC',
      'Forma Pago', 'Moneda', 'Placas', 'Serie', 'Motor', 'Descripción Vehículo',
      'Tipo Vehículo', 'Nacional/Importado',
      'Prima Neta', 'Gastos Expedición', 'Subtotal', 'IVA', 'Prima Total',
      'Inicio Vigencia', 'Fin Vigencia',
      'Colonia', 'Municipio', 'CP', 'Estado',
      'Error', 'Método',
    ];

    const filas = resultados.map((r) => [
      r.archivo, r.compania, r.ramo, r.numero_poliza, r.nombre_cliente, r.rfc,
      r.forma_pago, r.moneda,
      r.vehiculo?.placas, r.vehiculo?.serie, r.vehiculo?.motor,
      r.vehiculo?.descripcion, r.vehiculo?.tipo, r.vehiculo?.nacional_importado,
      r.primas?.prima_neta, r.primas?.gastos_expedicion, r.primas?.subtotal,
      r.primas?.iva, r.primas?.prima_total,
      r.vigencia?.inicio, r.vigencia?.fin,
      r.direccion?.colonia, r.direccion?.municipio, r.direccion?.cp, r.direccion?.estado,
      r.error, r.metodo_extraccion,
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...filas]);
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.min(Math.max(h.length, ...filas.map((f) => String(f[i] ?? '').length)) + 2, 40),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pólizas');
    XLSX.writeFile(wb, `polizas_${Date.now()}.xlsx`);
  }

  const exitosos = resultados.filter((r) => !r.error);
  const conError = resultados.filter((r) => r.error);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Upload */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !procesando && inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
            ${dragActive ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}
            ${procesando ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden"
            onChange={(e) => e.target.files?.length && procesar(e.target.files)} />

          {procesando ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="font-semibold text-gray-700">Procesando archivos…</p>
              <p className="text-sm text-gray-400">Extrayendo datos de las pólizas</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-gray-100 rounded-2xl">
                <FileUp className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-semibold text-gray-700">Arrastra archivos PDF aquí</p>
              <p className="text-sm text-gray-400">o haz clic para seleccionar. Múltiples archivos permitidos.</p>
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

        {/* Error global */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
          </div>
        )}

        {/* Stats */}
        {resultados.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            <Chip icon={<FileText className="w-4 h-4" />} label={`${resultados.length} archivo${resultados.length !== 1 ? 's' : ''}`} color="gray" />
            {exitosos.length > 0 && <Chip icon={<CheckCircle2 className="w-4 h-4" />} label={`${exitosos.length} exitoso${exitosos.length !== 1 ? 's' : ''}`} color="green" />}
            {conError.length > 0 && <Chip icon={<AlertCircle className="w-4 h-4" />} label={`${conError.length} con error`} color="red" />}
          </div>
        )}

        {/* Tabla */}
        {resultados.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Archivo', 'Compañía', 'N. Póliza', 'Cliente', 'Placas', 'Prima Total', 'Vigencia', 'Método', 'Estado', ''].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resultados.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-800 max-w-[140px] truncate">{r.archivo}</td>
                      <td className="px-3 py-2.5">
                        {r.compania
                          ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeCompania(r.compania)}`}>{r.compania}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">{r.numero_poliza || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px] truncate">{r.nombre_cliente || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">{r.vehiculo?.placas || '—'}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-gray-800">{r.primas?.prima_total || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {r.vigencia?.inicio && r.vigencia?.fin
                          ? `${r.vigencia.inicio} – ${r.vigencia.fin}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.metodo_extraccion === 'ai_claude'
                          ? <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 font-medium"><Cpu className="w-3 h-3" />IA</span>
                          : <span className="text-[10px] text-gray-400">Parser</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.error
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium"><AlertCircle className="w-3 h-3" />Error</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium"><CheckCircle2 className="w-3 h-3" />OK</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setDetalle(r)} className="text-blue-600 hover:text-blue-800 text-xs font-medium inline-flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {detalle && <PolizaDetalle data={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function Chip({ icon, label, color }: { icon: React.ReactNode; label: string; color: 'gray' | 'green' | 'red' }) {
  const cls = { gray: 'bg-gray-100 text-gray-600', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700' }[color];
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${cls}`}>
      {icon}{label}
    </div>
  );
}
