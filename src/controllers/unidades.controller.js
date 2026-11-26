'use strict';
const HttpError = require('../utils/HttpError');
const { cuerpoObjeto, idDeRuta, esDuplicado } = require('../utils/peticion');
const V = require('../utils/validacionesInventario');
const Unidad = require('../models/unidad.model');

const duplicada = () => new HttpError(409, 'UNIDAD_DUPLICADA', 'Ya existe una unidad con ese nombre o abreviatura.');

async function obtenerOFallar(id) {
  const u = await Unidad.buscarPorId(id);
  if (!u) throw new HttpError(404, 'UNIDAD_NO_ENCONTRADA', 'Unidad de medida no encontrada.');
  return u;
}

async function listar(req, res) {
  const { filtros, errores } = V.filtrosUnidades(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  res.json({ ok: true, data: await Unidad.listar(filtros) });
}

async function obtener(req, res) {
  res.json({ ok: true, data: await obtenerOFallar(idDeRuta(req)) });
}

async function crear(req, res) {
  const { datos, errores } = V.validarCamposUnidad(cuerpoObjeto(req), { parcial: false });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de unidad invalidos.', errores);
  if (await Unidad.buscarDuplicado(datos)) throw duplicada();
  let id;
  try {
    id = await Unidad.crear({
      nombre: datos.nombre,
      abreviatura: datos.abreviatura,
      permiteDecimales: datos.permite_decimales ?? false,
      creadoPor: req.usuario.id,
    });
  } catch (err) {
    if (esDuplicado(err)) throw duplicada();
    throw err;
  }
  res.status(201).json({ ok: true, data: await Unidad.buscarPorId(id) });
}

async function actualizar(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCamposUnidad(cuerpoObjeto(req), { parcial: true });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de unidad invalidos.', errores);
  const actual = await obtenerOFallar(id);

  if (datos.nombre !== undefined || datos.abreviatura !== undefined) {
    if (await Unidad.buscarDuplicado(datos, id)) throw duplicada();
  }
  if (datos.permite_decimales !== undefined && datos.permite_decimales !== actual.permite_decimales
    && actual.tiene_movimientos) {
    throw new HttpError(409, 'CAMBIO_NO_PERMITIDO',
      'No se puede cambiar si la unidad admite decimales: hay productos con movimientos de inventario.');
  }
  try {
    await Unidad.actualizar(id, datos);
  } catch (err) {
    if (esDuplicado(err)) throw duplicada();
    throw err;
  }
  res.json({ ok: true, data: await Unidad.buscarPorId(id) });
}

async function cambiarEstado(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCuerpoEstado(cuerpoObjeto(req));
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos invalidos.', errores);
  await obtenerOFallar(id);
  if (datos.estado === 'inactivo' && (await Unidad.contarProductosActivos(id)) > 0) {
    throw new HttpError(409, 'UNIDAD_EN_USO', 'No se puede desactivar: hay productos activos que usan esta unidad.');
  }
  await Unidad.cambiarEstado(id, datos.estado);
  res.json({ ok: true, data: await Unidad.buscarPorId(id) });
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
