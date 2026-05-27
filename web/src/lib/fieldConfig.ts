/**
 * Fuente única de verdad para labels y agrupaciones de campos.
 * Todos los nombres de campo coinciden con los usados en el backend
 * (campos_globales + campos_definidos normalizados).
 *
 * Importar así:
 *   import { FIELD_LABELS, fieldLabel, EXCEL_COLS } from '../lib/fieldConfig';
 */

// ── Labels de campo ───────────────────────────────────────────────────────────
export const FIELD_LABELS: Record<string, string> = {
  // — Identificación de póliza —
  documento:          'N° Póliza',
  numero_fianza:      'N° Fianza',
  agente:             'Agente',
  tipo_documento:     'Tipo Documento',
  sub_ramo_sicas:     'Subramo Sicas',
  renovacion:         'Renovación',

  // — Asegurado / Cliente —
  nombre_cliente:     'Cliente',          // campo legacy de especificos
  nombre:             'Nombre',
  apellido_paterno:   'Ap. Paterno',
  apellido_materno:   'Ap. Materno',
  razon_social:       'Razón Social',
  rfc:                'RFC',
  entidad:            'Entidad',
  ejecutivo_cuenta:   'Ejecutivo Cuenta',
  despacho:           'Despacho',
  vendedor:           'Vendedor',
  grupo:              'Grupo',

  // — Asegurado específico —
  nombre_asegurado:   'Asegurado',
  beneficiarios:      'Beneficiarios',
  beneficiario:       'Beneficiario',
  afianzado:          'Afianzado',
  fecha_nacimiento:   'Fecha Nacimiento',

  // — Vigencia (nombres canónicos = globales) —
  desde:              'Inicio Vigencia',
  hasta:              'Fin Vigencia',
  fecha_antiguedad:   'Fecha Antigüedad',
  estatus:            'Estatus',

  // — Pago —
  forma_pago:         'Forma Pago',
  moneda:             'Moneda',

  // — Primas —
  prima_neta:         'Prima Neta',
  descuento:          'Descuento',
  recargos:           'Recargos',
  derechos:           'Derechos/Gastos Exp.',
  sub_total:          'Subtotal',
  subtotal:           'Subtotal',          // alias por compatibilidad
  iva:                'IVA',
  prima_total:        'Prima Total',
  concepto:           'Concepto',

  // — Cobertura GMM / AYE —
  suma_asegurada:     'Suma Asegurada',
  deducible:          'Deducible',
  coaseguro:          'Coaseguro %',
  monto_afianzado:    'Monto Afianzado',

  // — Objeto / riesgo —
  objeto_asegurado:   'Objeto Asegurado',

  // — Vehículo —
  placas:             'Placas',
  serie:              'N° Serie',
  motor:              'N° Motor',
  modelo:             'Modelo (año)',
  descripcion_veh:    'Descripción Vehículo',
  tipo_vehiculo:      'Tipo Vehículo',
  nacional_importado: 'Nacional/Importado',

  // — Dirección —
  colonia:            'Colonia',
  municipio:          'Municipio',
  cp:                 'C.P.',
  estado:             'Estado',
};

/** Devuelve el label legible para un nombre de campo. */
export function fieldLabel(nombre: string): string {
  return FIELD_LABELS[nombre] ?? nombre;
}

// ── Columnas de la tabla resumen en Extractor ─────────────────────────────────
/** Campos a mostrar en la tabla de resultados (compacta). */
export const TABLA_COLS = [
  'documento',
  'nombre_cliente',
  'desde',
  'hasta',
  'placas',
  'prima_total',
] as const;

// ── Columnas del Excel exportado ──────────────────────────────────────────────
/** Campos exportados a XLSX, en orden. */
export const EXCEL_COLS: Array<{ campo: string; header: string }> = [
  // Identificación
  { campo: 'documento',          header: 'N° Póliza' },
  { campo: 'nombre_cliente',     header: 'Cliente' },
  { campo: 'rfc',                header: 'RFC' },
  { campo: 'entidad',            header: 'Entidad' },       // derivado de RFC
  { campo: 'forma_pago',         header: 'Forma Pago' },
  { campo: 'moneda',             header: 'Moneda' },
  // Vigencia
  { campo: 'desde',              header: 'Inicio Vigencia' },
  { campo: 'hasta',              header: 'Fin Vigencia' },
  // Vehículo
  { campo: 'placas',             header: 'Placas' },
  { campo: 'serie',              header: 'N° Serie' },
  { campo: 'motor',              header: 'N° Motor' },
  { campo: 'descripcion_veh',    header: 'Descripción Vehículo' },
  { campo: 'tipo_vehiculo',      header: 'Tipo Vehículo' },
  { campo: 'nacional_importado', header: 'Nacional/Importado' },
  // GMM / AYE
  { campo: 'suma_asegurada',     header: 'Suma Asegurada' },
  { campo: 'deducible',          header: 'Deducible' },
  { campo: 'coaseguro',          header: 'Coaseguro %' },
  // Primas
  { campo: 'prima_neta',         header: 'Prima Neta' },
  { campo: 'derechos',           header: 'Derechos/Gastos Exp.' },
  { campo: 'sub_total',          header: 'Subtotal' },
  { campo: 'iva',                header: 'IVA' },
  { campo: 'prima_total',        header: 'Prima Total' },
  // Dirección
  { campo: 'colonia',            header: 'Colonia' },
  { campo: 'municipio',          header: 'Municipio' },
  { campo: 'cp',                 header: 'C.P.' },
  { campo: 'estado',             header: 'Estado' },
];
