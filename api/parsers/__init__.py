from .qualitas import QualitasParser
from .gnp import GNPParser

# Registro de parsers — en orden de prioridad de detección
PARSERS = [
    QualitasParser(),
    GNPParser(),
]
