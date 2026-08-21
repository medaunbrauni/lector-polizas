/**
 * Persistencia temporal del estado del Extractor (LectorPolizas.tsx), para
 * que sobreviva a un F5 o a cambiar de pestaña sin perder los resultados,
 * hasta 25 minutos — con una tanda (lote de PDFs subido de una vez) por
 * cada extracción, cada una con su propio vencimiento independiente.
 *
 * Por qué localStorage y no sessionStorage: sessionStorage se borra al
 * cerrar la pestaña, pero el requisito es que la info siga disponible si el
 * usuario cierra y reabre la pestaña a los pocos minutos — eso solo lo
 * cubre localStorage. El límite de tiempo (TTL_MS) lo hace este módulo a
 * mano comparando timestamps, no lo da el navegador.
 *
 * Qué se guarda por tanda: `resultados` (los ResultadoPDF ya devueltos por
 * el backend — incluye "id" de cada extracción, compañía/ramo/subramo
 * detectados y los campos ya extraídos) + un `timestamp` propio de esa
 * tanda. NO se guarda el archivo PDF binario: este componente nunca lo
 * retiene en memoria más allá de la subida — el "id" que ya trae cada
 * resultado ES la referencia al PDF en el backend.
 *
 * Qué NO se guarda a propósito: el estado de la corrección manual en curso
 * (corrMode/corrState de LectorPolizas.tsx) — es edición transitoria de UI
 * ligada a catálogos que se refrescan solos al abrir "Corregir".
 *
 * NOTA DE FORMATO: este módulo reemplaza por completo el esquema anterior
 * (un solo bloque {resultados, timestamp} bajo la clave
 * "lector_polizas:extractor_estado"). Se usa una clave nueva
 * ("lector_polizas:extractor_tandas") en vez de migrar el formato viejo —
 * es información de sesión de corta duración, así que no hay nada valioso
 * que migrar; el peor caso es que un estado guardado justo antes de este
 * cambio no se restaure una vez, y expira solo.
 *
 * TTL_MS es la ÚNICA fuente de verdad del límite de expiración — tanto este
 * archivo como LectorPolizas.tsx lo importan de aquí en vez de tener el
 * número repetido en cada lugar.
 */
import type { ResultadoPDF } from './types';

const STORAGE_KEY = 'lector_polizas:extractor_tandas';
export const TTL_MS = 25 * 60 * 1000; // 25 minutos, por tanda

export interface Tanda {
  id: string;
  resultados: ResultadoPDF[];
  timestamp: number;
}

function generarId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function crearTanda(resultados: ResultadoPDF[]): Tanda {
  return { id: generarId(), resultados, timestamp: Date.now() };
}

function estanVigentes(tandas: Tanda[]): Tanda[] {
  const ahora = Date.now();
  return tandas.filter((t) => ahora - t.timestamp <= TTL_MS);
}

/** Sobrescribe por completo las tandas guardadas (ya filtradas a las vigentes por el caller). */
export function guardarTandas(tandas: Tanda[]): void {
  try {
    if (tandas.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tandas));
  } catch {
    // localStorage lleno o deshabilitado: no persistir, pero no romper la app
  }
}

/**
 * Lee las tandas guardadas y descarta las que ya vencieron (más de TTL_MS
 * desde que se completó esa tanda). Si alguna venció, re-guarda solo las
 * vigentes para que la próxima lectura no las vuelva a encontrar.
 */
export function leerTandasVigentes(): Tanda[] {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return [];

    const todas: Tanda[] = JSON.parse(crudo);
    const vigentes = estanVigentes(todas);
    if (vigentes.length !== todas.length) guardarTandas(vigentes);
    return vigentes;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

/** Usado por "Limpiar interfaz": borra todas las tandas de una sola vez. */
export function limpiarTandas(): void {
  localStorage.removeItem(STORAGE_KEY);
}
