/**
 * Caché LRU en memoria de los últimos PDFs descargados en la sesión actual.
 * Vive a nivel de módulo (no en un componente) para sobrevivir a que el
 * usuario navegue entre pólizas sin volver a descargar el mismo archivo —
 * pero se pierde al recargar la página, ya que es solo un Map en memoria del
 * JS del navegador (nunca localStorage/sessionStorage, a propósito).
 */
const MAX_ENTRADAS = 20;
const cache = new Map<number, ArrayBuffer>();

/** Se lanza cuando el PDF ya no existe en el servidor (archivo depurado). */
export class PdfNoDisponibleError extends Error {
  constructor(polizaId: number) {
    super(`El PDF de la póliza ${polizaId} ya no está disponible`);
    this.name = 'PdfNoDisponibleError';
  }
}

/**
 * Devuelve los bytes del PDF de `polizaId`, usando la caché si ya se
 * descargó antes en esta sesión. Al superar MAX_ENTRADAS, descarta el visto
 * hace más tiempo (no lo vuelve a descargar solo, hasta que el usuario lo
 * pida de nuevo).
 *
 * IMPORTANTE: react-pdf/pdf.js "transfiere" (detached) el ArrayBuffer que
 * recibe en `file={{data: ...}}` — lo vacía como parte de mandarlo a su
 * worker. Si se le pasara el mismo ArrayBuffer guardado en caché dos veces,
 * la segunda vez sería un buffer ya vacío y pdf.js truena con "Cannot
 * perform Construct on a detached ArrayBuffer" (sin un error boundary en la
 * app, esto tumba toda la pantalla). Por eso el original nunca sale de este
 * módulo: cada llamada (con o sin cache hit) devuelve una COPIA (`slice`)
 * que pdf.js puede detonar sin dañar lo que sigue guardado en la caché.
 */
export async function obtenerPdf(polizaId: number, url: string): Promise<ArrayBuffer> {
  const enCache = cache.get(polizaId);
  if (enCache) {
    // Recolocar al final = "visto más recientemente"
    cache.delete(polizaId);
    cache.set(polizaId, enCache);
    return enCache.slice(0);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new PdfNoDisponibleError(polizaId);
  }
  const bytes = await res.arrayBuffer();

  cache.set(polizaId, bytes);
  if (cache.size > MAX_ENTRADAS) {
    const masAntiguo = cache.keys().next().value;
    if (masAntiguo !== undefined) cache.delete(masAntiguo);
  }

  return bytes.slice(0);
}
