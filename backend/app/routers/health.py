from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.database import consultar

router = APIRouter()


@router.get("/api/health")
def health():
    """Prueba que el servidor y la base de datos esten funcionando."""
    try:
        consultar("SELECT 1")
        return {"ok": True, "servidor": "activo", "baseDeDatos": "conectada"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "servidor": "activo",
                     "baseDeDatos": "sin conexion", "detalle": str(e)},
        )
