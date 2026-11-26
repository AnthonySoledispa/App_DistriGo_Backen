-- Modulo 3: clientes (tiendas) y rutas minimas. Compatible con MariaDB 10.4 / MySQL. Idempotente (se puede repetir).
-- Ejecutar con un usuario administrador de MySQL (root):
--   Get-Content -Raw .\database\03_schema_modulo3.sql | & C:\xampp\mysql\bin\mysql.exe -u root
USE distrigo;

-- El Modulo 5 anade dia de visita y asignaciones; no renombrar columnas.
CREATE TABLE IF NOT EXISTS rutas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  creado_por INT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rutas_nombre (nombre),
  KEY idx_rutas_estado (estado),
  CONSTRAINT fk_rutas_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No hay columna de saldo: se calcula a partir de pedidos y pagos (Modulos 4 y 6).
CREATE TABLE IF NOT EXISTS clientes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  contacto VARCHAR(100) NOT NULL,
  telefono VARCHAR(15) NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  ruta_id INT UNSIGNED NULL,
  limite_credito DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  creado_por INT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clientes_nombre (nombre),
  KEY idx_clientes_telefono (telefono),
  KEY idx_clientes_ruta_estado (ruta_id, estado),
  KEY idx_clientes_estado (estado),
  CONSTRAINT chk_clientes_limite CHECK (limite_credito >= 0),
  CONSTRAINT fk_clientes_ruta FOREIGN KEY (ruta_id) REFERENCES rutas (id) ON DELETE RESTRICT,
  CONSTRAINT fk_clientes_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
