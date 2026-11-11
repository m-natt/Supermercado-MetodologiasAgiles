from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencias import cliente_actual, token_actual
from app.schemas.cliente import LoginEntrada, RegistroEntrada
from app.seguridad import intentos_por_correo, intentos_por_ip
from app.services import cliente_service

router = APIRouter(prefix="/api/clientes", tags=["clientes"])

DEMASIADOS_INTENTOS = HTTPException(
    status_code=429,
    detail="Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.",
)


@router.post("/registro", status_code=201)
def registrar(datos: RegistroEntrada):
    try:
        sesion = cliente_service.registrar(datos)
    except cliente_service.CorreoRegistrado:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una cuenta con ese correo. Inicia sesión.",
        )
    return {"ok": True, "data": sesion}


@router.post("/login")
def iniciar_sesion(datos: LoginEntrada, request: Request):
    ip = request.client.host if request.client else "desconocida"
    if intentos_por_correo.bloqueado(datos.correo) or intentos_por_ip.bloqueado(ip):
        raise DEMASIADOS_INTENTOS

    sesion = cliente_service.iniciar_sesion(datos.correo, datos.contrasena)
    if sesion is None:
        intentos_por_correo.registrar_fallo(datos.correo)
        intentos_por_ip.registrar_fallo(ip)
        # Mismo mensaje si el correo no existe o la contraseña está mal
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")

    intentos_por_correo.reiniciar(datos.correo)
    return {"ok": True, "data": sesion}


@router.get("/yo")
def mis_datos(cliente=Depends(cliente_actual)):
    return {"ok": True, "data": cliente}


@router.post("/logout")
def cerrar_sesion(token=Depends(token_actual)):
    if token:
        cliente_service.cerrar_sesion(token)
    return {"ok": True, "mensaje": "Sesión cerrada."}
