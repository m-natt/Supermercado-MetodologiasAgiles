-- Facturas SIMULADAS (sin validez fiscal) y datos fiscales de los clientes.
-- (En una instalación nueva, schema.sql ya incluye estas tablas.)
-- Se puede ejecutar varias veces sin problema.
USE tienda;

-- Datos fiscales guardados del cliente (para no escribirlos cada vez)
CREATE TABLE IF NOT EXISTS datos_fiscales (
  id_cliente INT NOT NULL PRIMARY KEY,
  rfc VARCHAR(13) NOT NULL,
  razon_social VARCHAR(254) NOT NULL,
  regimen_fiscal CHAR(3) NOT NULL,
  codigo_postal CHAR(5) NOT NULL,
  uso_cfdi VARCHAR(4) NOT NULL,
  actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE
);

-- Una factura por pedido. Guarda una copia de los datos fiscales usados:
-- si el cliente los cambia después, la factura no cambia.
CREATE TABLE IF NOT EXISTS facturas (
  id_factura INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_pedido INT NOT NULL UNIQUE,
  id_cliente INT NOT NULL,
  uuid CHAR(36) NOT NULL UNIQUE,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rfc VARCHAR(13) NOT NULL,
  razon_social VARCHAR(254) NOT NULL,
  regimen_fiscal CHAR(3) NOT NULL,
  codigo_postal CHAR(5) NOT NULL,
  uso_cfdi VARCHAR(4) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  iva DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido),
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
);
