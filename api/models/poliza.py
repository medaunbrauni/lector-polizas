from pydantic import BaseModel
from typing import Optional


class VehiculoData(BaseModel):
    descripcion: Optional[str] = None
    placas: Optional[str] = None
    serie: Optional[str] = None
    motor: Optional[str] = None
    tipo: Optional[str] = None
    nacional_importado: Optional[str] = None


class DireccionData(BaseModel):
    calle: Optional[str] = None
    colonia: Optional[str] = None
    municipio: Optional[str] = None
    cp: Optional[str] = None
    estado: Optional[str] = None


class PrimasData(BaseModel):
    prima_neta: Optional[str] = None
    tasa_financiamiento: Optional[str] = None
    derechos: Optional[str] = None          # Gastos de expedición / Derechos de póliza
    subtotal: Optional[str] = None
    iva: Optional[str] = None
    prima_total: Optional[str] = None


class VigenciaData(BaseModel):
    inicio: Optional[str] = None
    fin: Optional[str] = None


class PolizaExtraida(BaseModel):
    archivo: str
    compania: Optional[str] = None
    ramo: Optional[str] = None
    numero_poliza: Optional[str] = None
    nombre_cliente: Optional[str] = None
    rfc: Optional[str] = None
    forma_pago: Optional[str] = None
    moneda: Optional[str] = None
    vehiculo: Optional[VehiculoData] = None
    direccion: Optional[DireccionData] = None
    primas: Optional[PrimasData] = None
    vigencia: Optional[VigenciaData] = None
    # Si hubo error al procesar
    error: Optional[str] = None
    # Método usado para extraer
    metodo_extraccion: Optional[str] = None


class ExtractionResponse(BaseModel):
    success: bool
    data: list[PolizaExtraida] = []
    error: Optional[str] = None
