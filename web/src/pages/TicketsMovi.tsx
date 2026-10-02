/**
 * TicketsMovi — cola de PDFs que llegan agrupados por ticket desde un CRM
 * externo (hoy solo MOVI BETA). Vista separada de la cola manual: aquí un
 * PDF nunca se sube suelto, siempre pertenece a un ticket con folio.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Inbox, RefreshCw, Trash2 } from 'lucide-react';
import type { Compania, TicketExterno, TicketExternoDetalle } from '../lib/types';
import { getTickets, getTicketDetalle, getCompanias, eliminarTicket } from '../lib/api';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DismissibleAlert from '../components/ui/DismissibleAlert';
import ColaItemRow from '../components/reglas/ColaItemRow';
import { useColaAcciones } from '../components/reglas/useColaAcciones';

const RESUELTOS = ['enviado', 'confirmado'];

function TicketCard({ ticket, companias, onEliminar }: {
  ticket: TicketExterno; companias: Compania[]; onEliminar: (hayPendientes: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<TicketExternoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);

  const setItems = (updater: (prev: TicketExternoDetalle['items']) => TicketExternoDetalle['items']) => {
    setDetalle((prev) => (prev ? { ...prev, items: updater(prev.items) } : prev));
  };

  const {
    overrides, overrideActivo, patronesAbiertos, patronesSeleccionados, guardandoPatrones, reenviando,
    abrirOverride, onCompaniaChange, onRamoChange, onSubramoChange,
    confirmarItem, descartar, togglePatrones, togglePatron, guardarPatrones, reenviar,
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

  // Con el detalle abierto manda lo que el usuario ya confirmó/eliminó en pantalla;
  // si no, los conteos de la lista. El backend revalida de todos modos (409).
  const hayPendientes = detalle
    ? detalle.items.some((i) => !RESUELTOS.includes(i.estado))
    : Object.entries(ticket.conteos).some(([e, n]) => n > 0 && !RESUELTOS.includes(e));

  const fecha = ticket.recibido_en
    ? new Date(ticket.recibido_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const procesados = ticket.total_pdfs - (ticket.conteos.pendiente ?? 0);
  const pct = ticket.total_pdfs ? Math.round((procesados / ticket.total_pdfs) * 100) : 0;

  return (
    <div className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-bg-primary)] shadow-sm overflow-hidden">
      <div className="flex items-center hover:bg-[var(--color-bg-secondary)] transition-colors">
      <button
        onClick={toggle}
        className="flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left"
      >
        {abierto ? <ChevronDown className="w-4 h-4 text-[var(--color-text-secondary)] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)] flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">Ticket #{ticket.folio}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{fecha}</p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0">
          {ticket.origen}
        </span>
        <div className="w-40 flex-shrink-0">
          <p className="text-xs text-[var(--color-text-secondary)] text-right mb-1">{ticket.resumen}</p>
          <div className="h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--color-brand-blue)] rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>
      <button
        onClick={() => onEliminar(hayPendientes)}
        title="Eliminar ticket"
        aria-label="Eliminar ticket"
        className="mx-3 p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-error-text)] hover:bg-[var(--color-bg-primary)] transition-colors flex-shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      </div>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
          {cargando && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] py-4 justify-center">
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
              onReenviar={() => reenviar(item)}
              reenviando={reenviando === item.id}
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
  const [aviso, setAviso] = useState(false);
  const [porEliminar, setPorEliminar] = useState<TicketExterno | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const confirmarEliminar = async () => {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarTicket(porEliminar.id);
      setTickets((prev) => prev.filter((t) => t.id !== porEliminar.id));
      setPorEliminar(null);
    } catch {
      // 409: el backend vio pendientes que la UI no — recarga y avisa.
      setPorEliminar(null);
      setAviso(true);
      cargar();
    } finally {
      setEliminando(false);
    }
  };

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
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Tickets MOVI</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            PDFs que MOVI (CRM BETA) envía agrupados por ticket cuando su extractor no logra procesarlos.
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] hover:opacity-80 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <DismissibleAlert
        show={aviso}
        duracionMs={5000}
        onClose={() => setAviso(false)}
        className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between gap-3"
        cerrarClassName="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] font-medium flex-shrink-0"
      >
        <p className="text-sm text-[var(--color-warning-text)]">Primero confirma o elimina los tickets</p>
      </DismissibleAlert>

      <ConfirmDialog
        open={!!porEliminar}
        variant="info"
        title="Eliminar ticket"
        message="¿Estás seguro que quieres eliminar el ticket y darlo por terminado?"
        confirmLabel="Eliminar"
        destructivo
        procesando={eliminando}
        onConfirm={confirmarEliminar}
        onCancel={() => setPorEliminar(null)}
      />

      {!cargando && tickets.length === 0 && (
        <div className="text-center py-12 text-[var(--color-text-secondary)]">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay tickets recibidos todavía.</p>
        </div>
      )}

      <div className="space-y-3">
        {tickets.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            companias={companias}
            onEliminar={(pend) => (pend ? setAviso(true) : setPorEliminar(t))}
          />
        ))}
      </div>
    </div>
  );
}
