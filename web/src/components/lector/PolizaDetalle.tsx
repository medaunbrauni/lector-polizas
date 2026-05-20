import { X, Car, MapPin, CreditCard, Calendar, Cpu, Layers } from 'lucide-react';
import type { ResultadoPDF } from '../../lib/types';

interface Props {
  data: ResultadoPDF;
  onClose: () => void;
}

export default function PolizaDetalle({ data, onClose }: Props) {
  const c = (k: string) => data.campos?.[k]?.valor ?? undefined;
  const m = (k: string) => data.campos?.[k]?.metodo;

  const hasVehicle = c('placas') || c('serie') || c('motor') || c('descripcion_vehiculo') || c('tipo_vehiculo');
  const hasPrimas = c('prima_neta') || c('prima_total') || c('gastos_expedicion') || c('iva');
  const hasVigencia = c('inicio_vigencia') || c('fin_vigencia');
  const hasDireccion = c('colonia') || c('municipio') || c('cp') || c('estado');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl"><Car className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="font-bold text-gray-900">Detalle de Póliza</h2>
              {data.compania && <p className="text-xs text-gray-500">{data.compania} · {data.ramo} · {data.subramo}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {data.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{data.error}</div>
          )}

          {/* Stats */}
          {data.stats && (
            <div className="flex gap-2 flex-wrap">
              <Stat label="Por regla" value={data.stats.por_regla} color="blue" />
              <Stat label="Por IA" value={data.stats.por_ia} color="purple" />
              <Stat label="No encontrado" value={data.stats.no_encontrados} color="gray" />
            </div>
          )}

          {/* General */}
          <Section title="Póliza" icon={<Car className="w-4 h-4" />}>
            <Row label="N. Póliza" value={c('numero_poliza')} metodo={m('numero_poliza')} mono />
            <Row label="Cliente" value={c('nombre_cliente')} metodo={m('nombre_cliente')} />
            <Row label="RFC" value={c('rfc')} metodo={m('rfc')} mono />
            <Row label="Forma de Pago" value={c('forma_pago')} metodo={m('forma_pago')} />
            <Row label="Moneda" value={c('moneda')} metodo={m('moneda')} />
          </Section>

          {/* Vehículo */}
          {hasVehicle && (
            <Section title="Vehículo" icon={<Car className="w-4 h-4" />}>
              <Row label="Descripción" value={c('descripcion_vehiculo')} metodo={m('descripcion_vehiculo')} />
              <Row label="Placas" value={c('placas')} metodo={m('placas')} mono />
              <Row label="Serie" value={c('serie')} metodo={m('serie')} mono />
              <Row label="Motor" value={c('motor')} metodo={m('motor')} mono />
              <Row label="Tipo" value={c('tipo_vehiculo')} metodo={m('tipo_vehiculo')} />
              <Row label="Nacional/Importado" value={c('nacional_importado')} metodo={m('nacional_importado')} />
            </Section>
          )}

          {/* Primas */}
          {hasPrimas && (
            <Section title="Primas" icon={<CreditCard className="w-4 h-4" />}>
              <Row label="Prima Neta" value={c('prima_neta')} metodo={m('prima_neta')} />
              <Row label="Gastos Expedición" value={c('gastos_expedicion')} metodo={m('gastos_expedicion')} />
              <Row label="Subtotal" value={c('subtotal')} metodo={m('subtotal')} />
              <Row label="IVA" value={c('iva')} metodo={m('iva')} />
              <Row label="Prima Total" value={c('prima_total')} metodo={m('prima_total')} bold />
            </Section>
          )}

          {/* Vigencia */}
          {hasVigencia && (
            <Section title="Vigencia" icon={<Calendar className="w-4 h-4" />}>
              <Row label="Inicio" value={c('inicio_vigencia')} metodo={m('inicio_vigencia')} />
              <Row label="Fin" value={c('fin_vigencia')} metodo={m('fin_vigencia')} />
            </Section>
          )}

          {/* Dirección */}
          {hasDireccion && (
            <Section title="Dirección" icon={<MapPin className="w-4 h-4" />}>
              <Row label="Colonia" value={c('colonia')} metodo={m('colonia')} />
              <Row label="Municipio" value={c('municipio')} metodo={m('municipio')} />
              <Row label="C.P." value={c('cp')} metodo={m('cp')} mono />
              <Row label="Estado" value={c('estado')} metodo={m('estado')} />
            </Section>
          )}

          {/* Campos no mapeados */}
          {data.campos && Object.keys(data.campos).some(k =>
            !['numero_poliza','nombre_cliente','rfc','forma_pago','moneda',
              'descripcion_vehiculo','placas','serie','motor','tipo_vehiculo','nacional_importado',
              'prima_neta','gastos_expedicion','subtotal','iva','prima_total',
              'inicio_vigencia','fin_vigencia','colonia','municipio','cp','estado'].includes(k)
          ) && (
            <Section title="Otros campos" icon={<Layers className="w-4 h-4" />}>
              {Object.entries(data.campos)
                .filter(([k]) => !['numero_poliza','nombre_cliente','rfc','forma_pago','moneda',
                  'descripcion_vehiculo','placas','serie','motor','tipo_vehiculo','nacional_importado',
                  'prima_neta','gastos_expedicion','subtotal','iva','prima_total',
                  'inicio_vigencia','fin_vigencia','colonia','municipio','cp','estado'].includes(k))
                .map(([k, v]) => (
                  <Row key={k} label={k} value={v.valor ?? undefined} metodo={v.metodo} />
                ))
              }
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: 'blue' | 'purple' | 'gray' }) {
  const cls = { blue: 'bg-blue-50 text-blue-700', purple: 'bg-purple-50 text-purple-700', gray: 'bg-gray-100 text-gray-500' }[color];
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
  label: string; value?: string; metodo?: string; mono?: boolean; bold?: boolean;
}) {
  return (
    <div className="flex items-start py-2 gap-4">
      <dt className="w-32 flex-shrink-0 text-xs text-gray-400 pt-0.5">{label}</dt>
      <dd className={`flex-1 text-sm break-words ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${mono ? 'font-mono' : ''}`}>
        {value
          ? <span className="flex items-center gap-1.5">
              {value}
              {metodo === 'ia' && <Cpu className="w-3 h-3 text-purple-400 flex-shrink-0" />}
            </span>
          : <span className="text-gray-300 italic font-normal text-xs">No encontrado</span>
        }
      </dd>
    </div>
  );
}
