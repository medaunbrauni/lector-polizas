from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..models.db_models import Compania, Ramo, Subramo, CampoDefinido, CampoGlobal
from ..services.rule_engine import cobertura_subramo

router = APIRouter(prefix="/catalogos", tags=["Catálogos"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class CompaniaIn(BaseModel):
    nombre: str
    keywords: list[str] = []

class RamoIn(BaseModel):
    nombre: str
    compania_id: int
    keywords: list[str] = []

class SubramoIn(BaseModel):
    nombre: str
    ramo_id: int
    keywords: list[str] = []

class AliasIn(BaseModel):
    nombre_exportacion: str | None = None

class PatronesIn(BaseModel):
    patrones_deteccion: list[str] = []

class CampoIn(BaseModel):
    nombre: str
    label: str
    tipo: str = "texto"
    requerido: bool = False
    orden: int = 0


def _comp_dict(c: Compania) -> dict:
    return {
        "id": c.id, "nombre": c.nombre,
        "nombre_exportacion": c.nombre_exportacion,
        "keywords": c.keywords or [],
        "patrones_deteccion": c.patrones_deteccion or [],
        "activo": c.activo,
        "prioridad": c.prioridad,
        "porcentaje_docs": c.porcentaje_docs,
    }


def _ramo_dict(r: Ramo) -> dict:
    return {
        "id": r.id, "nombre": r.nombre,
        "nombre_exportacion": r.nombre_exportacion,
        "compania_id": r.compania_id,
        "keywords": r.keywords or [],
        "patrones_deteccion": r.patrones_deteccion or [],
        "activo": r.activo,
    }


def _subramo_dict(s: Subramo, db: Session) -> dict:
    cob = cobertura_subramo(s.id, db)
    return {
        "id": s.id, "nombre": s.nombre,
        "nombre_exportacion": s.nombre_exportacion,
        "ramo_id": s.ramo_id,
        "keywords": s.keywords or [],
        "patrones_deteccion": s.patrones_deteccion or [],
        "activo": s.activo,
        "prioridad": s.prioridad,
        "porcentaje_docs": s.porcentaje_docs,
        "cobertura": cob,
    }


# ── Compañías ────────────────────────────────────────────────────────────────

@router.get("/companias")
def listar_companias(db: Session = Depends(get_db)):
    rows = (
        db.query(Compania)
        .filter(Compania.activo == True)
        .order_by(Compania.prioridad.asc().nulls_last(), Compania.nombre)
        .all()
    )
    return [_comp_dict(c) for c in rows]

@router.post("/companias")
def crear_compania(data: CompaniaIn, db: Session = Depends(get_db)):
    c = Compania(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return _comp_dict(c)

@router.put("/companias/{id}")
def editar_compania(id: int, data: CompaniaIn, db: Session = Depends(get_db)):
    c = db.query(Compania).filter(Compania.id == id).first()
    if not c:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return _comp_dict(c)

@router.patch("/companias/{id}/alias")
def alias_compania(id: int, data: AliasIn, db: Session = Depends(get_db)):
    c = db.query(Compania).filter(Compania.id == id).first()
    if not c:
        raise HTTPException(404)
    c.nombre_exportacion = data.nombre_exportacion or None
    db.commit()
    return _comp_dict(c)

@router.patch("/companias/{id}/patrones")
def patrones_compania(id: int, data: PatronesIn, db: Session = Depends(get_db)):
    c = db.query(Compania).filter(Compania.id == id).first()
    if not c:
        raise HTTPException(404)
    c.patrones_deteccion = data.patrones_deteccion
    db.commit()
    return _comp_dict(c)

@router.delete("/companias/{id}")
def eliminar_compania(id: int, db: Session = Depends(get_db)):
    c = db.query(Compania).filter(Compania.id == id).first()
    if not c:
        raise HTTPException(404)
    c.activo = False
    db.commit()
    return {"ok": True}


# ── Ramos ────────────────────────────────────────────────────────────────────

@router.get("/ramos")
def listar_ramos(compania_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Ramo).filter(Ramo.activo == True)
    if compania_id:
        q = q.filter(Ramo.compania_id == compania_id)
    return [_ramo_dict(r) for r in q.order_by(Ramo.nombre).all()]

@router.post("/ramos")
def crear_ramo(data: RamoIn, db: Session = Depends(get_db)):
    r = Ramo(**data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return _ramo_dict(r)

@router.put("/ramos/{id}")
def editar_ramo(id: int, data: RamoIn, db: Session = Depends(get_db)):
    r = db.query(Ramo).filter(Ramo.id == id).first()
    if not r:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    return _ramo_dict(r)

@router.patch("/ramos/{id}/alias")
def alias_ramo(id: int, data: AliasIn, db: Session = Depends(get_db)):
    r = db.query(Ramo).filter(Ramo.id == id).first()
    if not r:
        raise HTTPException(404)
    r.nombre_exportacion = data.nombre_exportacion or None
    db.commit()
    return _ramo_dict(r)

@router.patch("/ramos/{id}/patrones")
def patrones_ramo(id: int, data: PatronesIn, db: Session = Depends(get_db)):
    r = db.query(Ramo).filter(Ramo.id == id).first()
    if not r:
        raise HTTPException(404)
    r.patrones_deteccion = data.patrones_deteccion
    db.commit()
    return _ramo_dict(r)


# ── Subramos ─────────────────────────────────────────────────────────────────

@router.get("/subramos")
def listar_subramos(ramo_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Subramo).filter(Subramo.activo == True)
    if ramo_id:
        q = q.filter(Subramo.ramo_id == ramo_id)
    items = q.order_by(Subramo.prioridad.asc().nulls_last(), Subramo.nombre).all()
    return [_subramo_dict(s, db) for s in items]

@router.post("/subramos")
def crear_subramo(data: SubramoIn, db: Session = Depends(get_db)):
    s = Subramo(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _subramo_dict(s, db)

@router.put("/subramos/{id}")
def editar_subramo(id: int, data: SubramoIn, db: Session = Depends(get_db)):
    s = db.query(Subramo).filter(Subramo.id == id).first()
    if not s:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return _subramo_dict(s, db)

@router.patch("/subramos/{id}/alias")
def alias_subramo(id: int, data: AliasIn, db: Session = Depends(get_db)):
    s = db.query(Subramo).filter(Subramo.id == id).first()
    if not s:
        raise HTTPException(404)
    s.nombre_exportacion = data.nombre_exportacion or None
    db.commit()
    return _subramo_dict(s, db)

@router.patch("/subramos/{id}/patrones")
def patrones_subramo(id: int, data: PatronesIn, db: Session = Depends(get_db)):
    s = db.query(Subramo).filter(Subramo.id == id).first()
    if not s:
        raise HTTPException(404)
    s.patrones_deteccion = data.patrones_deteccion
    db.commit()
    return _subramo_dict(s, db)


# ── Código de detección ───────────────────────────────────────────────────────

@router.get("/codigo-deteccion")
def codigo_deteccion(db: Session = Depends(get_db)):
    """Retorna jerarquía completa con keywords y patrones_deteccion para la vista de código."""
    companias = (
        db.query(Compania)
        .filter(Compania.activo == True)
        .order_by(Compania.prioridad.asc().nulls_last(), Compania.nombre)
        .all()
    )
    result = []
    for c in companias:
        ramos = db.query(Ramo).filter(Ramo.compania_id == c.id, Ramo.activo == True).order_by(Ramo.nombre).all()
        ramos_out = []
        for r in ramos:
            subramos = (
                db.query(Subramo)
                .filter(Subramo.ramo_id == r.id, Subramo.activo == True)
                .order_by(Subramo.prioridad.asc().nulls_last(), Subramo.nombre)
                .all()
            )
            ramos_out.append({
                "id": r.id,
                "nombre": r.nombre,
                "keywords": r.keywords or [],
                "patrones_deteccion": r.patrones_deteccion or [],
                "subramos": [
                    {
                        "id": s.id,
                        "nombre": s.nombre,
                        "keywords": s.keywords or [],
                        "patrones_deteccion": s.patrones_deteccion or [],
                    }
                    for s in subramos
                ],
            })
        result.append({
            "id": c.id,
            "nombre": c.nombre,
            "keywords": c.keywords or [],
            "patrones_deteccion": c.patrones_deteccion or [],
            "ramos": ramos_out,
        })
    return result


# ── Helpers de ramo ────────────────────────────────────────────────────────────

_VEHICULO_KW = ("vehículo", "vehiculo", "auto", "moto", "camión", "camion", "transporte", "carga")

def _es_vehiculo(nombre_ramo: str) -> bool:
    n = nombre_ramo.lower()
    return any(kw in n for kw in _VEHICULO_KW)


def _ramo_de_subramo(subramo_id: int, db: Session) -> Ramo | None:
    s = db.query(Subramo).filter(Subramo.id == subramo_id).first()
    if not s:
        return None
    return db.query(Ramo).filter(Ramo.id == s.ramo_id).first()


def _campo_global_dict(c: CampoGlobal) -> dict:
    return {
        "id": c.id,
        "nombre": c.nombre,
        "label": c.label,
        "tipo": c.tipo,
        "requerido": c.requerido,
        "orden": c.orden,
        "es_global": True,
        "grupo": c.grupo,
        "valor_fijo": c.valor_fijo,
        "descripcion": c.descripcion,
    }


def _campo_def_dict(c: CampoDefinido) -> dict:
    return {
        "id": c.id,
        "nombre": c.nombre,
        "label": c.label,
        "tipo": c.tipo,
        "requerido": c.requerido,
        "orden": c.orden,
        "es_global": False,
        "grupo": None,
        "valor_fijo": None,
        "descripcion": None,
    }


# ── Campos definidos ──────────────────────────────────────────────────────────

@router.get("/subramos/{subramo_id}/campos")
def listar_campos(subramo_id: int, db: Session = Depends(get_db)):
    ramo = _ramo_de_subramo(subramo_id, db)
    es_veh = _es_vehiculo(ramo.nombre if ramo else "")

    # Campos globales: todos los que aplican (filtrar grupo vehiculos si no corresponde)
    q_glob = db.query(CampoGlobal)
    if not es_veh:
        q_glob = q_glob.filter(
            (CampoGlobal.grupo == None) | (CampoGlobal.grupo != "vehiculos")
        )
    globales = q_glob.order_by(CampoGlobal.orden).all()

    # Campos específicos del subramo (excluir los que ya cubren un global con mismo nombre)
    nombres_globales = {c.nombre for c in globales}
    especificos = (
        db.query(CampoDefinido)
        .filter(
            CampoDefinido.subramo_id == subramo_id,
            CampoDefinido.nombre.notin_(nombres_globales),
        )
        .order_by(CampoDefinido.orden)
        .all()
    )

    return [_campo_global_dict(c) for c in globales] + [_campo_def_dict(c) for c in especificos]


@router.post("/subramos/{subramo_id}/campos")
def crear_campo(subramo_id: int, data: CampoIn, db: Session = Depends(get_db)):
    c = CampoDefinido(subramo_id=subramo_id, **data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return _campo_def_dict(c)
