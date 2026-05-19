from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..models.db_models import Compania, Ramo, Subramo, CampoDefinido
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

class CampoIn(BaseModel):
    nombre: str
    label: str
    tipo: str = "texto"
    requerido: bool = False
    orden: int = 0


# ── Compañías ────────────────────────────────────────────────────────────────

@router.get("/companias")
def listar_companias(db: Session = Depends(get_db)):
    return db.query(Compania).order_by(Compania.nombre).all()

@router.post("/companias")
def crear_compania(data: CompaniaIn, db: Session = Depends(get_db)):
    c = Compania(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@router.put("/companias/{id}")
def editar_compania(id: int, data: CompaniaIn, db: Session = Depends(get_db)):
    c = db.query(Compania).filter(Compania.id == id).first()
    if not c:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return c

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
    q = db.query(Ramo)
    if compania_id:
        q = q.filter(Ramo.compania_id == compania_id)
    return q.order_by(Ramo.nombre).all()

@router.post("/ramos")
def crear_ramo(data: RamoIn, db: Session = Depends(get_db)):
    r = Ramo(**data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r

@router.put("/ramos/{id}")
def editar_ramo(id: int, data: RamoIn, db: Session = Depends(get_db)):
    r = db.query(Ramo).filter(Ramo.id == id).first()
    if not r:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    return r


# ── Subramos ─────────────────────────────────────────────────────────────────

@router.get("/subramos")
def listar_subramos(ramo_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Subramo)
    if ramo_id:
        q = q.filter(Subramo.ramo_id == ramo_id)
    items = q.order_by(Subramo.nombre).all()
    result = []
    for s in items:
        cob = cobertura_subramo(s.id, db)
        result.append({
            "id": s.id, "nombre": s.nombre, "ramo_id": s.ramo_id,
            "keywords": s.keywords, "activo": s.activo,
            "cobertura": cob,
        })
    return result

@router.post("/subramos")
def crear_subramo(data: SubramoIn, db: Session = Depends(get_db)):
    s = Subramo(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.put("/subramos/{id}")
def editar_subramo(id: int, data: SubramoIn, db: Session = Depends(get_db)):
    s = db.query(Subramo).filter(Subramo.id == id).first()
    if not s:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return s


# ── Campos definidos ──────────────────────────────────────────────────────────

@router.get("/subramos/{subramo_id}/campos")
def listar_campos(subramo_id: int, db: Session = Depends(get_db)):
    return (
        db.query(CampoDefinido)
        .filter(CampoDefinido.subramo_id == subramo_id)
        .order_by(CampoDefinido.orden)
        .all()
    )

@router.post("/subramos/{subramo_id}/campos")
def crear_campo(subramo_id: int, data: CampoIn, db: Session = Depends(get_db)):
    c = CampoDefinido(subramo_id=subramo_id, **data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c
