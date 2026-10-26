/**
 * Fuente única de verdad para labels y agrupaciones de campos.
 * Todos los nombres de campo coinciden con los usados en el backend
 * (campos_globales + campos_definidos normalizados).
 *
 * Importar así:
 *   import { FIELD_LABELS, fieldLabel, EXCEL_COLS } from '../lib/fieldConfig';
 */

export const FIELD_LABELS: Record<string, string> = {
  documento:          'N° Póliza',
  numero_fianza:      'N° Fianza',
  agente:             'Agente',
  tipo_documento:     'Tipo Documento',
  sub_ramo_sicas:     'Subramo Sicas',
  renovacion:         'Renovación',

  nombre_cliente:     'Cliente',          // campo legacy de especificos
  rfc:                'RFC',
  entidad:            'Entidad',
  ejecutivo_cuenta:   'Ejecutivo Cuenta',
  grupo:              'Grupo',

  nombre_asegurado:   'Asegurado',
  beneficiarios:      'Beneficiarios',
  beneficiario:       'Beneficiario',
  afianzado:          'Afianzado',
  fecha_nacimiento:   'Fecha Nacimiento',

  desde:              'Inicio Vigencia',
  hasta:              'Fin Vigencia',
  estatus:            'Estatus',

  forma_pago:         'Forma Pago',
  moneda:             'Moneda',

  prima_neta:         'Prima Neta',
  descuento:          'Descuento',
  recargos:           'Recargos',
  derechos:           'Derechos/Gastos Exp.',
  sub_total:          'Subtotal',
  subtotal:           'Subtotal',          // alias por compatibilidad
  iva:                'IVA',
  prima_total:        'Prima Total',

  suma_asegurada:     'Suma Asegurada',
  deducible:          'Deducible',
  coaseguro:          'Coaseguro %',
  monto_afianzado:    'Monto Afianzado',

  objeto_asegurado:   'Objeto Asegurado',

  placas:             'Placas',
  serie:              'N° Serie',
  motor:              'N° Motor',
  modelo:             'Modelo (año)',
  descripcion_veh:    'Descripción Vehículo',
  tipo_vehiculo:      'Tipo Vehículo',

  direccion_completa: 'Dirección completa',
  colonia:            'Colonia',
  municipio:          'Municipio',
  cp:                 'C.P.',
  estado:             'Estado',
};

/** Devuelve el label legible para un nombre de campo. */
export function fieldLabel(nombre: string): string {
  return FIELD_LABELS[nombre] ?? nombre;
}

/**
 * Traduce el valor crudo de "entidad" ("0"/"1", código de catálogo Sicas)
 * a texto legible para el usuario. El valor "0"/"1" se conserva tal cual
 * en el dato interno/exportado a Sicas — esto es solo para presentación
 * (frontend y Excel).
 */
export function formatEntidad(valor: unknown): string {
  const v = String(valor ?? '').trim();
  if (v === '0') return 'Persona Física';
  if (v === '1') return 'Persona Moral';
  return v;
}

/** Campos a mostrar en la tabla de resultados (compacta). */
export const TABLA_COLS = [
  'documento',
  'nombre_cliente',
  'desde',
  'hasta',
  'placas',
  'prima_total',
] as const;

/** Campos exportados a XLSX, en orden. */
export const EXCEL_COLS: Array<{ campo: string; header: string }> = [
  { campo: 'documento',          header: 'N° Póliza' },
  { campo: 'nombre_cliente',     header: 'Cliente' },
  { campo: 'rfc',                header: 'RFC' },
  { campo: 'entidad',            header: 'Entidad' },       // derivado de RFC
  { campo: 'agente_clave',       header: 'Clave Agente' },
  { campo: 'forma_pago',         header: 'Forma Pago' },
  { campo: 'moneda',             header: 'Moneda' },
  { campo: 'desde',              header: 'Inicio Vigencia' },
  { campo: 'hasta',              header: 'Fin Vigencia' },
  { campo: 'placas',             header: 'Placas' },
  { campo: 'serie',              header: 'N° Serie' },
  { campo: 'motor',              header: 'N° Motor' },
  { campo: 'modelo',             header: 'Modelo (año)' },
  { campo: 'descripcion_veh',    header: 'Descripción Vehículo' },
  { campo: 'tipo_vehiculo',      header: 'Tipo Vehículo' },
  { campo: 'suma_asegurada',     header: 'Suma Asegurada' },
  { campo: 'deducible',          header: 'Deducible' },
  { campo: 'coaseguro',          header: 'Coaseguro %' },
  { campo: 'prima_neta',         header: 'Prima Neta' },
  { campo: 'descuento',          header: 'Descuento' },
  { campo: 'derechos',           header: 'Derechos/Gastos Exp.' },
  { campo: 'sub_total',          header: 'Subtotal' },
  { campo: 'iva',                header: 'IVA' },
  { campo: 'prima_total',        header: 'Prima Total' },
  { campo: 'colonia',            header: 'Colonia' },
  { campo: 'municipio',          header: 'Municipio' },
  { campo: 'cp',                 header: 'C.P.' },
  { campo: 'estado',             header: 'Estado' },
];
