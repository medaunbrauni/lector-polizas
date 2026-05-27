"""Modelos ORM de la base de datos."""
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Float,
    ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship
from ..database import Base


class Compania(Base):
    __tablename__ = "companias"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False, unique=True)
    nombre_exportacion = Column(String(120), nullable=True)   # alias para mesa de control
    keywords = Column(JSON, default=list)
    patrones_deteccion = Column(JSON, default=list)           # regex para detectar en PDF
    activo = Column(Boolean, default=True)
    prioridad = Column(Integer, nullable=True)
    porcentaje_docs = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    ramos = relationship("Ramo", back_populates="compania", cascade="all, delete-orphan")


class Ramo(Base):
    __tablename__ = "ramos"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)
    nombre_exportacion = Column(String(120), nullable=True)
    compania_id = Column(Integer, ForeignKey("companias.id"), nullable=False)
    keywords = Column(JSON, default=list)
    patrones_deteccion = Column(JSON, default=list)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    compania = relationship("Compania", back_populates="ramos")
    subramos = relationship("Subramo", back_populates="ramo", cascade="all, delete-orphan")


class Subramo(Base):
    __tablename__ = "subramos"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)
    nombre_exportacion = Column(String(120), nullable=True)
    ramo_id = Column(Integer, ForeignKey("ramos.id"), nullable=False)
    keywords = Column(JSON, default=list)
    patrones_deteccion = Column(JSON, default=list)
    activo = Column(Boolean, default=True)
    prioridad = Column(Integer, nullable=True)
    porcentaje_docs = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    ramo = relationship("Ramo", back_populates="subramos")
    campos = relationship("CampoDefinido", back_populates="subramo", cascade="all, delete-orphan")
    reglas = relationship("ReglaExtraccion", back_populates="subramo", cascade="all, delete-orphan")


class CampoGlobal(Base):
    """Campos estándar que se exportan para TODOS los subramos (esquema mesa de control Sicas)."""
    __tablename__ = "campos_globales"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(80), nullable=False, unique=True)
    label = Column(String(120), nullable=False)
    tipo = Column(String(30), default="texto")       # texto | numero | moneda | fecha | catalogo
    requerido = Column(Boolean, default=False)
    orden = Column(Integer, default=0)
    grupo = Column(String(40), nullable=True)         # None=todos, "vehiculos"=solo ramos de autos
    valor_fijo = Column(String(120), nullable=True)   # si no es null, siempre este valor (sin necesitar regex)
    descripcion = Column(Text, nullable=True)


class CampoDefinido(Base):
    """Campos adicionales específicos de un Subramo (complementan los CampoGlobal)."""
    __tablename__ = "campos_definidos"
    id = Column(Integer, primary_key=True)
    subramo_id = Column(Integer, ForeignKey("subramos.id"), nullable=False)
    nombre = Column(String(80), nullable=False)    # clave interna: "numero_poliza"
    label = Column(String(120), nullable=False)    # etiqueta UI: "Número de Póliza"
    tipo = Column(String(30), default="texto")     # texto | numero | moneda | fecha
    requerido = Column(Boolean, default=False)
    orden = Column(Integer, default=0)

    subramo = relationship("Subramo", back_populates="campos")
    reglas = relationship("ReglaExtraccion", back_populates="campo")


class ReglaExtraccion(Base):
    """Regex para extraer un campo específico en un subramo."""
    __tablename__ = "reglas_extraccion"
    id = Column(Integer, primary_key=True)
    subramo_id = Column(Integer, ForeignKey("subramos.id"), nullable=False)
    campo_id = Column(Integer, ForeignKey("campos_definidos.id"), nullable=True)
    nombre_campo = Column(String(80), nullable=False)
    patron_regex = Column(Text, nullable=False)
    contexto_antes = Column(Text)           # texto capturado antes del valor
    contexto_despues = Column(Text)         # texto capturado después del valor
    ejemplos = Column(JSON, default=list)   # valores de muestra que matchean
    confianza = Column(Float, default=1.0)  # 0.0-1.0
    activo = Column(Boolean, default=True)
    es_borrador = Column(Boolean, default=False)       # guardado sin confirmar coincidencia
    bbox = Column(JSON, nullable=True)                 # {page,x0,top,x1,bottom} normalizados 0-1
    ocr_bbox = Column(JSON, nullable=True)             # bbox para extracción OCR desde imagen
    cobertura_lote = Column(Integer, nullable=True)    # cuántos PDFs del lote matchean
    total_lote = Column(Integer, nullable=True)        # total PDFs en el lote de entrenamiento
    creado_por = Column(String(30), default="manual")  # manual | ia | lote
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subramo = relationship("Subramo", back_populates="reglas")
    campo = relationship("CampoDefinido", back_populates="reglas")


class PolizaEntrenamiento(Base):
    """PDF subido al lote de entrenamiento de un subramo."""
    __tablename__ = "polizas_entrenamiento"
    id = Column(Integer, primary_key=True)
    subramo_id = Column(Integer, ForeignKey("subramos.id"), nullable=False)
    nombre_archivo = Column(String(255), nullable=False)
    ruta_archivo = Column(String(512), nullable=False)   # ruta local en disco
    texto_pdf = Column(Text, nullable=True)              # texto extraído por pdfplumber
    paginas = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    selecciones = relationship(
        "SeleccionCampo", back_populates="poliza", cascade="all, delete-orphan"
    )


class SeleccionCampo(Base):
    """Selección manual de un valor en un PDF de entrenamiento."""
    __tablename__ = "selecciones_campo"
    id = Column(Integer, primary_key=True)
    poliza_id = Column(Integer, ForeignKey("polizas_entrenamiento.id"), nullable=False)
    nombre_campo = Column(String(80), nullable=False)
    texto_seleccionado = Column(String(1000), nullable=True)
    contexto = Column(Text, nullable=True)               # ±300 chars alrededor del valor
    bbox = Column(JSON, nullable=True)                   # {page, top, bottom} normalizado 0-1
    es_auto = Column(Boolean, default=False)             # True si fue auto-detectado por el sistema
    created_at = Column(DateTime, default=datetime.utcnow)

    poliza = relationship("PolizaEntrenamiento", back_populates="selecciones")


class ClasificacionCola(Base):
    """Cola de PDFs subidos para clasificación antes de ir a entrenamiento."""
    __tablename__ = "clasificacion_cola"
    id = Column(Integer, primary_key=True)
    nombre_archivo = Column(String(255), nullable=False)
    ruta_archivo = Column(String(512), nullable=False)
    sha256 = Column(String(64), unique=True, nullable=False)
    texto_pdf = Column(Text, nullable=True)
    paginas = Column(Integer, nullable=True)

    # Estado: pendiente | clasificado | requiere_manual | confirmado | enviado | error
    estado = Column(String(30), default="pendiente")
    error_msg = Column(Text, nullable=True)

    # Clasificación propuesta (detector o IA)
    compania_id_prop = Column(Integer, ForeignKey("companias.id"), nullable=True)
    ramo_id_prop = Column(Integer, ForeignKey("ramos.id"), nullable=True)
    subramo_id_prop = Column(Integer, ForeignKey("subramos.id"), nullable=True)
    confianza = Column(String(20), nullable=True)    # alta | media | baja | sin_datos
    metodo = Column(String(20), nullable=True)        # detector | ia
    razon_ia = Column(Text, nullable=True)
    es_compania_nueva = Column(Boolean, default=False)
    compania_nombre_ia = Column(String(120), nullable=True)
    ramo_nombre_ia = Column(String(120), nullable=True)
    subramo_nombre_ia = Column(String(120), nullable=True)

    # Clasificación final (confirmada por usuario)
    compania_id_final = Column(Integer, ForeignKey("companias.id"), nullable=True)
    ramo_id_final = Column(Integer, ForeignKey("ramos.id"), nullable=True)
    subramo_id_final = Column(Integer, ForeignKey("subramos.id"), nullable=True)

    # Patrones de detección generados por IA (para revisión)
    patrones_generados = Column(JSON, nullable=True)
    patrones_guardados = Column(Boolean, default=False)

    # Referencia al entrenamiento al que fue enviado
    poliza_entrenamiento_id = Column(Integer, ForeignKey("polizas_entrenamiento.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CarpetaVigilada(Base):
    """Carpetas cuya actividad vigila el watchdog."""
    __tablename__ = "carpetas_vigiladas"
    id = Column(Integer, primary_key=True)
    ruta = Column(String(512), unique=True, nullable=False)
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Extraccion(Base):
    """Historial de cada PDF procesado."""
    __tablename__ = "extracciones"
    id = Column(Integer, primary_key=True)
    nombre_archivo = Column(String(255), nullable=False)
    compania_id = Column(Integer, ForeignKey("companias.id"), nullable=True)
    ramo_id = Column(Integer, ForeignKey("ramos.id"), nullable=True)
    subramo_id = Column(Integer, ForeignKey("subramos.id"), nullable=True)
    compania_detectada = Column(String(120))   # nombre tal como se detectó
    ramo_detectado = Column(String(120))
    subramo_detectado = Column(String(120))
    metodo_deteccion = Column(String(30))      # keywords | ai | manual
    datos_completos = Column(JSON, default=dict)
    texto_pdf = Column(Text)                   # texto extraído del PDF (para el rule builder)
    exitoso = Column(Boolean, default=True)
    mensaje_error = Column(Text)
    campos_por_regla = Column(Integer, default=0)
    campos_por_ia = Column(Integer, default=0)
    campos_no_encontrados = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    campos_extraidos = relationship("CampoExtraido", back_populates="extraccion", cascade="all, delete-orphan")


class CampoExtraido(Base):
    """Valor individual extraído de un PDF, con trazabilidad."""
    __tablename__ = "campos_extraidos"
    id = Column(Integer, primary_key=True)
    extraccion_id = Column(Integer, ForeignKey("extracciones.id"), nullable=False)
    nombre_campo = Column(String(80), nullable=False)
    valor = Column(Text)
    metodo = Column(String(20), default="ia")   # regla | ia | no_encontrado
    regla_id = Column(Integer, ForeignKey("reglas_extraccion.id"), nullable=True)
    confianza = Column(Float, default=1.0)

    extraccion = relationship("Extraccion", back_populates="campos_extraidos")
