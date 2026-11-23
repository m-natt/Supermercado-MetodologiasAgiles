-- Reseñas de productos y de marcas (con moderación).
-- (En una instalación nueva, schema.sql ya incluye estas tablas.)
-- Se puede ejecutar varias veces sin problema.
USE tienda;

-- estado: 'pendiente' (espera moderación), 'aprobada' (pública) o 'rechazada'
-- Un cliente deja UNA reseña por producto (y puede editarla).
-- Si se borra el producto, sus reseñas se borran con él.
CREATE TABLE IF NOT EXISTS resenas_producto (
  id_resena INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_producto INT NOT NULL,
  id_cliente INT NOT NULL,
  calificacion TINYINT NOT NULL,
  titulo VARCHAR(100),
  comentario VARCHAR(1000),
  estado VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  compra_verificada TINYINT(1) NOT NULL DEFAULT 0,
  motivo_rechazo VARCHAR(255),
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_moderacion DATETIME NULL,
  id_moderador INT NULL,
  UNIQUE KEY uq_resena_producto (id_producto, id_cliente),
  CHECK (calificacion BETWEEN 1 AND 5),
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE CASCADE,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  FOREIGN KEY (id_moderador) REFERENCES clientes(id_cliente) ON DELETE SET NULL
);

-- Igual, pero para marcas. Si se borra la marca, sus reseñas se borran con ella
-- (así las reseñas nunca impiden borrar una marca).
CREATE TABLE IF NOT EXISTS resenas_marca (
  id_resena INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_marca INT NOT NULL,
  id_cliente INT NOT NULL,
  calificacion TINYINT NOT NULL,
  titulo VARCHAR(100),
  comentario VARCHAR(1000),
  estado VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  compra_verificada TINYINT(1) NOT NULL DEFAULT 0,
  motivo_rechazo VARCHAR(255),
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_moderacion DATETIME NULL,
  id_moderador INT NULL,
  UNIQUE KEY uq_resena_marca (id_marca, id_cliente),
  CHECK (calificacion BETWEEN 1 AND 5),
  FOREIGN KEY (id_marca) REFERENCES marcas(id_marca) ON DELETE CASCADE,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  FOREIGN KEY (id_moderador) REFERENCES clientes(id_cliente) ON DELETE SET NULL
);
