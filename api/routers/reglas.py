from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..models.db_models import ReglaExtraccion
from ..services.rule_engine import _aplicar_patron, cobertura_subramo

router = APIRouter(prefix="/reglas", tags=["Reglas de Extracción"])


class ReglaIn(BaseModel):
    subramo_id: int
    nombre_campo: str
    patron_regex: str
    contexto_antes: str | None = None
    contexto_despues: str | None = None
    ejemplos: list[str] = []
    confianza: float = 1.0
    creado_por: str = "manual"


class ProbarReglaIn(BaseModel):
    patron_regex: str
    texto: str


@router.get("")
def listar_reglas(subramo_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(ReglaExtraccion).filter(ReglaExtraccion.activo == True)
    if subramo_id:
        q = q.filter(ReglaExtraccion.subramo_id == subramo_id)
    return q.order_by(ReglaExtraccion.nombre_campo).all()


@router.post("")
def crear_regla(data: ReglaIn, db: Session = Depends(get_db)):
    # Desactivar regla anterior para el mismo campo si existe
    db.query(ReglaExtraccion).filter(
        ReglaExtraccion.subramo_id == data.subramo_id,
        ReglaExtraccion.nombre_campo == data.nombre_campo,
        ReglaExtraccion.activo == True,
    ).update({"activo": False})

    regla = ReglaExtraccion(**data.model_dump())
    db.add(regla)
    db.commit()
    db.refresh(regla)
    return regla


@router.put("/{id}")
def editar_regla(id: int, data: ReglaIn, db: Session = Depends(get_db)):
    r = db.query(ReglaExtraccion).filter(ReglaExtraccion.id == id).first()
    if not r:
        raise HTTPException(404)
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    return r


@router.delete("/{id}")
def desactivar_regla(id: int, db: Session = Depends(get_db)):
    r = db.query(ReglaExtraccion).filter(ReglaExtraccion.id == id).first()
    if not r:
        raise HTTPException(404)
    r.activo = False
    db.commit()
    return {"ok": True}


@router.post("/probar")
def probar_regla(data: ProbarReglaIn):
    """Prueba un patrón regex contra un texto sin guardar nada."""
    valor = _aplicar_patron(data.patron_regex, data.texto)
    return {"coincidencia": valor, "encontrado": valor is not None}


@router.get("/cobertura/{subramo_id}")
def cobertura(subramo_id: int, db: Session = Depends(get_db)):
    return cobertura_subramo(subramo_id, db)
