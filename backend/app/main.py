import pymysql
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.routers import health

app = FastAPI(title="API del Supermercado")

# Permite que el frontend (otro puerto) pueda llamar a esta API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# MANEJO DE ERRORES (siempre responde JSON, nunca se cae)
# ---------------------------------------------------------
def error_json(mensaje, codigo):
    return JSONResponse(status_code=codigo, content={"ok": False, "error": mensaje})


@app.exception_handler(StarletteHTTPException)
async def error_http(request: Request, e: StarletteHTTPException):
    # Errores como 404 (no existe la ruta) o 405 (metodo no permitido)
    return error_json(str(e.detail), e.status_code)


@app.exception_handler(RequestValidationError)
async def error_validacion(request: Request, e: RequestValidationError):
    return error_json("Datos invalidos en la peticion.", 422)


@app.exception_handler(pymysql.err.IntegrityError)
async def error_integridad(request: Request, e: pymysql.err.IntegrityError):
    # Datos duplicados o referencias a registros que no existen
    return error_json("Dato duplicado o relacionado con un registro que no existe.", 409)


@app.exception_handler(pymysql.MySQLError)
async def error_base_datos(request: Request, e: pymysql.MySQLError):
    print("Error de base de datos:", e)
    return error_json("Error con la base de datos.", 500)


@app.exception_handler(Exception)
async def error_general(request: Request, e: Exception):
    print("Error inesperado:", e)
    return error_json("Error interno del servidor.", 500)


# ---------------------------------------------------------
# RUTAS
# ---------------------------------------------------------
@app.get("/")
def inicio():
    return {"ok": True, "mensaje": "API del Supermercado funcionando"}


app.include_router(health.router)

# Aqui tus companeros agregan sus routers (carpeta app/routers), por ejemplo:
# from app.routers import productos
# app.include_router(productos.router)
