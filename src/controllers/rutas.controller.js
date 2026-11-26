'use strict';
const HttpError = require('../utils/HttpError');
const { cuerpoObjeto, idDeRuta, esDuplicado } = require('../utils/peticion');
const V = require('../utils/validacionesClientes');
const { validarCuerpoEstado } = require('../utils/validacionesInventario');
const Ruta = require('../models/ruta.model');

const duplicada = () => new HttpError(409, 'RUTA_DUPLICADA', 'Ya existe una ruta con ese nombre.');

async function obtenerOFallar(id) {
  const r = await Ruta.buscarPorId(id);
  if (!r) throw new HttpError(404, 'RUTA_NO_ENCONTRADA', 'Ruta no encontrada.');
  return r;
}

async function listar(req, res) {
  const { filtros, errores } = V.filtrosRutas(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  res.json({ ok: true, data: await Ruta.listar(filtros) });
}

async function obtener(req, res) {
  res.json({ ok: true, data: await obtenerOFallar(idDeRuta(req)) });
}

async function crear(req, res) {
  const { datos, errores } = V.validarCamposRuta(cuerpoObjeto(req), { parcial: false });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de ruta invalidos.', errores);
  if (await Ruta.buscarDuplicado(datos.nombre)) throw duplicada();
  let id;
  try {
    id = await Ruta.crear({ nombre: datos.nombre, descripcion: datos.descripcion ?? null, creadoPor: req.usuario.id });
  } catch (err) {
    if (esDuplicado(err)) throw duplicada();
    throw err;
  }
  res.status(201).json({ ok: true, data: await Ruta.buscarPorId(id) });
}

async function actualizar(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCamposRuta(cuerpoObjeto(req), { parcial: true });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de ruta invalidos.', errores);
  await obtenerOFallar(id);
  if (datos.nombre !== undefined && (await Ruta.buscarDuplicado(datos.nombre, id))) throw duplicada();
  try {
    await Ruta.actualizar(id, datos);
  } catch (err) {
    if (esDuplicado(err)) throw duplicada();
    throw err;
  }
  res.json({ ok: true, data: await Ruta.buscarPorId(id) });
}

async function cambiarEstado(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = validarCuerpoEstado(cuerpoObjeto(req));
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos invalidos.', errores);
  await obtenerOFallar(id);
  if (datos.estado === 'inactivo' && (await Ruta.contarClientesActivos(id)) > 0) {
    throw new HttpError(409, 'RUTA_EN_USO', 'No se puede desactivar: hay tiendas activas asignadas a esta ruta.');
  }
  await Ruta.cambiarEstado(id, datos.estado);
  res.json({ ok: true, data: await Ruta.buscarPorId(id) });
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
