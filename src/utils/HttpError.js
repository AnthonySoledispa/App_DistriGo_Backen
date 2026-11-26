'use strict';
class HttpError extends Error {
  constructor(estado, codigo, mensaje, errores, detalles) {
    super(mensaje);
    this.name = 'HttpError';
    this.estado = estado;
    this.codigo = codigo;
    this.errores = errores;
    this.detalles = detalles;
  }
}
module.exports = HttpError;
