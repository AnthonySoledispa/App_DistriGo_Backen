-- Modulo 2: productos e inventario. Compatible con MariaDB 10.4 / MySQL. Idempotente (se puede repetir).
-- Ejecutar con un usuario administrador de MySQL (root):
--   Get-Content -Raw .\database\02_schema_modulo2.sql | & C:\xampp\mysql\bin\mysql.exe -u root
USE distrigo;

CREATE TABLE IF NOT EXISTS unidades_medida (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(50) NOT NULL,
  abreviatura VARCHAR(10) NOT NULL,
  permite_decimales TINYINT(1) NOT NULL DEFAULT 0,
  estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  creado_por INT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_unidades_nombre (nombre),
  UNIQUE KEY uq_unidades_abreviatura (abreviatura),
  CONSTRAINT fk_unidades_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  controla_lotes TINYINT(1) NOT NULL DEFAULT 0,
  estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  creado_por INT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_nombre (nombre),
  CONSTRAINT fk_categorias_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  sku VARCHAR(50) NULL,
  descripcion VARCHAR(255) NULL,
  categoria_id INT UNSIGNED NOT NULL,
  unidad_id INT UNSIGNED NOT NULL,
  precio_venta DECIMAL(10,2) NOT NULL,
  stock_actual DECIMAL(12,3) NOT NULL DEFAULT 0,
  stock_minimo DECIMAL(12,3) NOT NULL DEFAULT 0,
  estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  creado_por INT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_nombre (nombre),
  UNIQUE KEY uq_productos_sku (sku),
  KEY idx_productos_categoria_estado (categoria_id, estado),
  KEY idx_productos_unidad (unidad_id),
  KEY idx_productos_estado (estado),
  CONSTRAINT chk_productos_precio CHECK (precio_venta > 0),
  CONSTRAINT chk_productos_stock CHECK (stock_actual >= 0),
  CONSTRAINT chk_productos_stock_minimo CHECK (stock_minimo >= 0),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE RESTRICT,
  CONSTRAINT fk_productos_unidad FOREIGN KEY (unidad_id) REFERENCES unidades_medida (id) ON DELETE RESTRICT,
  CONSTRAINT fk_productos_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lotes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id INT UNSIGNED NOT NULL,
  codigo_lote VARCHAR(50) NOT NULL,
  fecha_caducidad DATE NOT NULL,
  cantidad_ingresada DECIMAL(12,3) NOT NULL DEFAULT 0,
  cantidad_disponible DECIMAL(12,3) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lotes_producto_codigo (producto_id, codigo_lote),
  KEY idx_lotes_caducidad (fecha_caducidad, cantidad_disponible),
  CONSTRAINT chk_lotes_disponible CHECK (cantidad_disponible >= 0),
  CONSTRAINT fk_lotes_producto FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id INT UNSIGNED NOT NULL,
  lote_id INT UNSIGNED NULL,
  tipo ENUM('entrada','salida','ajuste') NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL,
  stock_anterior DECIMAL(12,3) NOT NULL,
  stock_resultante DECIMAL(12,3) NOT NULL,
  motivo ENUM('stock_inicial','danio','perdida','merma','caducidad','correccion','otro','despacho') NULL,
  observacion VARCHAR(255) NULL,
  fecha_movimiento DATE NOT NULL,
  referencia_tipo ENUM('pedido') NULL,
  referencia_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mov_producto_creado (producto_id, creado_en, id),
  KEY idx_mov_tipo_fecha (tipo, fecha_movimiento),
  KEY idx_mov_referencia (referencia_tipo, referencia_id),
  KEY idx_mov_usuario (usuario_id),
  KEY idx_mov_lote (lote_id),
  CONSTRAINT chk_mov_cantidad CHECK (cantidad <> 0),
  CONSTRAINT chk_mov_resultante CHECK (stock_resultante >= 0),
  CONSTRAINT fk_mov_producto FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE RESTRICT,
  CONSTRAINT fk_mov_lote FOREIGN KEY (lote_id) REFERENCES lotes (id) ON DELETE RESTRICT,
  CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Precarga de unidades (decision del usuario 25/11/2026). Solo Litro admite decimales.
INSERT IGNORE INTO unidades_medida (nombre, abreviatura, permite_decimales, creado_por) VALUES
  ('Unidad', 'u', 0, NULL),
  ('Caja', 'caja', 0, NULL),
  ('Paquete', 'paq', 0, NULL),
  ('Litro', 'L', 1, NULL);
