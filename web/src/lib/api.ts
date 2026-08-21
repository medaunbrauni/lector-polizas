const BASE = '/api';

export async function extraerPolizas(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await fetch(`${BASE}/extraer`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function getCompanias() {
  const res = await fetch(`${BASE}/catalogos/companias`);
  return res.json();
}

export async function getRamos(companiaId?: number) {
  const url = companiaId
    ? `${BASE}/catalogos/ramos?compania_id=${companiaId}`
    : `${BASE}/catalogos/ramos`;
  const res = await fetch(url);
  return res.json();
}

export async function getSubramos(ramoId?: number) {
  const url = ramoId
    ? `${BASE}/catalogos/subramos?ramo_id=${ramoId}`
    : `${BASE}/catalogos/subramos`;
  const res = await fetch(url);
  return res.json();
}

export async function getCampos(subramoId: number) {
  const res = await fetch(`${BASE}/catalogos/subramos/${subramoId}/campos`);
  return res.json();
}

export async function getReglas(subramoId?: number) {
  const url = subramoId
    ? `${BASE}/reglas?subramo_id=${subramoId}`
    : `${BASE}/reglas`;
  const res = await fetch(url);
  return res.json();
}

export async function crearRegla(data: object) {
  const res = await fetch(`${BASE}/reglas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function probarRegla(patron: string, texto: string) {
  const res = await fetch(`${BASE}/reglas/probar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patron_regex: patron, texto }),
  });
  return res.json();
}

export async function getHistorial(skip = 0, limit = 50) {
  const res = await fetch(`${BASE}/extraer/historial?skip=${skip}&limit=${limit}`);
  return res.json();
}

export async function getCobertura(subramoId: number) {
  const res = await fetch(`${BASE}/reglas/cobertura/${subramoId}`);
  return res.json();
}

export async function getTextosDisponibles(subramoId: number) {
  const res = await fetch(`${BASE}/reglas/textos-disponibles?subramo_id=${subramoId}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function generarRegexConIA(data: {
  subramo_id: number;
  nombre_campo: string;
  campo_label: string;
  texto_seleccionado: string;
  contexto_texto: string;
  texto_completo: string;
  compania?: string;
  ramo?: string;
  subramo?: string;
}) {
  const res = await fetch(`${BASE}/reglas/generar-con-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

export async function reintentarRegex(data: {
  subramo_id: number;
  nombre_campo: string;
  campo_label: string;
  patron_fallido: string;
  texto_seleccionado: string;
  contexto_texto: string;
  texto_completo: string;
  compania?: string;
  ramo?: string;
  subramo?: string;
}) {
  const res = await fetch(`${BASE}/reglas/reintentar-regex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

export async function getBorradores(subramoId: number) {
  const res = await fetch(`${BASE}/reglas/borradores?subramo_id=${subramoId}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function activarRegla(id: number) {
  const res = await fetch(`${BASE}/reglas/${id}/activar`, { method: 'POST' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function patchAlias(nivel: 'companias' | 'ramos' | 'subramos', id: number, nombre_exportacion: string | null) {
  const res = await fetch(`${BASE}/catalogos/${nivel}/${id}/alias`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_exportacion }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function patchPatrones(nivel: 'companias' | 'ramos' | 'subramos', id: number, patrones: string[]) {
  const res = await fetch(`${BASE}/catalogos/${nivel}/${id}/patrones`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patrones_deteccion: patrones }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function generarPatronesDeteccion(subramo_id: number, texto_pdf: string) {
  const res = await fetch(`${BASE}/reglas/generar-patrones-deteccion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subramo_id, texto_pdf }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json() as Promise<{
    compania: string[]; ramo: string[]; subramo: string[];
    explicacion: string;
    compania_id: number; ramo_id: number; subramo_id: number;
  }>;
}

export async function getReglasConJerarquia() {
  const res = await fetch(`${BASE}/reglas/con-jerarquia`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function getCodigoDeteccion() {
  const res = await fetch(`${BASE}/catalogos/codigo-deteccion`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

// ── Entrenamiento por lotes ───────────────────────────────────────────────────

export async function subirPolizasEntrenamiento(subramoId: number, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await fetch(`${BASE}/entrenamiento/subramos/${subramoId}/polizas`, {
    method: 'POST', body: form,
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function listarPolizasEntrenamiento(subramoId: number) {
  const res = await fetch(`${BASE}/entrenamiento/subramos/${subramoId}/polizas`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export function urlPdfEntrenamiento(polizaId: number) {
  return `${BASE}/entrenamiento/polizas/${polizaId}/pdf`;
}

export function urlImagenPagina(polizaId: number, page: number, escala = 2.0) {
  return `${BASE}/entrenamiento/polizas/${polizaId}/pagina/${page}/imagen?escala=${escala}`;
}

export async function getTextoPdf(polizaId: number): Promise<string> {
  const res = await fetch(`${BASE}/entrenamiento/polizas/${polizaId}/texto`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return data.texto as string;
}

export async function eliminarPolizaEntrenamiento(polizaId: number) {
  const res = await fetch(`${BASE}/entrenamiento/polizas/${polizaId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function vaciarLoteEntrenamiento(subramoId: number) {
  const res = await fetch(`${BASE}/entrenamiento/subramos/${subramoId}/polizas`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function guardarSeleccion(data: {
  poliza_id: number; nombre_campo: string; texto_seleccionado: string;
  contexto?: string; bbox?: object | null; es_auto?: boolean;
}) {
  const res = await fetch(`${BASE}/entrenamiento/selecciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function eliminarSeleccion(selId: number) {
  const res = await fetch(`${BASE}/entrenamiento/selecciones/${selId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function getEstadoLote(subramoId: number) {
  const res = await fetch(`${BASE}/entrenamiento/subramos/${subramoId}/estado`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function generarRegexLote(subramoId: number, nombre_campo: string, campo_label: string) {
  const res = await fetch(`${BASE}/entrenamiento/subramos/${subramoId}/generar-regex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_campo, campo_label }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

export async function probarRegexLote(subramoId: number, nombre_campo: string, patron_regex: string) {
  const res = await fetch(`${BASE}/entrenamiento/subramos/${subramoId}/probar-regex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_campo, patron_regex }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function guardarReglaLote(subramoId: number, data: {
  nombre_campo: string; patron_regex: string; cobertura_lote: number; total_lote: number;
  bbox?: object | null; ocr_bbox?: object | null; confianza?: number;
}) {
  const res = await fetch(`${BASE}/entrenamiento/subramos/${subramoId}/guardar-regla`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function identificarModulo(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/extraer/identificar-modulo`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json() as Promise<import('./types').ResultadoDeteccion & { texto_pdf: string }>;
}

export async function probarDeteccion(texto_pdf: string) {
  const res = await fetch(`${BASE}/catalogos/probar-deteccion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto_pdf }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<import('./types').ResultadoDeteccion>;
}

export async function reaplicarExtraccion(extraccion_id: number, subramo_id: number) {
  const res = await fetch(`${BASE}/extraer/reaplicar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraccion_id, subramo_id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json() as Promise<import('./types').ResultadoPDF>;
}

export async function generarYGuardarPatrones(subramo_id: number, texto_pdf: string, guardar = true) {
  const res = await fetch(`${BASE}/catalogos/generar-y-guardar-patrones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subramo_id, texto_pdf, guardar }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json() as Promise<import('./types').PatronesGenerados>;
}

// ── Clasificador ──────────────────────────────────────────────────────────────

import type { ItemCola, ResultadoUpload, InfoClasificador } from './types';

export async function clasificadorInfo(): Promise<InfoClasificador> {
  const res = await fetch(`${BASE}/clasificador/info`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function uploadClasificador(files: File[]): Promise<ResultadoUpload[]> {
  const form = new FormData();
  files.forEach((f) => form.append('archivos', f));
  const res = await fetch(`${BASE}/clasificador/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

export async function getColaClasificador(estado?: string): Promise<ItemCola[]> {
  const url = estado
    ? `${BASE}/clasificador/cola?estado=${estado}`
    : `${BASE}/clasificador/cola`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function confirmarItemCola(
  id: number,
  override?: { compania_id?: number; ramo_id?: number; subramo_id?: number },
  enviar = true,
): Promise<ItemCola> {
  const res = await fetch(`${BASE}/clasificador/cola/${id}/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compania_id: override?.compania_id ?? null,
      ramo_id:     override?.ramo_id     ?? null,
      subramo_id:  override?.subramo_id  ?? null,
      enviar_entrenamiento: enviar,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
    throw new Error(err.detail ?? `Error ${res.status}`);
  }
  return res.json();
}

export async function confirmarLoteCola(): Promise<{ confirmados: number; errores: unknown[] }> {
  const res = await fetch(`${BASE}/clasificador/cola/confirmar-lote`, { method: 'POST' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function aprobarPatronesCola(
  id: number,
  patrones: { compania: string[]; ramo: string[]; subramo: string[] },
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/clasificador/cola/${id}/patrones/aprobar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patrones),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function descartarItemCola(id: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/clasificador/cola/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}
