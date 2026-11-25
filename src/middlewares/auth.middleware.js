'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../utils/HttpError');
const Sesion = require('../models/sesion.model');

/** Verifica el JWT y que la sesion siga vigente. Deja req.usuario y req.sesion. */
async function verificarToken(req, _res, next) {
  const cabecera = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(cabecera);
  if (!m) throw new HttpError(401, 'TOKEN_AUSENTE', 'Debe iniciar sesion para acceder.');

  let payload;
  try {
    payload = jwt.verify(m[1], env.jwt.secreto, { algorithms: ['HS256'] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      const decodificado = jwt.decode(m[1]);
      if (decodificado && typeof decodificado.jti === 'string') {
        await Sesion.cerrar(decodificado.jti, 'expirada');
      }
      throw new HttpError(401, 'SESION_EXPIRADA', 'Su sesion ha expirado. Inicie sesion nuevamente.');
    }
    throw new HttpError(401, 'TOKEN_INVALIDO', 'Token invalido.');
  }

  if (typeof payload.jti !== 'string' || typeof payload.sub !== 'string') {
    throw new HttpError(401, 'TOKEN_INVALIDO', 'Token invalido.');
  }

  const sesion = await Sesion.buscarConUsuario(payload.jti);
  if (!sesion || sesion.cerrada_en || String(sesion.usuario_id) !== payload.sub) {
    throw new HttpError(401, 'SESION_CERRADA', 'La sesion fue cerrada. Inicie sesion nuevamente.');
  }
  if (sesion.expirada) {
    await Sesion.cerrar(sesion.id, 'expirada');
    throw new HttpError(401, 'SESION_EXPIRADA', 'Su sesion ha expirado. Inicie sesion nuevamente.');
  }
  if (sesion.segundos_inactiva > env.sesionInactividadMinutos * 60) {
    await Sesion.cerrar(sesion.id, 'inactividad');
    throw new HttpError(401, 'SESION_EXPIRADA', 'Su sesion expiro por inactividad. Inicie sesion nuevamente.');
  }
  if (sesion.estado !== 'activo') {
    await Sesion.cerrar(sesion.id, 'desactivado');
    throw new HttpError(401, 'SESION_CERRADA', 'La sesion fue cerrada. Inicie sesion nuevamente.');
  }

  await Sesion.registrarActividad(sesion.id);
  req.sesion = { id: sesion.id, cliente: sesion.cliente };
  // El rol se toma de la BD, no del token.
  req.usuario = { id: sesion.usuario_id, nombre: sesion.nombre, correo: sesion.correo, rol: sesion.rol };
  next();
}

module.exports = { verificarToken };
