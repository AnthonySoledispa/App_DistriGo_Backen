'use strict';
class HttpError extends Error {
  constructor(estado, codigo, mensaje, errores) {
    super(mensaje);
    this.name = 'HttpError';
    this.estado = estado;
    this.codigo = codigo;
    this.errores = errores;
  }
}
module.exports = HttpError;
