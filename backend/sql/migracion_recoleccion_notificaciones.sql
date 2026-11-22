-- Ejecutar una sola vez sobre la base de datos tienda.
USE tienda;

-- Permite pedidos sin dirección cuando se recogen en sucursal.
ALTER TABLE pedidos
  MODIFY id_direccion INT NULL;

ALTER TABLE pedidos
  ADD COLUMN modalidad_entrega VARCHAR(30) NOT NULL DEFAULT 'domicilio',
  ADD COLUMN sucursal_recoleccion VARCHAR(120) NULL;

CREATE TABLE IF NOT EXISTS notificaciones_pedido (
  id_notificacion INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  id_pedido INT NOT NULL,
  estado VARCHAR(20) NOT NULL,
  mensaje VARCHAR(255) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leida TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_notificaciones_cliente_fecha (id_cliente, fecha),
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE
);
