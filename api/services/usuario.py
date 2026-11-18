"""Quién está usando la sesión actual (nombre que escribe al entrar; no es una cuenta)."""
from __future__ import annotations
from fastapi import Request
from sqlalchemy.orm import Session
from ..models.db_models import SesionAuth

SESSION_COOKIE = "lector_session"


def usuario_de_request(request: Request, db: Session) -> str | None:
    token = request.cookies.get(SESSION_COOKIE, "")
    sesion = db.query(SesionAuth).filter(SesionAuth.token == token).first() if token else None
    return sesion.usuario if sesion else None
