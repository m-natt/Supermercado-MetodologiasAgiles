import re

from pydantic import Field, field_validator

from app.schemas.pedido import Entrada

# Catálogos (parte de los del SAT) que se muestran en la página
REGIMENES_FISCALES = {
    "601": "General de Ley Personas Morales",
    "603": "Personas Morales con Fines no Lucrativos",
    "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
    "606": "Arrendamiento",
    "612": "Personas Físicas con Actividades Empresariales y Profesionales",
    "616": "Sin obligaciones fiscales",
    "621": "Incorporación Fiscal",
    "626": "Régimen Simplificado de Confianza",
}

USOS_CFDI = {
    "G01": "Adquisición de mercancías",
    "G03": "Gastos en general",
    "S01": "Sin efectos fiscales",
}

# RFC: 3 letras (persona moral) o 4 (persona física) + fecha AAMMDD + 3 de homoclave
PATRON_RFC = r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$"


class DatosFiscalesEntrada(Entrada):
    rfc: str = Field(min_length=12, max_length=13)
    razon_social: str = Field(min_length=1, max_length=254)
    regimen_fiscal: str
    codigo_postal: str = Field(pattern=r"^\d{5}$")
    uso_cfdi: str
    # Si es True, se guardan para la próxima factura
    guardar: bool = True

    @field_validator("rfc", "razon_social")
    @classmethod
    def en_mayusculas(cls, valor):
        return valor.upper()

    @field_validator("rfc")
    @classmethod
    def rfc_valido(cls, rfc):
        if not re.fullmatch(PATRON_RFC, rfc):
            raise ValueError("El RFC no tiene un formato válido.")
        return rfc

    @field_validator("regimen_fiscal")
    @classmethod
    def regimen_valido(cls, regimen):
        if regimen not in REGIMENES_FISCALES:
            raise ValueError("Régimen fiscal no válido.")
        return regimen

    @field_validator("uso_cfdi")
    @classmethod
    def uso_valido(cls, uso):
        if uso not in USOS_CFDI:
            raise ValueError("Uso de CFDI no válido.")
        return uso
