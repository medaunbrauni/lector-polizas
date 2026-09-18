from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import JSONResponse
import os
import secrets
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.db_models import SesionAuth

# ponytail: sigue siendo una sola contraseña compartida (AUTH_PASSWORD) sin
# tabla de usuarios — eso queda fuera de alcance por ahora, es una decisión
# deliberada, no una limitación olvidada.
#
# Lo que SÍ se resolvió aquí: las sesiones ya no viven en un set() en
# memoria (se perdían en cada reinicio) — ahora persisten en SesionAuth
# (SQLite), y verificar_sesion() ya está conectada como Depends(...) a los
# routers de negocio en main.py.
#
# DEUDA QUE SIGUE PENDIENTE: no existe ninguna pantalla de login en el
# frontend (web/src/) ni manejo de la cookie del lado del cliente — eso es
# tarea aparte. Hasta que exista, cualquier deploy de este cambio a
# producción deja la app inutilizable desde el navegador (todo
# /api/clasificador, /api/entrenamiento, /api/reglas, /api/catalogos y
# /api/extraer empieza a responder 401 sin que haya forma de loguearse
# desde la UI). Ver docs/07_Roadmaps/01_PLAN_ACCION.md.
router = APIRouter(prefix="/auth", tags=["auth"])

PASSWORD = os.getenv("AUTH_PASSWORD")
if not PASSWORD:
    raise RuntimeError(
        "AUTH_PASSWORD no está definido en el entorno (.env). "
        "Define una contraseña fuerte antes de iniciar la API."
    )
SESSION_COOKIE = "lector_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 días


@router.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    try:
        body = await request.json()
        password = body.get("password", "")
    except Exception:
        form = await request.form()
        password = form.get("password", "")

    if not secrets.compare_digest(password, PASSWORD):
        return JSONResponse({"ok": False, "error": "Contrasena incorrecta"}, status_code=401)

    token = secrets.token_hex(32)
    sesion = SesionAuth(
        token=token,
        expira_en=datetime.utcnow() + timedelta(seconds=SESSION_MAX_AGE),
    )
    db.add(sesion)
    db.commit()

    resp = JSONResponse({"ok": True})
    resp.set_cookie(
        key=SESSION_COOKIE, value=token,
        httponly=True, secure=True, samesite="lax",
        max_age=SESSION_MAX_AGE,
    )
    return resp


@router.get("/verify")
async def verify(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE, "")
    sesion = db.query(SesionAuth).filter(SesionAuth.token == token).first() if token else None

    if not sesion or sesion.expira_en < datetime.utcnow():
        if sesion:
            db.delete(sesion)
            db.commit()
        return Response(status_code=401)

    return Response(status_code=200)


@router.post("/logout")
async def logout(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE, "")
    if token:
        db.query(SesionAuth).filter(SesionAuth.token == token).delete()
        db.commit()

    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE)
    return resp


def verificar_sesion(request: Request, db: Session = Depends(get_db)) -> SesionAuth:
    """
    Dependencia de FastAPI para proteger routers de negocio:
    Depends(verificar_sesion) en el include_router (ver main.py).

    Limpieza perezosa: si el token existe pero ya expiró, se borra aquí
    mismo en vez de depender de un cron aparte — el volumen de sesiones
    vencidas es bajo (un solo usuario compartido) y no justifica ese costo
    operativo extra.
    """
    token = request.cookies.get(SESSION_COOKIE, "")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")

    sesion = db.query(SesionAuth).filter(SesionAuth.token == token).first()
    if not sesion or sesion.expira_en < datetime.utcnow():
        if sesion:
            db.delete(sesion)
            db.commit()
        raise HTTPException(status_code=401, detail="Sesión expirada o inválida")

    return sesion
