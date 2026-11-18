-- Códigos para recuperar la contraseña ("¿Olvidaste tu contraseña?").
-- (En una instalación nueva, schema.sql ya incluye esta tabla.)
-- Se puede ejecutar varias veces sin problema.
USE tienda;

CREATE TABLE IF NOT EXISTS recuperaciones (
  id_recuperacion INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  -- Solo se guarda el hash del código, nunca el código
  codigo_hash CHAR(64) NOT NULL,
  expira DATETIME NOT NULL,
  intentos INT NOT NULL DEFAULT 0,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  creada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE
);
