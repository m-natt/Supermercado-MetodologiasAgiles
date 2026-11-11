-- Agrega la tabla de sesiones de clientes a una base que ya existe.
-- (En una instalación nueva, schema.sql ya la incluye.)
USE tienda;

CREATE TABLE IF NOT EXISTS sesiones (
  id_sesion INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  -- Solo se guarda el hash SHA-256 del token, nunca el token
  token_hash CHAR(64) NOT NULL UNIQUE,
  creada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira DATETIME NOT NULL,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE
);
