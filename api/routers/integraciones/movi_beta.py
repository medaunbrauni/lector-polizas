"""
Integración con MOVI (CRM BETA). Ver base.py para la lógica compartida.

Agregar otra integración (ej. la versión oficial de MOVI, u otro CRM) es
un archivo así de corto: elegir un `origen` único y su propia env var de
API key, y montar el router en main.py.
"""
from ...config import MOVI_BETA_API_KEY
from .base import crear_router_integracion

router = crear_router_integracion(origen="movi_beta", api_key_esperada=MOVI_BETA_API_KEY)
