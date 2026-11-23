from fastapi import APIRouter, Depends, HTTPException

from app.dependencias import cliente_actual
from app.schemas.lista import ItemCambio, ItemEntrada, ListaEntrada
from app.services import lista_service

# Todas las rutas exigen sesión: cada cliente solo ve y cambia sus propias listas
router = APIRouter(prefix="/api/listas", tags=["listas"])


def _ejecutar(funcion, *args, **kwargs):
    try:
        return funcion(*args, **kwargs)
    except lista_service.ListaNoEncontrada:
        raise HTTPException(status_code=404, detail="Lista no encontrada.")
    except lista_service.ItemNoEncontrado:
        raise HTTPException(status_code=404, detail="Ese producto no está en la lista.")
    except lista_service.ProductoNoDisponible:
        raise HTTPException(status_code=409, detail="Ese producto ya no está disponible.")
    except lista_service.LimiteAlcanzado as error:
        raise HTTPException(status_code=409, detail=str(error))


@router.get("")
def mis_listas(cliente=Depends(cliente_actual)):
    return {"ok": True, "data": lista_service.listar(cliente["id_cliente"])}


@router.post("", status_code=201)
def crear(datos: ListaEntrada, cliente=Depends(cliente_actual)):
    lista = _ejecutar(lista_service.crear, cliente["id_cliente"], datos.nombre)
    return {"ok": True, "data": lista}


@router.get("/{id_lista}")
def ver(id_lista: int, cliente=Depends(cliente_actual)):
    return {"ok": True, "data": _ejecutar(lista_service.obtener, id_lista, cliente["id_cliente"])}


@router.put("/{id_lista}")
def renombrar(id_lista: int, datos: ListaEntrada, cliente=Depends(cliente_actual)):
    lista = _ejecutar(lista_service.renombrar, id_lista, cliente["id_cliente"], datos.nombre)
    return {"ok": True, "data": lista}


@router.delete("/{id_lista}")
def eliminar(id_lista: int, cliente=Depends(cliente_actual)):
    _ejecutar(lista_service.eliminar, id_lista, cliente["id_cliente"])
    return {"ok": True, "data": {"id_lista": id_lista}}


@router.post("/{id_lista}/items", status_code=201)
def agregar_item(id_lista: int, datos: ItemEntrada, cliente=Depends(cliente_actual)):
    lista = _ejecutar(lista_service.agregar_item, id_lista, cliente["id_cliente"],
                      datos.id_producto, datos.cantidad)
    return {"ok": True, "data": lista}


@router.put("/{id_lista}/items/{id_producto}")
def cambiar_item(id_lista: int, id_producto: int, datos: ItemCambio, cliente=Depends(cliente_actual)):
    if datos.cantidad is None and datos.comprado is None:
        raise HTTPException(status_code=400, detail="No hay cambios que guardar.")
    lista = _ejecutar(lista_service.cambiar_item, id_lista, cliente["id_cliente"], id_producto,
                      cantidad=datos.cantidad, comprado=datos.comprado)
    return {"ok": True, "data": lista}


@router.delete("/{id_lista}/items/{id_producto}")
def quitar_item(id_lista: int, id_producto: int, cliente=Depends(cliente_actual)):
    lista = _ejecutar(lista_service.quitar_item, id_lista, cliente["id_cliente"], id_producto)
    return {"ok": True, "data": lista}
