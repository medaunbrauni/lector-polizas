import re
from .base import BaseParser
from ..models.poliza import PolizaExtraida, VehiculoData, DireccionData, PrimasData, VigenciaData


class QualitasParser(BaseParser):
    KEYWORDS = ["qualitas", "quálitas", "q seguros"]

    def extraer(self, texto: str, nombre_archivo: str) -> PolizaExtraida:
        return PolizaExtraida(
            archivo=nombre_archivo,
            compania="Quálitas",
            ramo="autos",
            numero_poliza=self._re(texto, r"(?:P[oó]liza|N[uú]mero de P[oó]liza)[:\s]+([A-Z0-9\-]+)"),
            nombre_cliente=self._re(texto, r"(?:Nombre|Raz[oó]n Social|Asegurado)[:\s]+([^\n]+)"),
            rfc=self._re(texto, r"RFC[:\s]+([A-Z&]{3,4}\d{6}[A-Z0-9]{3})"),
            forma_pago=self._re(texto, r"Forma de Pago[:\s]+([^\n]+)"),
            moneda=self._re(texto, r"Moneda[:\s]+([^\n]+)"),
            vehiculo=VehiculoData(
                descripcion=self._re(texto, r"(?:Descripci[oó]n|Versi[oó]n)[:\s]+([^\n]+)"),
                placas=self._re(texto, r"Placas[:\s]+([A-Z0-9\-]+)"),
                serie=self._re(texto, r"(?:Serie|N[uú]mero de Serie)[:\s]+([A-Z0-9]+)"),
                motor=self._re(texto, r"(?:Motor|N[uú]mero de Motor)[:\s]+([A-Z0-9]+)"),
                tipo=self._re(texto, r"Tipo de Veh[ií]culo[:\s]+([^\n]+)"),
                nacional_importado=self._re(texto, r"(?:Nacional|Importado)[:\s]+([^\n]+)"),
            ),
            direccion=DireccionData(
                colonia=self._re(texto, r"Col(?:onia)?[:\.\s]+([^\n,]+)"),
                municipio=self._re(texto, r"(?:Municipio|Alcald[ií]a)[:\s]+([^\n,]+)"),
                cp=self._re(texto, r"C\.?P\.?[:\s]+(\d{5})"),
            ),
            primas=PrimasData(
                prima_neta=self._re(texto, r"Prima Neta[:\s]+([\d,\.]+)"),
                tasa_financiamiento=self._re(texto, r"Tasa de Financiamiento[:\s]+([\d,\.%]+)"),
                gastos_expedicion=self._re(texto, r"Gastos de Expedici[oó]n[:\s]+([\d,\.]+)"),
                subtotal=self._re(texto, r"Subtotal[:\s]+([\d,\.]+)"),
                iva=self._re(texto, r"I\.?V\.?A\.?[:\s]+([\d,\.]+)"),
                prima_total=self._re(texto, r"Prima Total[:\s]+([\d,\.]+)"),
            ),
            vigencia=VigenciaData(
                inicio=self._re(texto, r"(?:Inicio de Vigencia|Inicio)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"),
                fin=self._re(texto, r"(?:Fin de Vigencia|Fin)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"),
            ),
            metodo_extraccion="parser_qualitas",
        )

    @staticmethod
    def _re(texto: str, patron: str) -> str | None:
        m = re.search(patron, texto, re.IGNORECASE)
        return m.group(1).strip() if m else None
