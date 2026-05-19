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
