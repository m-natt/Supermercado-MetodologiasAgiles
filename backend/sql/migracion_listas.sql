-- Listas de compras personales (por ejemplo, "Despensa de la semana").
-- (En una instalación nueva, schema.sql ya incluye estas tablas.)
-- Se puede ejecutar varias veces sin problema.
USE tienda;

-- Si se borra el cliente, sus listas se borran con él.
CREATE TABLE IF NOT EXISTS listas_compra (
  id_lista INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_listas_cliente (id_cliente, fecha_actualizacion),
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE
);

-- Un producto aparece una sola vez por lista; "comprado" es la palomita del cliente.
CREATE TABLE IF NOT EXISTS listas_compra_items (
  id_item INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_lista INT NOT NULL,
  id_producto INT NOT NULL,
  cantidad INT NOT NULL DEFAULT 1,
  comprado TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_lista_producto (id_lista, id_producto),
  CHECK (cantidad BETWEEN 1 AND 999),
  FOREIGN KEY (id_lista) REFERENCES listas_compra(id_lista) ON DELETE CASCADE,
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE CASCADE
);
