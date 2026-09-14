
from fastapi import APIRouter, Response, Request
from fastapi.responses import JSONResponse
import os
import secrets

# ponytail: este sistema de sesión por cookie está completamente
# desconectado del resto de la app. Ningún router (/clasificador,
# /entrenamiento, /reglas, /catalogos, /extraccion) tiene un
# Depends(...) que verifique esta cookie, y no existe ninguna pieza de
# frontend (pantalla de login/logout, manejo de la cookie, redirect si
# no hay sesión) que consuma /auth/login|verify|logout — están huérfanos.
# Resultado: hoy toda la API de negocio responde sin ninguna protección
# de acceso. Decisión documentada en docs/07_Roadmaps/01_PLAN_ACCION.md.
# Upgrade: si se decide cerrar este hueco, hace falta construir la
# pantalla de login en el frontend Y conectar un Depends(verificar_sesion)
# a los routers — no basta con "activar" esto porque no hay nada del otro
# lado que lo use.
router = APIRouter(prefix="/auth", tags=["auth"])

PASSWORD = os.getenv("AUTH_PASSWORD")
if not PASSWORD:
    raise RuntimeError(
        "AUTH_PASSWORD no está definido en el entorno (.env). "
        "Define una contraseña fuerte antes de iniciar la API."
    )
SESSION_COOKIE = "lector_session"
valid_tokens: set = set()

@router.post("/login")
async def login(request: Request):
    try:
        body = await request.json()
        password = body.get("password", "")
    except Exception:
        form = await request.form()
        password = form.get("password", "")
    if password == PASSWORD:
        token = secrets.token_hex(32)
        valid_tokens.add(token)
        resp = JSONResponse({"ok": True})
        resp.set_cookie(
            key=SESSION_COOKIE, value=token,
            httponly=True, secure=True, samesite="lax",
            max_age=60*60*24*7
        )
        return resp
    return JSONResponse({"ok": False, "error": "Contrasena incorrecta"}, status_code=401)

@router.get("/verify")
async def verify(request: Request):
    token = request.cookies.get(SESSION_COOKIE, "")
    if token and token in valid_tokens:
        return Response(status_code=200)
    return Response(status_code=401)

@router.post("/logout")
async def logout(request: Request):
    token = request.cookies.get(SESSION_COOKIE, "")
    valid_tokens.discard(token)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE)
    return resp
