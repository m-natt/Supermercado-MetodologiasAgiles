-- Permite "borrar" direcciones que ya se usaron en pedidos sin perder el historial:
-- en vez de borrarlas se marcan como inactivas (activa = 0).
-- (En una instalación nueva, schema.sql ya incluye la columna.)
-- Se puede ejecutar varias veces: solo agrega la columna si no existe.
USE tienda;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'direcciones' AND COLUMN_NAME = 'activa'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE direcciones ADD COLUMN activa TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1');
PREPARE paso FROM @sql;
EXECUTE paso;
DEALLOCATE PREPARE paso;
