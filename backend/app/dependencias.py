"""Dependencias de FastAPI para saber qué cliente hace la petición.

El navegador manda el token en la cabecera:  Authorization: Bearer <token>
"""
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services import cliente_service

_bearer = HTTPBearer(auto_error=False)


def token_actual(credenciales: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)):
    return credenciales.credentials if credenciales else None


def _sesion_invalida():
    return HTTPException(
        status_code=401,
        detail="Tu sesión expiró o no es válida. Inicia sesión de nuevo.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def cliente_actual(token: Optional[str] = Depends(token_actual)):
    """Exige sesión iniciada."""
    cliente = cliente_service.cliente_por_token(token) if token else None
    if cliente is None:
        raise _sesion_invalida()
    return cliente


def cliente_opcional(token: Optional[str] = Depends(token_actual)):
    """Sin token: None (compra como invitado). Con token inválido: 401."""
    if not token:
        return None
    cliente = cliente_service.cliente_por_token(token)
    if cliente is None:
        raise _sesion_invalida()
    return cliente


def admin_actual(cliente=Depends(cliente_actual)):
    """Exige sesión iniciada Y rol de administrador (401 sin sesión, 403 sin permiso)."""
    if cliente.get("rol") != "administrador":
        raise HTTPException(status_code=403, detail="No tienes permiso para hacer esto.")
    return cliente
