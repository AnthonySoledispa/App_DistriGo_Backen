'use strict';
const HttpError = require('./HttpError');
const V = require('./validaciones');

function cuerpoObjeto(req) {
  const cuerpo = req.body ?? {};
  if (!V.esObjeto(cuerpo)) throw new HttpError(400, 'VALIDACION', 'El cuerpo debe ser un objeto JSON.');
  return cuerpo;
}

function idDeRuta(req) {
  const id = V.parsearId(req.params.id);
  if (id === null) {
    throw new HttpError(400, 'VALIDACION', 'El id debe ser un entero positivo.', [
      { campo: 'id', mensaje: 'El id debe ser un entero positivo.' },
    ]);
  }
  return id;
}

const esDuplicado = (err) => Boolean(err) && err.code === 'ER_DUP_ENTRY';

module.exports = { cuerpoObjeto, idDeRuta, esDuplicado };
