'use strict';
require('dotenv').config({ quiet: true });

function entero(nombre, defecto, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === '') return defecto;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Variable de entorno ${nombre} invalida: debe ser un entero entre ${min} y ${max}.`);
  }
  return n;
}

// Convierte "8h", "30m", "45s", "1d" o un numero de segundos a segundos.
function aSegundos(texto) {
  const m = /^(\d+)\s*([smhd]?)$/i.exec(String(texto).trim());
  if (!m) throw new Error('JWT_EXPIRA_EN invalido. Use por ejemplo 8h, 30m o 3600.');
  const factor = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()];
  const total = Number(m[1]) * factor;
  if (total < 60) throw new Error('JWT_EXPIRA_EN debe ser de al menos 60 segundos.');
  return total;
}

const jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET falta o tiene menos de 32 caracteres. Configure el archivo .env (vea .env.example).');
}

module.exports = Object.freeze({
  puerto: entero('PUERTO', 3000, { min: 0, max: 65535 }),
  host: process.env.HOST || '0.0.0.0',
  entorno: process.env.NODE_ENV || 'development',
  db: Object.freeze({
    host: process.env.DB_HOST || '127.0.0.1',
    puerto: entero('DB_PORT', 3306, { max: 65535 }),
    usuario: process.env.DB_USUARIO || 'distrigo_app',
    contrasena: process.env.DB_CONTRASENA || '',
    nombre: process.env.DB_NOMBRE || 'distrigo',
    limiteConexiones: entero('DB_LIMITE_CONEXIONES', 10, { max: 200 }),
  }),
  jwt: Object.freeze({
    secreto: jwtSecret,
    expiraSegundos: aSegundos(process.env.JWT_EXPIRA_EN || '8h'),
  }),
  sesionInactividadMinutos: entero('SESION_INACTIVIDAD_MINUTOS', 30, { max: 1440 }),
  bcryptRounds: entero('BCRYPT_ROUNDS', 10, { min: 4, max: 15 }),
  login: Object.freeze({
    maxIntentos: entero('LOGIN_MAX_INTENTOS', 10, { max: 100000 }),
    ventanaMinutos: entero('LOGIN_VENTANA_MINUTOS', 15, { max: 1440 }),
  }),
  corsOrigenes: (process.env.CORS_ORIGENES || 'http://localhost:5173')
    .split(',').map((o) => o.trim()).filter(Boolean),
});
