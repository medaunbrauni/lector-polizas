from __future__ import annotations
import re
from .base import BaseParser
from ..models.poliza import PolizaExtraida, VehiculoData, DireccionData, PrimasData, VigenciaData


class GNPParser(BaseParser):
    KEYWORDS = ["gnp seguros", "grupo nacional provincial", "g.n.p."]

    def extraer(self, texto: str, nombre_archivo: str) -> PolizaExtraida:
        return PolizaExtraida(
            archivo=nombre_archivo,
            compania="GNP Seguros",
            ramo="autos",
            numero_poliza=self._re(texto, r"(?:N[uú]mero de P[oó]liza|P[oó]liza No\.?)[:\s]+([A-Z0-9\-]+)"),
            nombre_cliente=self._re(texto, r"(?:Contratante|Asegurado|Nombre)[:\s]+([^\n]+)"),
            rfc=self._re(texto, r"RFC[:\s]+([A-Z&]{3,4}\d{6}[A-Z0-9]{3})"),
            forma_pago=self._re(texto, r"Forma de Pago[:\s]+([^\n]+)"),
            moneda=self._re(texto, r"Moneda[:\s]+([^\n]+)"),
            vehiculo=VehiculoData(
                descripcion=self._re(texto, r"(?:Descripci[oó]n del Veh[ií]culo|Veh[ií]culo)[:\s]+([^\n]+)"),
                placas=self._re(texto, r"Placas[:\s]+([A-Z0-9\-]+)"),
                serie=self._re(texto, r"N[uú]mero de Serie[:\s]+([A-Z0-9]+)"),
                motor=self._re(texto, r"N[uú]mero de Motor[:\s]+([A-Z0-9]+)"),
                tipo=self._re(texto, r"Tipo[:\s]+([^\n]+)"),
            ),
            direccion=DireccionData(
                colonia=self._re(texto, r"Colonia[:\s]+([^\n,]+)"),
                municipio=self._re(texto, r"(?:Municipio|Delegaci[oó]n)[:\s]+([^\n,]+)"),
                cp=self._re(texto, r"C\.?P\.?[:\s]+(\d{5})"),
                estado=self._re(texto, r"Estado[:\s]+([^\n,]+)"),
            ),
            primas=PrimasData(
                prima_neta=self._re(texto, r"Prima Neta[:\s]+([\d,\.]+)"),
                derechos=self._re(texto, r"(?:Gastos de Expedici[oó]n|Derechos de P[oó]liza)[:\s]+([\d,\.]+)"),
                iva=self._re(texto, r"I\.?V\.?A\.?[:\s]+([\d,\.]+)"),
                prima_total=self._re(texto, r"Prima Total[:\s]+([\d,\.]+)"),
            ),
            vigencia=VigenciaData(
                inicio=self._re(texto, r"(?:Inicio|Desde)[:\s]+(\d{1,2}[/-]\w+[/-]\d{2,4})"),
                fin=self._re(texto, r"(?:Fin|Hasta|Vencimiento)[:\s]+(\d{1,2}[/-]\w+[/-]\d{2,4})"),
            ),
            metodo_extraccion="parser_gnp",
        )

    @staticmethod
    def _re(texto: str, patron: str) -> str | None:
        m = re.search(patron, texto, re.IGNORECASE)
        return m.group(1).strip() if m else None
