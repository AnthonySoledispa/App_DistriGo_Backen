-- Modulo 1: autenticacion y usuarios. Compatible con MariaDB 10.4 / MySQL.
CREATE DATABASE IF NOT EXISTS distrigo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE distrigo;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) NOT NULL,
  contrasena_hash VARCHAR(255) NOT NULL,
  rol ENUM('administrador','repartidor') NOT NULL,
  estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  ultimo_acceso DATETIME NULL,
  creado_por INT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_correo (correo),
  KEY idx_usuarios_rol_estado (rol, estado),
  CONSTRAINT fk_usuarios_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones (
  id CHAR(36) NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  cliente ENUM('web','movil') NOT NULL,
  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  cerrada_en DATETIME NULL,
  motivo_cierre ENUM('logout','inactividad','desactivado','cambio_credenciales','expirada') NULL,
  ip VARCHAR(45) NULL,
  PRIMARY KEY (id),
  KEY idx_sesiones_usuario_cerrada (usuario_id, cerrada_en),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
