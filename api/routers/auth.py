
import os
from fastapi import APIRouter, Response, Request
from fastapi.responses import JSONResponse
import secrets

router = APIRouter(prefix="/auth", tags=["auth"])

PASSWORD = os.getenv("AUTH_PASSWORD", "Marsella14")
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
