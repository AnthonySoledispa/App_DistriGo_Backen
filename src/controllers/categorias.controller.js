'use strict';
const HttpError = require('../utils/HttpError');
const { cuerpoObjeto, idDeRuta, esDuplicado } = require('../utils/peticion');
const V = require('../utils/validacionesInventario');
const Categoria = require('../models/categoria.model');

const duplicada = () => new HttpError(409, 'CATEGORIA_DUPLICADA', 'Ya existe una categoria con ese nombre.');

async function obtenerOFallar(id) {
  const c = await Categoria.buscarPorId(id);
  if (!c) throw new HttpError(404, 'CATEGORIA_NO_ENCONTRADA', 'Categoria no encontrada.');
  return c;
}

async function listar(req, res) {
  const { filtros, errores } = V.filtrosCategorias(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  res.json({ ok: true, data: await Categoria.listar(filtros) });
}

async function obtener(req, res) {
  res.json({ ok: true, data: await obtenerOFallar(idDeRuta(req)) });
}

async function crear(req, res) {
  const { datos, errores } = V.validarCamposCategoria(cuerpoObjeto(req), { parcial: false });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de categoria invalidos.', errores);
  if (await Categoria.buscarDuplicado(datos.nombre)) throw duplicada();
  let id;
  try {
    id = await Categoria.crear({
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? null,
      controlaLotes: datos.controla_lotes ?? false,
      creadoPor: req.usuario.id,
    });
  } catch (err) {
    if (esDuplicado(err)) throw duplicada();
    throw err;
  }
  res.status(201).json({ ok: true, data: await Categoria.buscarPorId(id) });
}

async function actualizar(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCamposCategoria(cuerpoObjeto(req), { parcial: true });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de categoria invalidos.', errores);
  const actual = await obtenerOFallar(id);

  if (datos.nombre !== undefined && (await Categoria.buscarDuplicado(datos.nombre, id))) throw duplicada();
  if (datos.controla_lotes !== undefined && datos.controla_lotes !== actual.controla_lotes && actual.tiene_movimientos) {
    throw new HttpError(409, 'CAMBIO_LOTES_NO_PERMITIDO',
      'No se puede cambiar el control de lotes: hay productos de esta categoria con movimientos de inventario.');
  }
  try {
    await Categoria.actualizar(id, datos);
  } catch (err) {
    if (esDuplicado(err)) throw duplicada();
    throw err;
  }
  res.json({ ok: true, data: await Categoria.buscarPorId(id) });
}

async function cambiarEstado(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCuerpoEstado(cuerpoObjeto(req));
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos invalidos.', errores);
  await obtenerOFallar(id);
  if (datos.estado === 'inactivo' && (await Categoria.contarProductosActivos(id)) > 0) {
    throw new HttpError(409, 'CATEGORIA_EN_USO', 'No se puede desactivar: hay productos activos en esta categoria.');
  }
  await Categoria.cambiarEstado(id, datos.estado);
  res.json({ ok: true, data: await Categoria.buscarPorId(id) });
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
