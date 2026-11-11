-- Agrega las zonas de cobertura a una base que ya existe.
-- (En una instalación nueva, schema.sql ya las incluye.)
-- Se puede ejecutar varias veces sin duplicar datos.
USE tienda;

CREATE TABLE IF NOT EXISTS zonas_cobertura (
  codigo_postal VARCHAR(5) NOT NULL PRIMARY KEY,
  ciudad VARCHAR(100) NOT NULL,
  costo_envio DECIMAL(8,2) NOT NULL DEFAULT 0,
  tiempo_estimado_min INT,
  activo TINYINT(1) NOT NULL DEFAULT 1
);

INSERT IGNORE INTO zonas_cobertura (codigo_postal, ciudad, costo_envio, tiempo_estimado_min) VALUES
('64000', 'Monterrey', 35.00, 45),
('64640', 'Monterrey', 45.00, 60),
('66220', 'San Pedro Garza García', 60.00, 75);
