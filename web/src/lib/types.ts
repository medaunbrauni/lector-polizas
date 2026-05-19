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
  keywords: string[];
  activo: boolean;
}

export interface Ramo {
  id: number;
  nombre: string;
  compania_id: number;
  keywords: string[];
  activo: boolean;
}

export interface Subramo {
  id: number;
  nombre: string;
  ramo_id: number;
  keywords: string[];
  activo: boolean;
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
}
