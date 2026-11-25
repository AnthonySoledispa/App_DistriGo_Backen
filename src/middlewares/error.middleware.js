'use strict';
const HttpError = require('../utils/HttpError');
const env = require('../config/env');

const CODIGOS_BD_CAIDA = new Set([
  'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_CON_COUNT_ERROR',
]);

function noEncontrado(req, _res, next) {
  next(new HttpError(404, 'RUTA_NO_ENCONTRADA', 'Ruta no encontrada.'));
}

// eslint-disable-next-line no-unused-vars
function manejarErrores(err, _req, res, _next) {
  let estado = 500;
  let cuerpo = { ok: false, codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' };

  if (err instanceof HttpError) {
    estado = err.estado;
    cuerpo = { ok: false, codigo: err.codigo, mensaje: err.message };
    if (err.errores) cuerpo.errores = err.errores;
  } else if (err && err.type === 'entity.parse.failed') {
    estado = 400;
    cuerpo = { ok: false, codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la solicitud no es un JSON valido.' };
  } else if (err && err.type === 'entity.too.large') {
    estado = 413;
    cuerpo = { ok: false, codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo de la solicitud es demasiado grande.' };
  } else if (err && (CODIGOS_BD_CAIDA.has(err.code) || err.fatal)) {
    estado = 503;
    cuerpo = { ok: false, codigo: 'BD_NO_DISPONIBLE', mensaje: 'Base de datos no disponible' };
    console.error(`[BD] ${err.code || err.message}`);
  } else {
    // Se registra en el servidor; nunca se envia el stack al cliente.
    console.error('[ERROR]', env.entorno === 'production' ? (err && err.message) : err);
  }

  if (res.headersSent) return;
  res.status(estado).json(cuerpo);
}

module.exports = { noEncontrado, manejarErrores };
