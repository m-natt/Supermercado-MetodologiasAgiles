-- Esquema basado en el diagrama entidad-relación
CREATE DATABASE IF NOT EXISTS tienda CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tienda;

CREATE TABLE categorias (
  id_categoria INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

CREATE TABLE marcas (
  id_marca INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

CREATE TABLE clientes (
  id_cliente INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellidos VARCHAR(100),
  correo VARCHAR(150) NOT NULL UNIQUE,
  telefono VARCHAR(20),
  contrasena VARCHAR(255) NOT NULL, -- hash Argon2 (pwdlib); "!" = cliente invitado sin contraseña
  rol VARCHAR(20) NOT NULL DEFAULT 'cliente',
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sesiones (
  id_sesion INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  -- Solo se guarda el hash SHA-256 del token, nunca el token
  token_hash CHAR(64) NOT NULL UNIQUE,
  creada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira DATETIME NOT NULL,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE
);

CREATE TABLE direcciones (
  id_direccion INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  calle VARCHAR(150) NOT NULL,
  colonia VARCHAR(100),
  ciudad VARCHAR(100),
  codigo_postal VARCHAR(10),
  referencias VARCHAR(255),
  -- 0 = el cliente la borró, pero se conserva porque la usan pedidos anteriores
  activa TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
);

CREATE TABLE productos (
  id_producto INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_categoria INT NOT NULL,
  id_marca INT,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL,
  unidad VARCHAR(20) NOT NULL,
  stock INT NOT NULL,
  imagen_url VARCHAR(255),
  activo TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria),
  FOREIGN KEY (id_marca) REFERENCES marcas(id_marca)
);

CREATE TABLE carrito (
  id_carrito INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  id_producto INT NOT NULL,
  cantidad DECIMAL(10,3) NOT NULL,
  UNIQUE KEY uq_carrito (id_cliente, id_producto),
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
);

CREATE TABLE pedidos (
  id_pedido INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  id_direccion INT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  costo_envio DECIMAL(8,2) NOT NULL,
  fecha_entrega DATETIME,
  modalidad_entrega VARCHAR(30) NOT NULL DEFAULT 'domicilio',
  sucursal_recoleccion VARCHAR(120),
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
  FOREIGN KEY (id_direccion) REFERENCES direcciones(id_direccion)
);

CREATE TABLE detalle_pedido (
  id_detalle INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_pedido INT NOT NULL,
  id_producto INT NOT NULL,
  cantidad DECIMAL(10,3) NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido),
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
);

CREATE TABLE pagos (
  id_pago INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_pedido INT NOT NULL,
  metodo VARCHAR(20) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  estado VARCHAR(20) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido)
);


CREATE TABLE zonas_cobertura (
  codigo_postal VARCHAR(5) NOT NULL PRIMARY KEY,
  ciudad VARCHAR(100) NOT NULL,
  costo_envio DECIMAL(8,2) NOT NULL DEFAULT 0,
  tiempo_estimado_min INT,
  activo TINYINT(1) NOT NULL DEFAULT 1
);

INSERT INTO zonas_cobertura (codigo_postal, ciudad, costo_envio, tiempo_estimado_min) VALUES
('64000', 'Monterrey', 35.00, 45),
('64640', 'Monterrey', 45.00, 60),
('66220', 'San Pedro Garza García', 60.00, 75);


-- ===== Facturas SIMULADAS (sin validez fiscal) =====
-- Datos fiscales guardados del cliente (para no escribirlos cada vez)
CREATE TABLE datos_fiscales (
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
CREATE TABLE facturas (
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


-- ===== Recuperación de contraseña =====
CREATE TABLE recuperaciones (
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


-- ===== Notificaciones de estado del pedido =====
CREATE TABLE notificaciones_pedido (
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



-- ===== Reseñas de productos y de marcas (con moderación) =====
-- estado: 'pendiente' (espera moderación), 'aprobada' (pública) o 'rechazada'
-- Un cliente deja UNA reseña por producto (y puede editarla).
-- Si se borra el producto, sus reseñas se borran con él.
CREATE TABLE resenas_producto (
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
CREATE TABLE resenas_marca (
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
