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
    keywords = Column(JSON, default=list)       # palabras clave para detección
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    ramos = relationship("Ramo", back_populates="compania", cascade="all, delete-orphan")


class Ramo(Base):
    __tablename__ = "ramos"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)
    compania_id = Column(Integer, ForeignKey("companias.id"), nullable=False)
    keywords = Column(JSON, default=list)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    compania = relationship("Compania", back_populates="ramos")
    subramos = relationship("Subramo", back_populates="ramo", cascade="all, delete-orphan")


class Subramo(Base):
    __tablename__ = "subramos"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)
    ramo_id = Column(Integer, ForeignKey("ramos.id"), nullable=False)
    keywords = Column(JSON, default=list)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    ramo = relationship("Ramo", back_populates="subramos")
    campos = relationship("CampoDefinido", back_populates="subramo", cascade="all, delete-orphan")
    reglas = relationship("ReglaExtraccion", back_populates="subramo", cascade="all, delete-orphan")


class CampoDefinido(Base):
    """Campos que se deben extraer para un Subramo específico."""
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
    creado_por = Column(String(30), default="manual")  # manual | ia | visual
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subramo = relationship("Subramo", back_populates="reglas")
    campo = relationship("CampoDefinido", back_populates="reglas")


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
