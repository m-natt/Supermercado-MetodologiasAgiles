import pymysql
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.routers import categorias, clientes, health, marcas, pedidos, productos

app = FastAPI(title="API del Supermercado")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def error_json(mensaje, codigo):
    return JSONResponse(status_code=codigo, content={"ok": False, "error": mensaje})


@app.exception_handler(StarletteHTTPException)
async def error_http(request: Request, e: StarletteHTTPException):
    return error_json(str(e.detail), e.status_code)


@app.exception_handler(RequestValidationError)
async def error_validacion(request: Request, e: RequestValidationError):
    return error_json("Datos invalidos en la peticion.", 422)


@app.exception_handler(pymysql.err.IntegrityError)
async def error_integridad(request: Request, e: pymysql.err.IntegrityError):
    return error_json("Dato duplicado o relacionado con un registro que no existe.", 409)


@app.exception_handler(pymysql.MySQLError)
async def error_base_datos(request: Request, e: pymysql.MySQLError):
    print("Error de base de datos:", e)
    return error_json("Error con la base de datos.", 500)


@app.exception_handler(Exception)
async def error_general(request: Request, e: Exception):
    print("Error inesperado:", e)
    return error_json("Error interno del servidor.", 500)

@app.get("/")
def inicio():
    return {"ok": True, "mensaje": "API del Supermercado funcionando"}


app.include_router(health.router)
app.include_router(categorias.router)
app.include_router(marcas.router)
app.include_router(productos.router)
app.include_router(pedidos.router)
app.include_router(clientes.router)