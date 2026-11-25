'use strict';
const HttpError = require('../utils/HttpError');

/** Debe ir despues de verificarToken. */
function permitirRoles(...roles) {
  return (req, _res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      throw new HttpError(403, 'ACCESO_DENEGADO', 'No tiene permisos para realizar esta accion.');
    }
    next();
  };
}

module.exports = { permitirRoles };
