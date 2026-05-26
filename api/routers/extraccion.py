from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.extractor import procesar_pdf, extraer_texto_pdf
from ..services.detector import detectar_jerarquia, detectar_con_score
from ..models.db_models import Extraccion, CampoExtraido, Subramo, Ramo, Compania

router = APIRouter(prefix="/extraer", tags=["Extracción"])

# ── Límites de subida ─────────────────────────────────────────────────────────
MAX_FILES_PER_REQUEST = 50
MAX_FILE_MB           = 15
MAX_FILE_BYTES        = MAX_FILE_MB * 1024 * 1024


class ReaplicarIn(BaseModel):
    extraccion_id: int
    subramo_id: int


@router.post("/reaplicar")
def reaplicar_con_subramo(data: ReaplicarIn, db: Session = Depends(get_db)):
    """
    Vuelve a aplicar las reglas de extracción sobre una póliza ya procesada,
    usando un subramo seleccionado manualmente.
    No requiere re-subir el PDF — usa el texto_pdf almacenado.
    """
    extraccion = db.query(Extraccion).filter(Extraccion.id == data.extraccion_id).first()
    if not extraccion:
        raise HTTPException(404, "Extracción no encontrada")
    if not extraccion.texto_pdf:
        raise HTTPException(422, "Esta extracción no tiene texto almacenado")

    subramo = db.query(Subramo).filter(Subramo.id == data.subramo_id).first()
    if not subramo:
        raise HTTPException(404, "Subramo no encontrado")
    ramo     = db.query(Ramo).filter(Ramo.id == subramo.ramo_id).first()
    compania = db.query(Compania).filter(Compania.id == ramo.compania_id).first()

    # Re-aplicar reglas con el nuevo subramo
    from ..services.rule_engine import aplicar_reglas, campos_sin_regla
    from ..models.db_models import CampoDefinido

    texto = extraccion.texto_pdf
    datos_reglas   = aplicar_reglas(texto, subramo.id, db)
    campos_cubiertos = {k for k, v in datos_reglas.items() if v["metodo"] == "regla"}
    campos_faltantes = campos_sin_regla(subramo.id, campos_cubiertos, db)

    # Consolidar sin doble conteo
    datos_finales: dict = {**datos_reglas}
    for campo in campos_faltantes:
        datos_finales[campo.nombre] = {"valor": None, "metodo": "no_encontrado", "regla_id": None}

    por_regla      = sum(1 for v in datos_finales.values() if v["metodo"] == "regla")
    no_encontrados = sum(
        1 for v in datos_finales.values()
        if v["metodo"] not in ("regla", "valor_fijo", "derivado")
    )

    # Actualizar registro de extracción
    extraccion.subramo_id         = subramo.id
    extraccion.ramo_id            = ramo.id
    extraccion.compania_id        = compania.id
    extraccion.subramo_detectado  = subramo.nombre
    extraccion.ramo_detectado     = ramo.nombre
    extraccion.compania_detectada = compania.nombre
    extraccion.metodo_deteccion   = "manual"
    extraccion.datos_completos    = {k: v.get("valor") for k, v in datos_finales.items()}
    extraccion.campos_por_regla   = por_regla
    extraccion.campos_por_ia      = 0
    extraccion.campos_no_encontrados = no_encontrados

    # Reemplazar campos extraídos
    db.query(CampoExtraido).filter(CampoExtraido.extraccion_id == extraccion.id).delete()
    for nombre, info in datos_finales.items():
        db.add(CampoExtraido(
            extraccion_id=extraccion.id,
            nombre_campo=nombre,
            valor=info.get("valor"),
            metodo=info.get("metodo", "no_encontrado"),
            regla_id=info.get("regla_id"),
        ))

    db.commit()

    return {
        "id":       extraccion.id,
        "archivo":  extraccion.nombre_archivo,
        "compania": compania.nombre,
        "ramo":     ramo.nombre,
        "subramo":  subramo.nombre,
        "campos":   datos_finales,
        "stats": {
            "por_regla":      por_regla,
            "por_ia":         0,
            "no_encontrados": no_encontrados,
        },
        "deteccion": {
            "confianza":          "alta",
            "score_compania":     99,
            "score_ramo":         99,
            "score_subramo":      99,
            "patrones_generados": False,
            "patrones_nuevos":    {},
        },
        "error": None,
    }


@router.post("")
async def extraer_polizas(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    # Validar cantidad
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(400, f"Máximo {MAX_FILES_PER_REQUEST} archivos por solicitud")
    if not files:
        raise HTTPException(400, "Se requiere al menos un archivo PDF")

    resultados = []
    for archivo in files:
        # Validar extensión
        if not archivo.filename or not archivo.filename.lower().endswith(".pdf"):
            resultados.append({
                "archivo": archivo.filename or "desconocido",
                "error": "Solo se aceptan archivos PDF",
            })
            continue

        # Validar tamaño antes de leer completo
        if archivo.size and archivo.size > MAX_FILE_BYTES:
            resultados.append({
                "archivo": archivo.filename,
                "error": f"El archivo excede el límite de {MAX_FILE_MB} MB",
            })
            continue

        contenido = await archivo.read()

        # Doble-check de tamaño una vez leído (por si size no estaba disponible)
        if len(contenido) > MAX_FILE_BYTES:
            resultados.append({
                "archivo": archivo.filename,
                "error": f"El archivo excede el límite de {MAX_FILE_MB} MB",
            })
            continue

        resultado = procesar_pdf(contenido, archivo.filename, db)
        resultados.append(resultado)

    return {"success": True, "data": resultados}


@router.post("/identificar-modulo")
async def identificar_modulo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Detecta compañía, ramo y subramo de un PDF sin guardar extracción."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo se aceptan archivos PDF")

    if file.size and file.size > MAX_FILE_BYTES:
        raise HTTPException(400, f"El archivo excede el límite de {MAX_FILE_MB} MB")

    contenido = await file.read()
    try:
        texto = extraer_texto_pdf(contenido)
    except Exception as e:
        raise HTTPException(422, f"No se pudo leer el PDF: {e}")
    if not texto.strip():
        raise HTTPException(422, "PDF sin texto extraíble (posiblemente escaneado)")

    resultado = detectar_con_score(texto, db)
    resultado["texto_pdf"] = texto[:50_000]
    return resultado


@router.get("/historial")
def historial(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    total = db.query(Extraccion).count()
    items = (
        db.query(Extraccion)
        .order_by(Extraccion.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Pre-cargar aliases en 3 queries (evita N+1)
    comp_ids = {e.compania_id for e in items if e.compania_id}
    ramo_ids = {e.ramo_id     for e in items if e.ramo_id}
    sub_ids  = {e.subramo_id  for e in items if e.subramo_id}

    comp_alias = {}
    ramo_alias = {}
    sub_alias  = {}

    if comp_ids:
        comp_alias = {
            c.id: c.nombre_exportacion
            for c in db.query(Compania).filter(Compania.id.in_(comp_ids)).all()
        }
    if ramo_ids:
        ramo_alias = {
            r.id: r.nombre_exportacion
            for r in db.query(Ramo).filter(Ramo.id.in_(ramo_ids)).all()
        }
    if sub_ids:
        sub_alias = {
            s.id: s.nombre_exportacion
            for s in db.query(Subramo).filter(Subramo.id.in_(sub_ids)).all()
        }

    aliases = (comp_alias, ramo_alias, sub_alias)

    return {
        "total": total,
        "items": [_extraccion_schema(e, aliases=aliases) for e in items],
    }


@router.get("/historial/{extraccion_id}")
def detalle_extraccion(extraccion_id: int, db: Session = Depends(get_db)):
    e = db.query(Extraccion).filter(Extraccion.id == extraccion_id).first()
    if not e:
        raise HTTPException(404, "Extracción no encontrada")
    return _extraccion_schema(e, db=db, detalle=True)


def _extraccion_schema(
    e: Extraccion,
    db: Session | None = None,
    detalle: bool = False,
    aliases: tuple | None = None,   # (comp_alias, ramo_alias, sub_alias) pre-cargados
) -> dict:
    from ..models.db_models import Compania, Ramo, Subramo as SubramoModel

    def _export_name(id_val, model_cls, fallback: str | None, alias_dict: dict) -> str | None:
        # Primero intenta el dict pre-cargado (O(1), sin query)
        if id_val and alias_dict:
            alias = alias_dict.get(id_val)
            if alias:
                return alias
        # Fallback: query individual (solo en vista de detalle)
        if db and id_val:
            obj = db.query(model_cls).filter(model_cls.id == id_val).first()
            if obj and obj.nombre_exportacion:
                return obj.nombre_exportacion
        return fallback

    comp_alias, ramo_alias, sub_alias = aliases if aliases else ({}, {}, {})

    base = {
        "id":      e.id,
        "archivo": e.nombre_archivo,
        "compania": _export_name(e.compania_id, Compania, e.compania_detectada, comp_alias),
        "ramo":     _export_name(e.ramo_id,     Ramo,     e.ramo_detectado,     ramo_alias),
        "subramo":  _export_name(e.subramo_id,  SubramoModel, e.subramo_detectado, sub_alias),
        "exitoso":              e.exitoso,
        "campos_por_regla":    e.campos_por_regla,
        "campos_por_ia":       e.campos_por_ia,
        "campos_no_encontrados": e.campos_no_encontrados,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
    if detalle:
        base["datos_completos"] = e.datos_completos
        base["campos_extraidos"] = [
            {
                "nombre":   c.nombre_campo,
                "valor":    c.valor,
                "metodo":   c.metodo,
                "regla_id": c.regla_id,
            }
            for c in e.campos_extraidos
        ]
    return base
