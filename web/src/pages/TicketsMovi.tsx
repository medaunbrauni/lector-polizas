/**
 * TicketsMovi — cola de PDFs que llegan agrupados por ticket desde un CRM
 * externo (hoy solo MOVI BETA). Vista separada de la cola manual: aquí un
 * PDF nunca se sube suelto, siempre pertenece a un ticket con folio.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import type { Compania, TicketExterno, TicketExternoDetalle } from '../lib/types';
import { getTickets, getTicketDetalle, getCompanias } from '../lib/api';
import ColaItemRow from '../components/reglas/ColaItemRow';
import { useColaAcciones } from '../components/reglas/useColaAcciones';

function TicketCard({ ticket, companias }: { ticket: TicketExterno; companias: Compania[] }) {
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<TicketExternoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);

  const setItems = (updater: (prev: TicketExternoDetalle['items']) => TicketExternoDetalle['items']) => {
    setDetalle((prev) => (prev ? { ...prev, items: updater(prev.items) } : prev));
  };

  const {
    overrides, overrideActivo, patronesAbiertos, patronesSeleccionados, guardandoPatrones,
    abrirOverride, onCompaniaChange, onRamoChange, onSubramoChange,
    confirmarItem, descartar, togglePatrones, togglePatron, guardarPatrones,
  } = useColaAcciones(setItems);

  const toggle = async () => {
    const next = !abierto;
    setAbierto(next);
    if (next && !detalle) {
      setCargando(true);
      try {
        setDetalle(await getTicketDetalle(ticket.id));
      } finally {
        setCargando(false);
      }
    }
  };

  const fecha = ticket.recibido_en
    ? new Date(ticket.recibido_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const procesados = ticket.total_pdfs - (ticket.conteos.pendiente ?? 0);
  const pct = ticket.total_pdfs ? Math.round((procesados / ticket.total_pdfs) * 100) : 0;

  return (
    <div className="border border-gray-200 rounded-2xl bg-white shadow-sm overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        {abierto ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Ticket #{ticket.folio}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fecha}</p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0">
          {ticket.origen}
        </span>
        <div className="w-40 flex-shrink-0">
          <p className="text-xs text-gray-600 text-right mb-1">{ticket.resumen}</p>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {cargando && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> Cargando ticket…
            </div>
          )}
          {!cargando && detalle?.items.map((item) => (
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

export default function TicketsMovi() {
  const [tickets, setTickets] = useState<TicketExterno[]>([]);
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    try {
      const [t, c] = await Promise.all([getTickets(), getCompanias()]);
      setTickets(t);
      setCompanias(c);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Tickets MOVI</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            PDFs que MOVI (CRM BETA) envía agrupados por ticket cuando su extractor no logra procesarlos.
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {!cargando && tickets.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay tickets recibidos todavía.</p>
        </div>
      )}

      <div className="space-y-3">
        {tickets.map((t) => (
          <TicketCard key={t.id} ticket={t} companias={companias} />
        ))}
      </div>
    </div>
  );
}
