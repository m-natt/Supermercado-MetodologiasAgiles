from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencias import cliente_actual, token_actual
from app.schemas.cliente import (
    ConfirmarRecuperacionEntrada, LoginEntrada, RecuperarEntrada, RegistroEntrada,
)
from app.seguridad import (
    codigos_por_correo, codigos_por_ip, intentos_por_correo, intentos_por_ip,
)
from app.services import cliente_service, recuperacion_service

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


# ---------- ¿Olvidaste tu contraseña? ----------

@router.post("/recuperar")
def pedir_codigo(datos: RecuperarEntrada, request: Request):
    ip = request.client.host if request.client else "desconocida"
    if codigos_por_correo.bloqueado(datos.correo) or codigos_por_ip.bloqueado(ip):
        raise HTTPException(status_code=429, detail="Ya pediste varios códigos. Espera 15 minutos.")
    codigos_por_correo.registrar_fallo(datos.correo)
    codigos_por_ip.registrar_fallo(ip)
    # El código se "envía" a la terminal del backend (correo simulado)
    recuperacion_service.solicitar(datos.correo)
    # Misma respuesta exista o no el correo
    return {"ok": True, "mensaje": "Si el correo está registrado, te enviamos un código."}


@router.post("/recuperar/confirmar")
def cambiar_con_codigo(datos: ConfirmarRecuperacionEntrada):
    try:
        recuperacion_service.confirmar(datos.correo, datos.codigo, datos.contrasena)
    except recuperacion_service.CodigoInvalido as e:
        raise HTTPException(status_code=400, detail=str(e))
    intentos_por_correo.reiniciar(datos.correo)  # ya puede iniciar sesión sin esperar
    return {"ok": True, "mensaje": "Tu contraseña se cambió. Ya puedes iniciar sesión."}
