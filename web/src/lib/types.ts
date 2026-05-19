export interface VehiculoData {
  descripcion?: string;
  placas?: string;
  serie?: string;
  motor?: string;
  tipo?: string;
  nacional_importado?: string;
}

export interface DireccionData {
  calle?: string;
  colonia?: string;
  municipio?: string;
  cp?: string;
  estado?: string;
}

export interface PrimasData {
  prima_neta?: string;
  tasa_financiamiento?: string;
  gastos_expedicion?: string;
  subtotal?: string;
  iva?: string;
  prima_total?: string;
}

export interface VigenciaData {
  inicio?: string;
  fin?: string;
}

export interface PolizaExtraida {
  archivo: string;
  compania?: string;
  ramo?: string;
  numero_poliza?: string;
  nombre_cliente?: string;
  rfc?: string;
  forma_pago?: string;
  moneda?: string;
  vehiculo?: VehiculoData;
  direccion?: DireccionData;
  primas?: PrimasData;
  vigencia?: VigenciaData;
  error?: string;
  metodo_extraccion?: string;
}

export interface ExtractionResponse {
  success: boolean;
  data: PolizaExtraida[];
  error?: string;
}
