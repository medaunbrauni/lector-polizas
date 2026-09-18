/**
 * PdfVisor — mini-visor de PDF con paginación y zoom, más su error boundary.
 *
 * Extraído de Reglas.tsx (movido tal cual, sin cambios de comportamiento)
 * para reusarse también en TicketsMovi.tsx (preview de un PDF de la cola
 * antes de confirmar su clasificación, o de una póliza ya enviada a
 * entrenamiento).
 *
 * Uso: siempre envuelto en <PdfVisorErrorBoundary key={id}> — la key debe
 * cambiar cuando cambia el documento mostrado, para que React desmonte por
 * completo la instancia anterior de pdf.js en vez de reutilizarla (ver
 * comentario junto al <Document key={...}> más abajo).
 */
import { useEffect, useState, useMemo, Component } from 'react';
import type { ReactNode } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { obtenerPdf } from '../../lib/pdfCache';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * Un PDF corrupto o que pdf.js no puede parsear tumbaría toda la pantalla
 * sin esto. Aísla el fallo al panel del visor — el resto de la UI (lista de
 * pólizas, panel de Campos) sigue funcionando. Se vuelve a montar solo con
 * key={id} en el punto de uso, así que cambiar de documento limpia el
 * error automáticamente sin recargar la página.
 */
export class PdfVisorErrorBoundary extends Component<{ children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  render() {
    if (this.state.fallo) {
      return (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] px-4 py-3 rounded-lg shadow-sm text-center max-w-sm">
            No se pudo mostrar el PDF de esta póliza. Elige otra póliza de la lista e intenta de nuevo.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PdfVisor({ polizaId, url, width }: { polizaId: number; url: string; width: number }) {
  const [numPages, setNumPages] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [noDisponible, setNoDisponible] = useState(false);

  // Al cambiar de póliza, volver a página 1, resetear zoom, y traer el PDF
  // (de la caché en memoria si ya se vio antes en esta sesión, o del
  // servidor si no) — nunca se precargan los PDFs de las demás pólizas.
  useEffect(() => {
    setPagina(1); setZoom(1.0); setCargando(true); setBytes(null); setNoDisponible(false);
    let cancelado = false;
    obtenerPdf(polizaId, url)
      .then((data) => { if (!cancelado) setBytes(data); })
      .catch(() => { if (!cancelado) { setNoDisponible(true); setCargando(false); } });
    return () => { cancelado = true; };
  }, [polizaId, url]);

  // Memoizado: react-pdf recarga el documento si la referencia de `file`
  // cambia, así que no se debe reconstruir este objeto en cada render.
  const fileProp = useMemo(() => (bytes ? { data: bytes } : null), [bytes]);

  const zoomOut = () => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
  const zoomIn  = () => setZoom((z) => Math.min(3.0,  Math.round((z + 0.25) * 100) / 100));

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">

      {/* ── Barra de navegación + zoom ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex-shrink-0 select-none">

        {/* Páginas */}
        <button
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
          disabled={pagina <= 1 || numPages === 0}
          className="px-2 py-0.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)] disabled:opacity-30 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded transition-colors"
        >‹</button>
        <span className="text-xs font-medium text-[var(--color-text-secondary)] tabular-nums min-w-[72px] text-center">
          {numPages > 0 ? `Pág. ${pagina} / ${numPages}` : '—'}
        </span>
        <button
          onClick={() => setPagina((p) => Math.min(numPages, p + 1))}
          disabled={pagina >= numPages || numPages === 0}
          className="px-2 py-0.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)] disabled:opacity-30 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded transition-colors"
        >›</button>

        {/* Separador */}
        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

        {/* Zoom */}
        <button
          onClick={zoomOut}
          disabled={zoom <= 0.5}
          className="w-6 h-6 flex items-center justify-center text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)] disabled:opacity-30 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded transition-colors"
          title="Reducir"
        >−</button>
        <button
          onClick={() => setZoom(1.0)}
          className="text-xs font-mono font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-brand-blue)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-1.5 py-0.5 transition-colors min-w-[44px] text-center"
          title="Restablecer zoom"
        >{Math.round(zoom * 100)}%</button>
        <button
          onClick={zoomIn}
          disabled={zoom >= 3.0}
          className="w-6 h-6 flex items-center justify-center text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-blue)] disabled:opacity-30 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded transition-colors"
          title="Ampliar"
        >+</button>
      </div>

      {/* ── Página actual — scroll dentro del visor ── */}
      <div className="flex-1 overflow-y-auto overflow-x-auto relative select-text bg-[var(--color-bg-secondary)]">
        {noDisponible ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] px-4 py-3 rounded-lg shadow-sm text-center max-w-sm">
              El archivo original ya no está disponible, pero los datos extraídos se conservan.
            </p>
          </div>
        ) : (
          <>
            {cargando && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <span className="text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] px-3 py-2 rounded-lg shadow-sm">Cargando PDF…</span>
              </div>
            )}
            {fileProp && (
              // key={polizaId}: fuerza a React a desmontar por completo el
              // <Document> anterior (y con él, la instancia de pdf.js/worker
              // que tenía) en vez de reutilizarlo en el sitio con un `file`
              // nuevo. Sin esto, pdf.js puede seguir procesando la carga del
              // PDF anterior cuando ya se le cambió el buffer por el
              // siguiente, y truena con "Cannot perform Construct on a
              // detached ArrayBuffer" al toparse con un buffer que ya se le
              // transfirió/vació a su worker — eso es lo que tumbaba toda la
              // pantalla al volver a una póliza ya vista (Bug 2).
              <Document
                key={polizaId}
                file={fileProp}
                onLoadSuccess={({ numPages }) => { setNumPages(numPages); setCargando(false); }}
                onLoadError={() => { setCargando(false); setNoDisponible(true); }}
                loading={null}
              >
                <Page
                  pageNumber={pagina}
                  width={Math.round((width || 700) * zoom)}
                  renderTextLayer
                  renderAnnotationLayer={false}
                />
              </Document>
            )}
          </>
        )}
      </div>
    </div>
  );
}
