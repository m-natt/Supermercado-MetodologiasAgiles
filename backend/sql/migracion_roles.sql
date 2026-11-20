USE tienda;

ALTER TABLE clientes
  ADD COLUMN rol VARCHAR(20) NOT NULL DEFAULT 'cliente' AFTER contrasena;
