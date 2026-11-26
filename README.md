# DistriGO - Backend

API REST (Node.js + Express + MySQL). Ver `AGENTES.md` para el contexto del proyecto.

## Comandos

- `npm start`: arranca la API (usa `.env`, ver `.env.example`).
- `npm test`: pruebas de los modulos 1, 2 y 3 (secuenciales; cada suite levanta su propio servidor).
- `npm run crear-admin`: crea el primer administrador.
- `npm run limpiar:e2e`: borra los datos de pruebas E2E del panel (ver abajo).

## Base de datos

Scripts en `database/`, ejecutados con root: `00_usuario_bd.sql`, `01_schema_modulo1.sql`, `02_schema_modulo2.sql`, `03_schema_modulo3.sql`
(idempotentes). Ejemplo: `Get-Content -Raw .\database\03_schema_modulo3.sql | & C:\xampp\mysql\bin\mysql.exe -u root`.

## Limpieza de datos E2E (`npm run limpiar:e2e`)

Script `scripts/limpiar-datos-e2e.js`. En una sola transaccion borra, en este orden, `clientes` y `rutas` cuyo nombre empiece por `E2E `, `movimientos_inventario`, `lotes`,
`productos`, `categorias` y `unidades_medida` cuyo producto, categoria o unidad tenga un nombre que empiece por `E2E `.
No toca `usuarios`. Imprime solo los conteos borrados por tabla y sale con codigo 0 si todo va bien o 1 si falla
(la transaccion se revierte). Usa la conexion de `.env`. Pensado para el `globalTeardown` de Playwright del panel;
tambien puede importarse: `require('./scripts/limpiar-datos-e2e').limpiar()`.
