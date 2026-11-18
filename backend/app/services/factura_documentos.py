"""Genera el XML (con formato parecido al CFDI 4.0) y el PDF de una factura.

Todo es SIMULADO: sello, certificado y timbre son inventados y el documento
dice claramente que no tiene validez fiscal.
"""
import xml.etree.ElementTree as ET
from decimal import Decimal

from fpdf import FPDF

from app.schemas.factura import REGIMENES_FISCALES, USOS_CFDI

AVISO = "SIMULACION - SIN VALIDEZ FISCAL"
AVISO_LARGO = ("Este documento es una simulación con fines educativos. "
               "No es un CFDI, no fue timbrado por el SAT y no tiene validez fiscal.")

NS_CFDI = "http://www.sat.gob.mx/cfd/4"
NS_TFD = "http://www.sat.gob.mx/TimbreFiscalDigital"
ET.register_namespace("cfdi", NS_CFDI)
ET.register_namespace("tfd", NS_TFD)


def _dinero(valor):
    return f"{Decimal(valor):.2f}"


def _fecha_iso(fecha):
    return fecha.strftime("%Y-%m-%dT%H:%M:%S")


# ---------- XML ----------

def generar_xml(f):
    def c(tag):
        return f"{{{NS_CFDI}}}{tag}"

    raiz = ET.Element(c("Comprobante"), {
        "Version": "4.0",
        "Serie": "F",
        "Folio": str(f["id_factura"]),
        "Fecha": _fecha_iso(f["fecha"]),
        "Sello": "SIMULACION-SIN-SELLO-DIGITAL",
        "NoCertificado": "00000000000000000000",
        "Certificado": "SIMULACION",
        "FormaPago": f["forma_pago"][0],
        "MetodoPago": "PUE",
        "SubTotal": _dinero(f["subtotal"]),
        "Moneda": "MXN",
        "Total": _dinero(f["total"]),
        "TipoDeComprobante": "I",
        "Exportacion": "01",
        "LugarExpedicion": f["emisor"]["lugar_expedicion"],
    })
    ET.SubElement(raiz, c("Emisor"), {
        "Rfc": f["emisor"]["rfc"],
        "Nombre": f["emisor"]["nombre"],
        "RegimenFiscal": f["emisor"]["regimen_fiscal"],
    })
    ET.SubElement(raiz, c("Receptor"), {
        "Rfc": f["rfc"],
        "Nombre": f["razon_social"],
        "DomicilioFiscalReceptor": f["codigo_postal"],
        "RegimenFiscalReceptor": f["regimen_fiscal"],
        "UsoCFDI": f["uso_cfdi"],
    })

    conceptos = ET.SubElement(raiz, c("Conceptos"))
    for k in f["conceptos"]:
        concepto = ET.SubElement(conceptos, c("Concepto"), {
            "ClaveProdServ": k["clave_prod_serv"],
            "Cantidad": str(k["cantidad"]),
            "ClaveUnidad": k["clave_unidad"],
            "Unidad": k["unidad"],
            "Descripcion": k["descripcion"],
            "ValorUnitario": str(k["valor_unitario"]),
            "Importe": _dinero(k["importe"]),
            "ObjetoImp": "02",
        })
        traslados = ET.SubElement(ET.SubElement(concepto, c("Impuestos")), c("Traslados"))
        ET.SubElement(traslados, c("Traslado"), {
            "Base": _dinero(k["importe"]), "Impuesto": "002", "TipoFactor": "Tasa",
            "TasaOCuota": "0.160000", "Importe": _dinero(k["iva"]),
        })

    impuestos = ET.SubElement(raiz, c("Impuestos"), {"TotalImpuestosTrasladados": _dinero(f["iva"])})
    ET.SubElement(ET.SubElement(impuestos, c("Traslados")), c("Traslado"), {
        "Base": _dinero(f["subtotal"]), "Impuesto": "002", "TipoFactor": "Tasa",
        "TasaOCuota": "0.160000", "Importe": _dinero(f["iva"]),
    })

    complemento = ET.SubElement(raiz, c("Complemento"))
    ET.SubElement(complemento, f"{{{NS_TFD}}}TimbreFiscalDigital", {
        "Version": "1.1",
        "UUID": f["uuid"],
        "FechaTimbrado": _fecha_iso(f["fecha"]),
        "RfcProvCertif": "SIMULACION",
        "SelloCFD": "SIMULACION",
        "NoCertificadoSAT": "00000000000000000000",
        "SelloSAT": "SIMULACION",
    })

    ET.indent(raiz)
    cuerpo = ET.tostring(raiz, encoding="unicode")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f"<!-- {AVISO}. {AVISO_LARGO} -->\n" + cuerpo + "\n"
    ).encode("utf-8")


# ---------- PDF ----------

def _t(texto):
    """La fuente del PDF solo tiene caracteres latinos: cambia los demás."""
    texto = str(texto)
    for original, cambio in {"—": "-", "–": "-", "•": "*", "“": '"', "”": '"', "’": "'"}.items():
        texto = texto.replace(original, cambio)
    return texto.encode("latin-1", "replace").decode("latin-1")


ROJO = (174, 41, 41)
GRIS = (110, 110, 110)


class _PDF(FPDF):
    def header(self):
        # Marca de agua en cada página
        self.set_font("Helvetica", "B", 40)
        self.set_text_color(238, 220, 220)
        centro_x, centro_y = self.w / 2, self.h / 2
        ancho = self.get_string_width(AVISO)
        with self.rotation(55, centro_x, centro_y):
            self.text(centro_x - ancho / 2, centro_y + 5, AVISO)
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-18)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*GRIS)
        self.multi_cell(0, 4, _t(AVISO_LARGO), align="C")
        self.cell(0, 4, f"Página {self.page_no()}", align="C")


def _bloque(pdf, x, y, ancho, titulo, lineas):
    pdf.set_xy(x, y)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*ROJO)
    pdf.cell(ancho, 6, _t(titulo), new_x="LEFT", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 9)
    for linea in lineas:
        pdf.set_x(x)
        pdf.multi_cell(ancho, 4.6, _t(linea), new_x="LEFT", new_y="NEXT")
    return pdf.get_y()


def generar_pdf(f):
    pdf = _PDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.set_title(f"Factura {f['folio']} (simulación)")
    pdf.add_page()

    # Encabezado
    pdf.set_fill_color(*ROJO)
    pdf.rect(0, 0, pdf.w, 28, style="F")
    pdf.set_xy(12, 8)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(120, 8, _t("Supermercado Bonito :3"))
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, _t("FACTURA (SIMULACIÓN)"), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(12)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(120, 6, _t("Documento sin validez fiscal"))
    pdf.cell(0, 6, _t(f"Folio {f['folio']}"), align="R")
    pdf.set_text_color(0, 0, 0)

    # Datos generales
    pdf.set_xy(12, 34)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, _t(f"Folio fiscal (UUID de prueba): {f['uuid']}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(12)
    pdf.cell(0, 5, _t(f"Fecha de emisión: {f['fecha']:%d/%m/%Y %H:%M}   ·   Pedido #{f['id_pedido']}"
                      f"   ·   Lugar de expedición: {f['emisor']['lugar_expedicion']}"),
             new_x="LMARGIN", new_y="NEXT")

    # Emisor y receptor
    y = pdf.get_y() + 4
    fin_emisor = _bloque(pdf, 12, y, 88, "EMISOR", [
        f["emisor"]["nombre"],
        f"RFC: {f['emisor']['rfc']}",
        f"Régimen: {f['emisor']['regimen_fiscal']} - {REGIMENES_FISCALES[f['emisor']['regimen_fiscal']]}",
    ])
    fin_receptor = _bloque(pdf, 108, y, 90, "RECEPTOR", [
        f["razon_social"],
        f"RFC: {f['rfc']}",
        f"Régimen: {f['regimen_fiscal']} - {REGIMENES_FISCALES.get(f['regimen_fiscal'], '')}",
        f"C.P. fiscal: {f['codigo_postal']}",
        f"Uso CFDI: {f['uso_cfdi']} - {USOS_CFDI.get(f['uso_cfdi'], '')}",
    ])

    # Conceptos
    pdf.set_xy(12, max(fin_emisor, fin_receptor) + 6)
    columnas = [("Cant.", 16, "R"), ("Unidad", 22, "L"), ("Descripción", 82, "L"),
                ("Valor unit.", 28, "R"), ("Importe", 38, "R")]
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(*ROJO)
    pdf.set_text_color(255, 255, 255)
    for titulo, ancho, alinear in columnas:
        pdf.cell(ancho, 7, _t(titulo), border=0, align=alinear, fill=True)
    pdf.ln()
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 9)
    for i, k in enumerate(f["conceptos"]):
        pdf.set_x(12)
        pdf.set_fill_color(*((248, 240, 240) if i % 2 else (255, 255, 255)))
        valores = [str(k["cantidad"]), k["unidad"], k["descripcion"],
                   f"${Decimal(k['valor_unitario']):,.2f}", f"${Decimal(k['importe']):,.2f}"]
        for (titulo, ancho, alinear), valor in zip(columnas, valores):
            pdf.cell(ancho, 6.5, _t(valor)[:48], align=alinear, fill=True)
        pdf.ln()

    # Totales
    pdf.ln(3)
    for etiqueta, valor, negrita in [("Subtotal", f["subtotal"], False),
                                     ("IVA 16%", f["iva"], False),
                                     ("Total", f["total"], True)]:
        pdf.set_x(128)
        pdf.set_font("Helvetica", "B" if negrita else "", 11 if negrita else 9)
        pdf.cell(32, 6.5, _t(etiqueta), align="R")
        pdf.cell(38, 6.5, f"${Decimal(valor):,.2f} MXN", align="R", new_x="LMARGIN", new_y="NEXT")

    # Pago y sellos simulados
    pdf.ln(4)
    _bloque(pdf, 12, pdf.get_y(), 186, "PAGO", [
        f"Forma de pago: {f['forma_pago'][0]} - {f['forma_pago'][1]}   ·   "
        "Método de pago: PUE - Pago en una sola exhibición   ·   Moneda: MXN",
    ])
    pdf.ln(2)
    _bloque(pdf, 12, pdf.get_y(), 186, "SELLOS (SIMULADOS)", [
        "Sello digital del CFDI: SIMULACION-SIN-SELLO-DIGITAL",
        "Sello del SAT: SIMULACION   ·   No. de certificado: 00000000000000000000",
    ])

    return bytes(pdf.output())
