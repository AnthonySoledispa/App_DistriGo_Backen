-- Crea el usuario de aplicacion con permisos solo sobre la BD distrigo.
-- Sustituya CAMBIAR_AQUI por la contrasena real (la misma de DB_CONTRASENA en .env).
-- No versione la contrasena real.
CREATE USER IF NOT EXISTS 'distrigo_app'@'localhost' IDENTIFIED BY 'CAMBIAR_AQUI';
CREATE USER IF NOT EXISTS 'distrigo_app'@'127.0.0.1' IDENTIFIED BY 'CAMBIAR_AQUI';
ALTER USER 'distrigo_app'@'localhost' IDENTIFIED BY 'CAMBIAR_AQUI';
ALTER USER 'distrigo_app'@'127.0.0.1' IDENTIFIED BY 'CAMBIAR_AQUI';
GRANT SELECT, INSERT, UPDATE, DELETE ON distrigo.* TO 'distrigo_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON distrigo.* TO 'distrigo_app'@'127.0.0.1';
FLUSH PRIVILEGES;
