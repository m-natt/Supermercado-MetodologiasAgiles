-- Productos de ejemplo para el catálogo.
-- Se puede ejecutar varias veces: no duplica categorías, marcas ni productos
-- (los compara por nombre). Ejecútalo después de schema.sql.
USE tienda;

CREATE TEMPORARY TABLE nuevos_productos (
  categoria VARCHAR(100) NOT NULL,
  marca VARCHAR(100),
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL,
  unidad VARCHAR(20) NOT NULL,
  stock INT NOT NULL
);

INSERT INTO nuevos_productos (categoria, marca, nombre, descripcion, precio, unidad, stock) VALUES
-- Frutas
('Frutas', NULL, 'Plátano tabasco', 'Plátano fresco, ideal para licuados y postres.', 24.90, 'kg', 80),
('Frutas', NULL, 'Manzana roja', 'Manzana roja crujiente y dulce.', 49.90, 'kg', 60),
('Frutas', NULL, 'Naranja para jugo', 'Naranja jugosa, perfecta para el desayuno.', 22.50, 'kg', 100),
('Frutas', NULL, 'Aguacate Hass', 'Aguacate Hass en su punto.', 69.90, 'kg', 40),
('Frutas', NULL, 'Fresa', 'Fresa fresca en charola de 500 g.', 45.00, 'paquete', 0),
-- Verduras
('Verduras', NULL, 'Jitomate saladet', 'Jitomate rojo para salsas y ensaladas.', 28.90, 'kg', 90),
('Verduras', NULL, 'Cebolla blanca', 'Cebolla blanca de sabor intenso.', 26.50, 'kg', 70),
('Verduras', NULL, 'Papa blanca', 'Papa blanca para freír, hervir u hornear.', 32.00, 'kg', 85),
('Verduras', NULL, 'Zanahoria', 'Zanahoria fresca y crujiente.', 18.90, 'kg', 75),
('Verduras', NULL, 'Lechuga romana', 'Lechuga romana fresca, pieza.', 19.90, 'pieza', 35),
-- Lácteos (usa la categoría y marca que ya existen)
('Lacteos', 'Lala', 'Leche deslactosada 1 L', 'Leche deslactosada, fácil de digerir.', 32.50, 'pieza', 60),
('Lacteos', 'Lala', 'Yogur natural 1 kg', 'Yogur natural sin azúcar añadida.', 42.50, 'pieza', 30),
('Lacteos', 'Lala', 'Queso panela 400 g', 'Queso panela fresco y bajo en grasa.', 79.00, 'pieza', 25),
('Lacteos', 'Lala', 'Crema ácida 450 ml', 'Crema ácida para tus antojitos.', 38.00, 'pieza', 40),
-- Panadería
('Panadería', 'Bimbo', 'Pan blanco grande', 'Pan de caja blanco, paquete grande.', 52.00, 'paquete', 45),
('Panadería', 'Bimbo', 'Pan integral', 'Pan de caja integral con fibra.', 58.00, 'paquete', 35),
('Panadería', 'Bimbo', 'Medias noches', 'Pan suave para hot dogs, 8 piezas.', 45.00, 'paquete', 30),
('Panadería', NULL, 'Tortilla de maíz', 'Tortilla de maíz recién hecha.', 24.00, 'kg', 50),
-- Bebidas
('Bebidas', 'Coca-Cola', 'Refresco de cola 2 L', 'Refresco de cola en botella de 2 litros.', 38.00, 'pieza', 70),
('Bebidas', 'Ciel', 'Agua natural 1.5 L', 'Agua purificada en botella de 1.5 litros.', 16.00, 'pieza', 120),
('Bebidas', 'Jumex', 'Jugo de naranja 1 L', 'Néctar de naranja en envase de 1 litro.', 31.00, 'pieza', 55),
-- Botanas
('Botanas', 'Sabritas', 'Papas sal 45 g', 'Papas fritas clásicas con sal.', 21.00, 'pieza', 90),
('Botanas', 'Sabritas', 'Papas sabor queso 50 g', 'Papas onduladas sabor queso.', 22.00, 'pieza', 80),
('Botanas', 'Sabritas', 'Totopos sabor nacho 62 g', 'Totopos de maíz sabor queso nacho.', 22.00, 'pieza', 75),
-- Abarrotes
('Abarrotes', 'Verde Valle', 'Arroz súper extra 1 kg', 'Arroz blanco de grano largo.', 34.00, 'pieza', 60),
('Abarrotes', 'Verde Valle', 'Frijol negro 1 kg', 'Frijol negro seleccionado.', 39.00, 'pieza', 55),
('Abarrotes', 'Nutrioli', 'Aceite vegetal 1 L', 'Aceite vegetal de soya para cocinar.', 52.00, 'pieza', 40),
('Abarrotes', 'Dolores', 'Atún en agua 140 g', 'Atún aleta amarilla en agua.', 24.50, 'pieza', 100),
('Abarrotes', 'Nescafé', 'Café soluble 120 g', 'Café soluble clásico.', 89.00, 'pieza', 30),
('Abarrotes', 'San Juan', 'Huevo blanco 12 piezas', 'Huevo blanco fresco, docena.', 48.00, 'paquete', 50),
-- Limpieza
('Limpieza', 'Ariel', 'Detergente en polvo 1 kg', 'Detergente para ropa blanca y de color.', 62.00, 'pieza', 35),
('Limpieza', 'Cloralex', 'Cloro 950 ml', 'Blanqueador y desinfectante.', 21.50, 'pieza', 60),
('Limpieza', 'Pétalo', 'Papel higiénico 4 rollos', 'Papel higiénico suave de doble hoja.', 36.00, 'paquete', 45),
('Limpieza', 'Salvo', 'Lavatrastes líquido 750 ml', 'Jabón líquido para trastes.', 39.00, 'pieza', 40);

INSERT INTO categorias (nombre)
SELECT DISTINCT n.categoria FROM nuevos_productos n
WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.nombre = n.categoria);

INSERT INTO marcas (nombre)
SELECT DISTINCT n.marca FROM nuevos_productos n
WHERE n.marca IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM marcas m WHERE m.nombre = n.marca);

-- Si una categoría o marca está repetida, se usa la más reciente
INSERT INTO productos (id_categoria, id_marca, nombre, descripcion, precio, unidad, stock, imagen_url, activo)
SELECT
  (SELECT MAX(c.id_categoria) FROM categorias c WHERE c.nombre = n.categoria),
  (SELECT MAX(m.id_marca) FROM marcas m WHERE m.nombre = n.marca),
  n.nombre, n.descripcion, n.precio, n.unidad, n.stock, NULL, 1
FROM nuevos_productos n
WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.nombre = n.nombre);

DROP TEMPORARY TABLE nuevos_productos;
