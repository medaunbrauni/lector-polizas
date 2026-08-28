import { useEffect } from 'react';
import { X, Car, FileText, Users, CreditCard, Cpu, Layers, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ResultadoPDF } from '../../lib/types';
import { fieldLabel, formatEntidad } from '../../lib/fieldConfig';
import { agruparCampos, labelCampo, OTROS_TITULO } from '../../lib/fieldGroups';

interface Props {
  data: ResultadoPDF;
  onClose: () => void;
  onAnterior?: () => void;
  onSiguiente?: () => void;
  indiceActual?: number;
  totalPolizas?: number;
  /** Número de la tanda (lote de PDFs subido de una vez) a la que
   * pertenece `data`. Solo un dato visual de orientación en el frontend
   * — no es un campo extraído, no se guarda en BD ni se exporta. */
  tandaNumero?: number;
}

// nombre_campo legacy -> nombre canónico usado en fieldGroups.ts (mismos 5
// grupos que Reglas.tsx). Sin este mapeo, una extracción vieja que todavía
// use el nombre legacy caería en "Otros" en vez de su grupo real.
const ALIAS_CANONICO: Record<string, string> = {
  numero_poliza: 'documento',
  descripcion_vehiculo: 'descripcion_veh',
  gastos_expedicion: 'derechos',
  subtotal: 'sub_total',
  inicio_vigencia: 'desde',
  fin_vigencia: 'hasta',
};

// Campos cuyo valor se muestra en fuente monoespaciada (identificadores).
const CAMPOS_MONO = new Set(['documento', 'rfc', 'placas', 'serie', 'motor', 'cp']);

const ICONOS_GRUPO: Record<string, React.ReactNode> = {
  'Datos del sistema':      <Layers className="w-4 h-4" />,
  'Datos de Póliza':        <FileText className="w-4 h-4" />,
  'Datos del contratante':  <Users className="w-4 h-4" />,
  'Datos del vehículo':     <Car className="w-4 h-4" />,
  'Datos':                  <CreditCard className="w-4 h-4" />,
  [OTROS_TITULO]:           <Layers className="w-4 h-4" />,
};

interface CampoItem {
  nombre: string;
  valor?: string;
  metodo?: string;
}

/** Normaliza data.campos (con posibles nombres legacy) a la lista de items
 * que agruparCampos() espera, resolviendo alias y descartando vacíos. */
function itemsDesdeCampos(campos: ResultadoPDF['campos'] | undefined): CampoItem[] {
  const porNombre = new Map<string, CampoItem>();
  for (const [claveRaw, info] of Object.entries(campos ?? {})) {
    if (!info?.valor) continue;
    const nombre = ALIAS_CANONICO[claveRaw] ?? claveRaw;
    if (!porNombre.has(nombre)) {
      porNombre.set(nombre, { nombre, valor: info.valor, metodo: info.metodo });
    }
  }
  return [...porNombre.values()];
}

export default function PolizaDetalle({
  data, onClose, onAnterior, onSiguiente, indiceActual, totalPolizas, tandaNumero,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const activo = document.activeElement;
      const escribiendo = activo instanceof HTMLElement &&
        (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA');
      if (escribiendo) return;

      if (e.key === 'ArrowLeft' && onAnterior) onAnterior();
      if (e.key === 'ArrowRight' && onSiguiente) onSiguiente();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAnterior, onSiguiente, onClose]);

  const grupos = agruparCampos(itemsDesdeCampos(data.campos), (item) => item.nombre);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <Car className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900">Detalle de Póliza</h2>
                {tandaNumero != null && (
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    Tanda {tandaNumero}
                  </span>
                )}
              </div>
              {data.compania && (
                <p className="text-xs text-gray-500">
                  {data.compania}{data.ramo ? ` · ${data.ramo}` : ''}{data.subramo ? ` · ${data.subramo}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {totalPolizas != null && totalPolizas > 1 && (
              <>
                <button
                  onClick={onAnterior}
                  disabled={indiceActual === 1}
                  className={`p-2 rounded-lg transition-colors ${
                    indiceActual === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <span className="text-xs text-gray-400 px-1 tabular-nums">
                  {indiceActual} / {totalPolizas}
                </span>
                <button
                  onClick={onSiguiente}
                  disabled={indiceActual === totalPolizas}
                  className={`p-2 rounded-lg transition-colors ${
                    indiceActual === totalPolizas ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100'
                  }`}
                >
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {data.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {data.error}
            </div>
          )}

          {/* Stats */}
          {data.stats && (
            <div className="flex gap-2 flex-wrap">
              <Stat label="Por regla"     value={data.stats.por_regla}     color="blue" />
              <Stat label="Por IA"        value={data.stats.por_ia}        color="purple" />
              <Stat label="No encontrado" value={data.stats.no_encontrados} color="gray" />
            </div>
          )}

          {/* Mismos 5 grupos (+ "Otros") que "Campos"/"Entrenar-Corregir"
              en el Entrenador — ver fieldGroups.ts. 'entidad' no está en
              ningún grupo definido, así que cae en "Otros": sigue visible
              aquí (a diferencia del Entrenador, donde se oculta a propósito). */}
          {grupos.map((grupo) => (
            <Section key={grupo.titulo} title={grupo.titulo} icon={ICONOS_GRUPO[grupo.titulo] ?? <Layers className="w-4 h-4" />}>
              {grupo.items.map((item) => (
                <Row
                  key={item.nombre}
                  label={labelCampo(item.nombre, fieldLabel(item.nombre))}
                  value={item.nombre === 'entidad' ? formatEntidad(item.valor) : item.valor}
                  metodo={item.metodo}
                  mono={CAMPOS_MONO.has(item.nombre)}
                  bold={item.nombre === 'prima_total'}
                />
              ))}
            </Section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: 'blue' | 'purple' | 'gray' }) {
  const cls = {
    blue:   'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    gray:   'bg-gray-100 text-gray-500',
  }[color];
  return (
    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${cls}`}>
      {label}: {value}
    </span>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {icon}{title}
      </div>
      <dl className="divide-y divide-gray-50">{children}</dl>
    </div>
  );
}

function Row({ label, value, metodo, mono, bold }: {
  label: string;
  value?: string;
  metodo?: string;
  mono?: boolean;
  bold?: boolean;
}) {
  if (!value) return null;   // no mostrar filas vacías
  return (
    <div className="flex items-start py-2 gap-4">
      <dt className="w-36 flex-shrink-0 text-xs text-gray-400 pt-0.5">{label}</dt>
      <dd className={`flex-1 text-sm break-words ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${mono ? 'font-mono' : ''}`}>
        <span className="flex items-center gap-1.5">
          {value}
          {metodo === 'ia'       && <Cpu className="w-3 h-3 text-purple-400 flex-shrink-0" />}
          {metodo === 'derivado' && <Zap className="w-3 h-3 text-amber-400  flex-shrink-0" />}
        </span>
      </dd>
    </div>
  );
}
