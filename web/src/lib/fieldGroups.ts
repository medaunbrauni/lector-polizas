/**
 * Agrupamiento visual de campos, compartido por las pestañas "Campos" /
 * "Entrenar/Corregir" del Entrenador (Reglas.tsx) y el modal de detalle
 * del Extractor (PolizaDetalle.tsx) — mismos 5 grupos y mismo orden en
 * los 3 lugares. Responsabilidad distinta de fieldConfig.ts (que traduce
 * nombre -> label / columnas de Excel, pero no agrupa).
 */
export interface GrupoCampos {
  titulo: string;
  campos: string[];
}

export const GRUPOS_CAMPOS: GrupoCampos[] = [
  { titulo: 'Datos del sistema', campos: ['grupo', 'tipo_documento', 'sub_ramo_sicas', 'renovacion', 'estatus'] },
  { titulo: 'Datos de Póliza', campos: ['documento', 'desde', 'hasta', 'agente_clave', 'agente_nombre'] },
  { titulo: 'Datos del contratante', campos: ['nombre_cliente', 'rfc', 'direccion_completa', 'colonia', 'municipio', 'cp'] },
  { titulo: 'Datos del vehículo', campos: ['descripcion_veh', 'tipo_vehiculo', 'serie', 'modelo', 'motor', 'placas'] },
  // "sub_total", no "subtotal": es el nombre real en campos_globales y en
  // los datos de extracción — "subtotal" solo existe como alias de
  // compatibilidad en fieldConfig.ts, nunca como nombre de campo real.
  { titulo: 'Datos', campos: ['forma_pago', 'moneda', 'prima_neta', 'derechos', 'descuento', 'recargos', 'iva', 'sub_total', 'prima_total'] },
];

export const OTROS_TITULO = 'Otros';

/**
 * Sobreescritura de label SOLO para presentación (no toca
 * campos_globales.label / campos_definidos.label en BD, ni el
 * nombre_campo real usado en backend/exportación).
 */
export const OVERRIDES_LABEL: Record<string, string> = {
  documento: 'Documento/Número de Póliza',
};

export function labelCampo(nombre: string, labelOriginal: string): string {
  return OVERRIDES_LABEL[nombre] ?? labelOriginal;
}

/**
 * Agrupa `items` según GRUPOS_CAMPOS, en el orden ahí definido, y agrega
 * al final un grupo "Otros" con lo que no calzó en ningún grupo — para
 * no perder silenciosamente un campo legacy o nuevo que se nos escapó.
 * Genérico sobre la forma del item: cada consumidor decide su propio tipo
 * (Campo en Reglas.tsx, [nombre, valor] en PolizaDetalle.tsx, etc.) y solo
 * indica cómo sacarle el nombre de campo real.
 */
export function agruparCampos<T>(
  items: T[],
  nombreDe: (item: T) => string,
): { titulo: string; items: T[] }[] {
  const restantes = new Map(items.map((item) => [nombreDe(item), item]));
  const grupos = GRUPOS_CAMPOS.map(({ titulo, campos }) => {
    const enGrupo: T[] = [];
    for (const nombre of campos) {
      const item = restantes.get(nombre);
      if (item !== undefined) {
        enGrupo.push(item);
        restantes.delete(nombre);
      }
    }
    return { titulo, items: enGrupo };
  }).filter((g) => g.items.length > 0);

  if (restantes.size > 0) {
    grupos.push({ titulo: OTROS_TITULO, items: [...restantes.values()] });
  }
  return grupos;
}
