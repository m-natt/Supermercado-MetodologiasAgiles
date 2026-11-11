import os
from contextlib import contextmanager

import pymysql
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "tienda"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}


def conectar():
    return pymysql.connect(**DB_CONFIG)


def consultar(sql, params=None):
    conexion = conectar()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()
    finally:
        conexion.close()


def ejecutar(sql, params=None):
    conexion = conectar()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(sql, params)
            conexion.commit()
            return cursor.lastrowid
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@contextmanager
def transaccion():
    """Varias consultas que se guardan todas juntas o ninguna.

    with transaccion() as cursor:
        cursor.execute(...)
        cursor.execute(...)
    """
    conexion = conectar()
    try:
        with conexion.cursor() as cursor:
            yield cursor
        conexion.commit()
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()
