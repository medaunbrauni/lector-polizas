import { useEffect } from 'react';
import { X, Car, MapPin, CreditCard, Calendar, Cpu, Layers, Heart, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ResultadoPDF } from '../../lib/types';
import { fieldLabel } from '../../lib/fieldConfig';

interface Props {
  data: ResultadoPDF;
  onClose: () => void;
  onAnterior?: () => void;
  onSiguiente?: () => void;
  indiceActual?: number;
  totalPolizas?: number;
}

// Campos que se muestran en secciones específicas (no en "Otros")
const CAMPOS_CONOCIDOS = new Set([
  // Póliza
  'documento', 'numero_poliza', 'nombre_cliente', 'rfc', 'entidad', 'forma_pago', 'moneda',
  // Vehículo
  'descripcion_veh', 'descripcion_vehiculo', 'placas', 'serie', 'motor',
  'tipo_vehiculo', 'modelo',
  // Cobertura / GMM
  'nombre_asegurado', 'suma_asegurada', 'deducible', 'coaseguro',
  'fecha_nacimiento', 'beneficiarios', 'objeto_asegurado',
  // Primas
  'prima_neta', 'derechos', 'gastos_expedicion', 'descuento', 'recargos',
  'sub_total', 'subtotal', 'iva', 'prima_total',
  // Vigencia
  'desde', 'hasta', 'inicio_vigencia', 'fin_vigencia',
  // Dirección
  'colonia', 'municipio', 'cp', 'estado',
]);

export default function PolizaDetalle({
  data, onClose, onAnterior, onSiguiente, indiceActual, totalPolizas,
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

  // Helper: valor por campo, acepta alias (nuevo nombre primero, viejo como fallback)
  const c  = (...keys: string[]) => {
    for (const k of keys) {
      const v = data.campos?.[k]?.valor;
      if (v) return v;
    }
    return undefined;
  };
  const mt = (...keys: string[]) => {
    for (const k of keys) {
      if (data.campos?.[k]) return data.campos[k].metodo;
    }
    return undefined;
  };

  const hasVehicle   = c('placas', 'serie', 'motor', 'descripcion_veh', 'descripcion_vehiculo', 'tipo_vehiculo');
  const hasCobertura = c('suma_asegurada', 'deducible', 'coaseguro', 'nombre_asegurado',
                         'fecha_nacimiento', 'beneficiarios', 'objeto_asegurado');
  const hasPrimas    = c('prima_neta', 'prima_total', 'derechos', 'gastos_expedicion', 'iva');
  const hasVigencia  = c('desde', 'hasta', 'inicio_vigencia', 'fin_vigencia');
  const hasDireccion = c('colonia', 'municipio', 'cp', 'estado');

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
              <h2 className="font-bold text-gray-900">Detalle de Póliza</h2>
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

          {/* Póliza */}
          <Section title="Póliza" icon={<Car className="w-4 h-4" />}>
            <Row label="N° Póliza"    value={c('documento', 'numero_poliza')} metodo={mt('documento', 'numero_poliza')} mono />
            <Row label="Cliente"      value={c('nombre_cliente')}  metodo={mt('nombre_cliente')} />
            <Row label="RFC"          value={c('rfc')}             metodo={mt('rfc')} mono />
            <Row label="Entidad"      value={c('entidad')}         metodo={mt('entidad')} />
            <Row label="Forma Pago"   value={c('forma_pago')}      metodo={mt('forma_pago')} />
            <Row label="Moneda"       value={c('moneda')}          metodo={mt('moneda')} />
          </Section>

          {/* Vehículo */}
          {hasVehicle && (
            <Section title="Vehículo" icon={<Car className="w-4 h-4" />}>
              <Row label="Descripción"        value={c('descripcion_veh', 'descripcion_vehiculo')} metodo={mt('descripcion_veh', 'descripcion_vehiculo')} />
              <Row label="Placas"             value={c('placas')}           metodo={mt('placas')} mono />
              <Row label="N° Serie"           value={c('serie')}            metodo={mt('serie')} mono />
              <Row label="N° Motor"           value={c('motor')}            metodo={mt('motor')} mono />
              <Row label="Modelo (año)"       value={c('modelo')}           metodo={mt('modelo')} />
              <Row label="Tipo"               value={c('tipo_vehiculo')}    metodo={mt('tipo_vehiculo')} />
            </Section>
          )}

          {/* Cobertura GMM / AYE / Vida */}
          {hasCobertura && (
            <Section title="Cobertura" icon={<Heart className="w-4 h-4" />}>
              <Row label="Asegurado"      value={c('nombre_asegurado')}  metodo={mt('nombre_asegurado')} />
              <Row label="Beneficiarios"  value={c('beneficiarios')}     metodo={mt('beneficiarios')} />
              <Row label="Objeto aseg."   value={c('objeto_asegurado')}  metodo={mt('objeto_asegurado')} />
              <Row label="Suma Asegurada" value={c('suma_asegurada')}    metodo={mt('suma_asegurada')} />
              <Row label="Deducible"      value={c('deducible')}         metodo={mt('deducible')} />
              <Row label="Coaseguro %"    value={c('coaseguro')}         metodo={mt('coaseguro')} />
              <Row label="F. Nacimiento"  value={c('fecha_nacimiento')}  metodo={mt('fecha_nacimiento')} />
            </Section>
          )}

          {/* Primas */}
          {hasPrimas && (
            <Section title="Primas" icon={<CreditCard className="w-4 h-4" />}>
              <Row label="Prima Neta"        value={c('prima_neta')}                              metodo={mt('prima_neta')} />
              <Row label="Gastos de Exp."    value={c('derechos', 'gastos_expedicion')}           metodo={mt('derechos', 'gastos_expedicion')} />
              <Row label="Descuento"         value={c('descuento')}                               metodo={mt('descuento')} />
              <Row label="Recargos"          value={c('recargos')}                                metodo={mt('recargos')} />
              <Row label="Subtotal"          value={c('sub_total', 'subtotal')}                   metodo={mt('sub_total', 'subtotal')} />
              <Row label="IVA"               value={c('iva')}                                     metodo={mt('iva')} />
              <Row label="Prima Total"       value={c('prima_total')}                             metodo={mt('prima_total')} bold />
            </Section>
          )}

          {/* Vigencia */}
          {hasVigencia && (
            <Section title="Vigencia" icon={<Calendar className="w-4 h-4" />}>
              <Row label="Inicio" value={c('desde', 'inicio_vigencia')} metodo={mt('desde', 'inicio_vigencia')} />
              <Row label="Fin"    value={c('hasta', 'fin_vigencia')}    metodo={mt('hasta', 'fin_vigencia')} />
            </Section>
          )}

          {/* Dirección */}
          {hasDireccion && (
            <Section title="Dirección" icon={<MapPin className="w-4 h-4" />}>
              <Row label="Colonia"   value={c('colonia')}   metodo={mt('colonia')} />
              <Row label="Municipio" value={c('municipio')} metodo={mt('municipio')} />
              <Row label="C.P."      value={c('cp')}        metodo={mt('cp')} mono />
              <Row label="Estado"    value={c('estado')}    metodo={mt('estado')} />
            </Section>
          )}

          {/* Otros campos no mapeados arriba */}
          {data.campos && Object.keys(data.campos).some((k) => !CAMPOS_CONOCIDOS.has(k)) && (
            <Section title="Otros campos" icon={<Layers className="w-4 h-4" />}>
              {Object.entries(data.campos)
                .filter(([k]) => !CAMPOS_CONOCIDOS.has(k))
                .map(([k, v]) => (
                  <Row key={k} label={fieldLabel(k)} value={v.valor ?? undefined} metodo={v.metodo} />
                ))}
            </Section>
          )}
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
