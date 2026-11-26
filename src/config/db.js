'use strict';
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.puerto,
  user: env.db.usuario,
  password: env.db.contrasena,
  database: env.db.nombre,
  connectionLimit: env.db.limiteConexiones,
  charset: 'utf8mb4',
  timezone: 'Z',
  connectTimeout: 5000,
  waitForConnections: true,
  decimalNumbers: true,
  dateStrings: ['DATE'],
});

// Cada conexion nueva fuerza modo estricto y zona horaria UTC.
pool.pool.on('connection', (conexion) => {
  // El callback evita que un fallo emita 'error' sin listener y tumbe el proceso.
  conexion.query(
    "SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', time_zone='+00:00'",
    (err) => {
      if (err) {
        console.error('No se pudo configurar la sesion de BD; se descarta la conexion:', err.code || 'ERROR');
        conexion.destroy();
      }
    }
  );
});

/** Ejecuta una consulta parametrizada (placeholders ?). Devuelve filas o el resultado de escritura. */
async function query(sql, params = []) {
  const [resultado] = await pool.execute(sql, params);
  return resultado;
}

/** Como query(), pero usa la conexion de una transaccion si se entrega. */
async function ejecutar(conexion, sql, params = []) {
  if (!conexion) return query(sql, params);
  const [resultado] = await conexion.execute(sql, params);
  return resultado;
}

/**
 * Ejecuta fn(conexion) dentro de una transaccion: commit si termina bien,
 * rollback y relanza el error si falla. Siempre libera la conexion.
 */
async function conTransaccion(fn) {
  const conexion = await pool.getConnection();
  try {
    // READ COMMITTED: tras bloquear con FOR UPDATE, las lecturas ven siempre el dato mas reciente confirmado.
    await conexion.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await conexion.beginTransaction();
    const resultado = await fn(conexion);
    await conexion.commit();
    return resultado;
  } catch (err) {
    try { await conexion.rollback(); } catch { /* la conexion ya cayo */ }
    throw err;
  } finally {
    conexion.release();
  }
}

module.exports = { pool, query, ejecutar, conTransaccion };
