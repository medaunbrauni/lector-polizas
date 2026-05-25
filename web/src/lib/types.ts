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

export interface ResultadoPDF {
  id: number | null;
  archivo: string;
  compania: string | null;
  ramo: string | null;
  subramo: string | null;
  campos: Record<string, { valor: string | null; metodo: string; regla_id: number | null }>;
  stats: StatsExtraccion;
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
