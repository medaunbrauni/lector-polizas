from abc import ABC, abstractmethod
from ..models.poliza import PolizaExtraida


class BaseParser(ABC):
    """Interfaz común para todos los parsers de compañías."""

    # Palabras clave que identifican esta compañía en el texto del PDF
    KEYWORDS: list[str] = []

    @classmethod
    def detectar(cls, texto: str) -> bool:
        """Retorna True si el texto del PDF corresponde a esta compañía."""
        texto_lower = texto.lower()
        return any(k.lower() in texto_lower for k in cls.KEYWORDS)

    @abstractmethod
    def extraer(self, texto: str, nombre_archivo: str) -> PolizaExtraida:
        """Extrae datos estructurados del texto del PDF."""
        ...
