export type NivelConfianza = 'alta' | 'media' | 'baja' | 'sin_datos';

export interface ExtractionResponse {
  success: boolean;
  data: ResultadoPDF[];
  error?: string;
}

export interface CampoExtraido {
  nombre: string;
  valor: string | null;
  metodo: 'regla' | 'ia' | 'no_encontrado';
  regla_id: number | null;
}

export interface StatsExtraccion {
  por_regla: number;
  por_ia: number;
  no_encontrados: number;
}

export interface DeteccionInfo {
  confianza: NivelConfianza;
  score_compania: number;
  score_ramo: number;
  score_subramo: number;
  patrones_generados: boolean;
  patrones_nuevos: {
    compania?: string[];
    ramo?: string[];
    subramo?: string[];
    explicacion?: string;
  };
}

export interface ResultadoPDF {
  id: number | null;
  archivo: string;
  compania: string | null;
  ramo: string | null;
  subramo: string | null;
  campos: Record<string, { valor: string | null; metodo: string; regla_id: number | null }>;
  stats: StatsExtraccion;
  deteccion?: DeteccionInfo;
  error: string | null;
}

export interface Compania {
  id: number;
  nombre: string;
  nombre_exportacion: string | null;
  keywords: string[];
  patrones_deteccion: string[];
  activo: boolean;
  prioridad: number | null;
  porcentaje_docs: number | null;
}

export interface Ramo {
  id: number;
  nombre: string;
  nombre_exportacion: string | null;
  compania_id: number;
  keywords: string[];
  patrones_deteccion: string[];
  activo: boolean;
}

export interface Subramo {
  id: number;
  nombre: string;
  nombre_exportacion: string | null;
  ramo_id: number;
  keywords: string[];
  patrones_deteccion: string[];
  activo: boolean;
  prioridad: number | null;
  porcentaje_docs: number | null;
  cobertura: {
    total_campos: number;
    campos_con_regla: number;
    campos_sin_regla: number;
    porcentaje: number;
  };
}

export interface Campo {
  id: number;
  nombre: string;
  label: string;
  tipo: string;
  requerido: boolean;
  orden: number;
  es_global: boolean;
  grupo: string | null;
  valor_fijo: string | null;
  descripcion: string | null;
}

export interface TextoDisponible {
  id: number;
  nombre_archivo: string;
  created_at: string | null;
  texto_pdf: string;
}

export interface ResultadoRegexIA {
  patron_regex: string;
  explicacion: string;
  confianza: number;
  match_test: string | null;
  match_ok: boolean;
}

export interface BBox {
  page: number;
  x0: number;
  top: number;
  x1: number;
  bottom: number;
}

export interface Regla {
  id: number;
  subramo_id: number;
  nombre_campo: string;
  patron_regex: string;
  contexto_antes: string | null;
  contexto_despues: string | null;
  confianza: number;
  creado_por: string;
  activo: boolean;
  es_borrador: boolean;
  bbox: BBox | null;
}

// ── Entrenamiento por lotes ───────────────────────────────────────────────────

export interface PolizaEntrenamiento {
  id: number;
  subramo_id: number;
  nombre_archivo: string;
  paginas: number | null;
  num_selecciones: number;
  created_at: string | null;
}

export interface SeleccionCampo {
  id: number;
  poliza_id: number;
  nombre_campo: string;
  texto_seleccionado: string;
  contexto: string | null;
  bbox: BBox | null;
  es_auto: boolean;
  /** Método real de extracción cuando esta selección se sembró desde una
   * extracción real (regla/extractor_dedicado/valor_fijo/derivado/
   * no_encontrado). null en selecciones manuales de entrenamiento clásicas. */
  metodo: string | null;
}

/** {campo: {poliza_id: SeleccionCampo}} */
export type MapaSelecciones = Record<string, Record<number, SeleccionCampo>>;

export interface MatchLote {
  poliza_id: number;
  nombre_archivo: string;
  encontrado: boolean;
  valor_extraido: string | null;
  error: string | null;
}

export interface ResultadoRegexLote {
  patron_regex: string;
  explicacion: string;
  confianza: number;
  matches: MatchLote[];
  cobertura: number;
  total: number;
  pasa_lote: boolean;
}

export interface ReglaResumen {
  id: number;
  patron_regex: string;
  cobertura_lote: number | null;
  total_lote: number | null;
  creado_por: string;
}

export interface EstadoLote {
  polizas: PolizaEntrenamiento[];
  selecciones: MapaSelecciones;
  reglas: Record<string, ReglaResumen>;
}

export interface AutoDeteccion {
  poliza_id: number;
  nombre_archivo: string;
  encontrado: boolean;
  texto_encontrado: string | null;
  contexto: string | null;
}

// ── Detección automática ──────────────────────────────────────────────────────

export interface CandidatoCompania {
  id: number;
  nombre: string;
  score: number;
  n_patrones: number;
  n_keywords: number;
}

export interface ResultadoDeteccion {
  compania_id: number | null;
  compania_nombre: string | null;
  ramo_id: number | null;
  ramo_nombre: string | null;
  subramo_id: number | null;
  subramo_nombre: string | null;
  score_compania: number;
  score_ramo: number;
  score_subramo: number;
  confianza: NivelConfianza;
  candidatos_compania: CandidatoCompania[];
  texto_pdf?: string;
}

// ── Clasificador ──────────────────────────────────────────────────────────────

export type EstadoCola =
  | 'pendiente'
  | 'clasificado'
  | 'requiere_manual'
  | 'confirmado'
  | 'enviado'
  | 'error';

export interface ItemCola {
  id: number;
  nombre_archivo: string;
  paginas: number | null;
  estado: EstadoCola;
  error_msg: string | null;
  confianza: NivelConfianza | null;
  metodo: 'detector' | 'ia' | null;
  razon_ia: string | null;
  es_compania_nueva: boolean;
  compania_nombre_ia: string | null;
  ramo_nombre_ia: string | null;
  subramo_nombre_ia: string | null;
  // Propuesta
  compania_id_prop: number | null;
  compania_prop: string | null;
  ramo_id_prop: number | null;
  ramo_prop: string | null;
  subramo_id_prop: number | null;
  subramo_prop: string | null;
  // Final
  compania_id_final: number | null;
  compania_final: string | null;
  ramo_id_final: number | null;
  ramo_final: string | null;
  subramo_id_final: number | null;
  subramo_final: string | null;
  // Patrones
  patrones_generados: {
    compania: string[];
    ramo: string[];
    subramo: string[];
    explicacion: string;
  } | null;
  patrones_guardados: boolean;
  poliza_entrenamiento_id: number | null;
  created_at: string | null;
}

export interface ResultadoUpload {
  archivo: string;
  error?: string;
  advertencia?: string;
  item?: ItemCola;
}

export interface InfoClasificador {
  carpeta: string;
  watcher: { activo: boolean };
}

export interface PatronesGenerados {
  compania: string[];
  ramo: string[];
  subramo: string[];
  explicacion: string;
  compania_id: number;
  ramo_id: number;
  subramo_id: number;
  guardado: boolean;
  compania_patrones_total?: number;
  ramo_patrones_total?: number;
  subramo_patrones_total?: number;
}
