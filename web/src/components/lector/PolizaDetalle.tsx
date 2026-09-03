import { useEffect, useRef, useState } from 'react';
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

const CONTRATANTE_TITULO = 'Datos del contratante';

/** Solo para este modal: "entidad" no está en ningún grupo de
 * fieldGroups.ts (compartido con Reglas.tsx/Entrenador), así que
 * agruparCampos() lo deja caer en "Otros". Aquí, y únicamente aquí, se
 * reubica dentro de "Datos del contratante" después de agrupar — no se
 * toca fieldGroups.ts para no afectar el Entrenador, donde debe seguir
 * ocultándose. */
function reubicarEntidad(
  grupos: { titulo: string; items: CampoItem[] }[],
): { titulo: string; items: CampoItem[] }[] {
  let entidad: CampoItem | undefined;
  const sinEntidad = grupos
    .map((g) => {
      if (g.titulo !== OTROS_TITULO) return g;
      const idx = g.items.findIndex((i) => i.nombre === 'entidad');
      if (idx === -1) return g;
      entidad = g.items[idx];
      return { ...g, items: g.items.filter((_, i) => i !== idx) };
    })
    .filter((g) => g.items.length > 0);

  if (!entidad) return sinEntidad;

  const tieneContratante = sinEntidad.some((g) => g.titulo === CONTRATANTE_TITULO);
  if (tieneContratante) {
    return sinEntidad.map((g) =>
      g.titulo === CONTRATANTE_TITULO ? { ...g, items: [...g.items, entidad!] } : g
    );
  }
  return [...sinEntidad, { titulo: CONTRATANTE_TITULO, items: [entidad] }];
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

type MetodoStat = 'regla' | 'ia' | 'no_encontrado';

// Mismo bucket de 3 que clasificar_metodo_campo en api/services/extractor.py
// (y que badgeMetodo en Reglas.tsx) — "regla" agrupa cualquier extracción
// determinística y confiable: motor de reglas de BD, extractor
// especializado por compañía, valor fijo de catálogo, o campo derivado.
// El contador de arriba (data.stats.por_regla) ya usa este mismo bucket
// del lado del backend; sin replicarlo aquí, el popover filtraba solo por
// metodo === 'regla' literal y se quedaba vacío para los campos con
// metodo === 'extractor_dedicado' (la mayoría, en pólizas de GNP/Quálitas).
function bucketMetodo(metodo: string | null | undefined): MetodoStat {
  if (metodo === 'regla' || metodo === 'extractor_dedicado' || metodo === 'valor_fijo' || metodo === 'derivado') {
    return 'regla';
  }
  if (metodo === 'ia') return 'ia';
  return 'no_encontrado';
}

/** Misma fuente (data.campos) que usa el backend para calcular data.stats:
 * un label por cada entrada, agrupado por método, para poblar los
 * popovers de los indicadores "Por regla / Por IA / No encontrado". Sin
 * deduplicar por alias -- así el conteo de cada lista coincide exacto con
 * el número del indicador correspondiente. */
function labelsPorMetodo(campos: ResultadoPDF['campos'] | undefined): Record<MetodoStat, string[]> {
  const grupos: Record<MetodoStat, string[]> = { regla: [], ia: [], no_encontrado: [] };
  for (const [claveRaw, info] of Object.entries(campos ?? {})) {
    const nombre = ALIAS_CANONICO[claveRaw] ?? claveRaw;
    grupos[bucketMetodo(info?.metodo)].push(labelCampo(nombre, fieldLabel(nombre)));
  }
  return grupos;
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

  const grupos = reubicarEntidad(agruparCampos(itemsDesdeCampos(data.campos), (item) => item.nombre));
  const porMetodo = labelsPorMetodo(data.campos);

  const statsRef = useRef<HTMLDivElement>(null);
  const [statAbierto, setStatAbierto] = useState<MetodoStat | null>(null);

  useEffect(() => {
    if (!statAbierto) return;
    function onClickFuera(e: MouseEvent) {
      if (statsRef.current && !statsRef.current.contains(e.target as Node)) {
        setStatAbierto(null);
      }
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [statAbierto]);

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
            <div ref={statsRef} className="flex gap-2 flex-wrap">
              <Stat
                label="Por regla" value={data.stats.por_regla} color="blue"
                campos={porMetodo.regla}
                abierto={statAbierto === 'regla'}
                onToggle={() => setStatAbierto((s) => (s === 'regla' ? null : 'regla'))}
              />
              <Stat
                label="Por IA" value={data.stats.por_ia} color="purple"
                campos={porMetodo.ia}
                abierto={statAbierto === 'ia'}
                onToggle={() => setStatAbierto((s) => (s === 'ia' ? null : 'ia'))}
              />
              <Stat
                label="No encontrado" value={data.stats.no_encontrados} color="gray"
                campos={porMetodo.no_encontrado}
                abierto={statAbierto === 'no_encontrado'}
                onToggle={() => setStatAbierto((s) => (s === 'no_encontrado' ? null : 'no_encontrado'))}
              />
            </div>
          )}

          {/* Mismos 5 grupos (+ "Otros") que "Campos"/"Entrenar-Corregir"
              en el Entrenador — ver fieldGroups.ts. 'entidad' no está en
              ningún grupo definido ahí; reubicarEntidad() la mueve de
              "Otros" a "Datos del contratante" solo en este modal (a
              diferencia del Entrenador, donde se oculta a propósito). */}
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

function Stat({ label, value, color, campos, abierto, onToggle }: {
  label: string;
  value: number;
  color: 'blue' | 'purple' | 'gray';
  campos: string[];
  abierto: boolean;
  onToggle: () => void;
}) {
  const cls = {
    blue:   'bg-blue-50 text-blue-700 hover:bg-blue-100',
    purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
    gray:   'bg-gray-100 text-gray-500 hover:bg-gray-200',
  }[color];
  const clsPopover = {
    blue:   'bg-blue-50 border-blue-200 text-blue-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    gray:   'bg-gray-50 border-gray-200 text-gray-700',
  }[color];

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${cls}`}
      >
        {label}: {value}
      </button>
      {abierto && (
        <div className={`absolute z-10 top-full left-0 mt-1.5 min-w-[180px] max-w-[260px] max-h-56 overflow-y-auto rounded-xl border shadow-lg px-3 py-2 text-xs ${clsPopover}`}>
          {campos.length === 0 ? (
            <p className="opacity-60">Sin campos en esta categoría.</p>
          ) : (
            <ul className="space-y-1">
              {campos.map((c, i) => <li key={`${c}-${i}`}>{c}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
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
