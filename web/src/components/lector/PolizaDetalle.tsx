import { X, Car, MapPin, CreditCard, Calendar, Cpu } from 'lucide-react';
import type { PolizaExtraida } from '../../lib/types';

interface Props {
  data: PolizaExtraida;
  onClose: () => void;
}

export default function PolizaDetalle({ data, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl"><Car className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="font-bold text-gray-900">Detalle de Póliza</h2>
              {data.compania && <p className="text-xs text-gray-500">{data.compania} · {data.ramo}</p>}
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

          {/* General */}
          <Section title="Póliza" icon={<Car className="w-4 h-4" />}>
            <Row label="N. Póliza" value={data.numero_poliza} />
            <Row label="Cliente" value={data.nombre_cliente} />
            <Row label="RFC" value={data.rfc} mono />
            <Row label="Forma de Pago" value={data.forma_pago} />
            <Row label="Moneda" value={data.moneda} />
          </Section>

          {/* Vehículo */}
          {data.vehiculo && (
            <Section title="Vehículo" icon={<Car className="w-4 h-4" />}>
              <Row label="Descripción" value={data.vehiculo.descripcion} />
              <Row label="Placas" value={data.vehiculo.placas} mono />
              <Row label="Serie" value={data.vehiculo.serie} mono />
              <Row label="Motor" value={data.vehiculo.motor} mono />
              <Row label="Tipo" value={data.vehiculo.tipo} />
              <Row label="Nacional/Importado" value={data.vehiculo.nacional_importado} />
            </Section>
          )}

          {/* Primas */}
          {data.primas && (
            <Section title="Primas" icon={<CreditCard className="w-4 h-4" />}>
              <Row label="Prima Neta" value={data.primas.prima_neta} />
              <Row label="Gastos Expedición" value={data.primas.gastos_expedicion} />
              <Row label="Tasa Financiamiento" value={data.primas.tasa_financiamiento} />
              <Row label="Subtotal" value={data.primas.subtotal} />
              <Row label="IVA" value={data.primas.iva} />
              <Row label="Prima Total" value={data.primas.prima_total} bold />
            </Section>
          )}

          {/* Vigencia */}
          {data.vigencia && (
            <Section title="Vigencia" icon={<Calendar className="w-4 h-4" />}>
              <Row label="Inicio" value={data.vigencia.inicio} />
              <Row label="Fin" value={data.vigencia.fin} />
            </Section>
          )}

          {/* Dirección */}
          {data.direccion && (
            <Section title="Dirección" icon={<MapPin className="w-4 h-4" />}>
              <Row label="Calle" value={data.direccion.calle} />
              <Row label="Colonia" value={data.direccion.colonia} />
              <Row label="Municipio" value={data.direccion.municipio} />
              <Row label="C.P." value={data.direccion.cp} />
              <Row label="Estado" value={data.direccion.estado} />
            </Section>
          )}

          {/* Método */}
          {data.metodo_extraccion && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Cpu className="w-3.5 h-3.5" />
              Extraído con: <span className="font-medium">{data.metodo_extraccion}</span>
            </div>
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

function Row({ label, value, mono, bold }: { label: string; value?: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-start py-2 gap-4">
      <dt className="w-32 flex-shrink-0 text-xs text-gray-400 pt-0.5">{label}</dt>
      <dd className={`flex-1 text-sm break-words ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-gray-300 italic font-normal text-xs">No encontrado</span>}
      </dd>
    </div>
  );
}
