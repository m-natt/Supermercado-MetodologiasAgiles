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
  contrasena VARCHAR(255) NOT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE direcciones (
  id_direccion INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  id_cliente INT NOT NULL,
  calle VARCHAR(150) NOT NULL,
  colonia VARCHAR(100),
  ciudad VARCHAR(100),
  codigo_postal VARCHAR(10),
  referencias VARCHAR(255),
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
  id_direccion INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  costo_envio DECIMAL(8,2) NOT NULL,
  fecha_entrega DATETIME,
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
