'use strict';
const HttpError = require('../utils/HttpError');
const { cuerpoObjeto, idDeRuta, esDuplicado } = require('../utils/peticion');
const V = require('../utils/validacionesInventario');
const Producto = require('../models/producto.model');
const Categoria = require('../models/categoria.model');
const Unidad = require('../models/unidad.model');
const Lote = require('../models/lote.model');
const Inventario = require('../services/inventario.service');

const productoDuplicado = () => new HttpError(409, 'PRODUCTO_DUPLICADO', 'Ya existe un producto con ese nombre.');
const skuDuplicado = () => new HttpError(409, 'SKU_DUPLICADO', 'Ya existe un producto con ese SKU.');

/** Traduce un ER_DUP_ENTRY de BD al 409 que corresponde (nombre o SKU). */
function traducirDuplicado(err) {
  if (!esDuplicado(err)) return err;
  return String(err.message).includes('uq_productos_sku') ? skuDuplicado() : productoDuplicado();
}

async function obtenerOFallar(id) {
  const p = await Producto.buscarPorId(id);
  if (!p) throw new HttpError(404, 'PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado.');
  return p;
}

async function categoriaActivaOFallar(id) {
  const c = await Categoria.buscarPorId(id);
  if (!c) throw new HttpError(404, 'CATEGORIA_NO_ENCONTRADA', 'La categoria indicada no existe.');
  if (c.estado !== 'activo') throw new HttpError(409, 'CATEGORIA_INACTIVA', 'La categoria indicada esta inactiva.');
  return c;
}

async function unidadActivaOFallar(id) {
  const u = await Unidad.buscarPorId(id);
  if (!u) throw new HttpError(404, 'UNIDAD_NO_ENCONTRADA', 'La unidad de medida indicada no existe.');
  if (u.estado !== 'activo') throw new HttpError(409, 'UNIDAD_INACTIVA', 'La unidad de medida indicada esta inactiva.');
  return u;
}

function exigirCantidadPorUnidad(campo, valor, unidad) {
  if (valor === undefined) return;
  const e = V.errorPorUnidad(valor, unidad);
  if (e) throw new HttpError(400, 'VALIDACION', e, [{ campo, mensaje: e }]);
}

async function verificarDuplicados(datos, excluirId) {
  if (datos.nombre !== undefined && (await Producto.buscarDuplicadoNombre(datos.nombre, excluirId))) throw productoDuplicado();
  if (datos.sku && (await Producto.buscarDuplicadoSku(datos.sku, excluirId))) throw skuDuplicado();
}

async function listar(req, res) {
  const { filtros, errores } = V.filtrosProductos(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  res.json({ ok: true, data: await Producto.listar(filtros) });
}

async function obtener(req, res) {
  res.json({ ok: true, data: await obtenerOFallar(idDeRuta(req)) });
}

async function listarLotes(req, res) {
  const id = idDeRuta(req);
  const { filtros, errores } = V.filtrosLotes(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  const producto = await obtenerOFallar(id);
  if (!producto.controla_lotes) {
    throw new HttpError(409, 'PRODUCTO_SIN_LOTES', 'La categoria de este producto no controla lotes.');
  }
  res.json({ ok: true, data: await Lote.listarPorProducto(id, filtros) });
}

async function crear(req, res) {
  const { datos, errores } = V.validarCamposProducto(cuerpoObjeto(req), { parcial: false });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de producto invalidos.', errores);

  const categoria = await categoriaActivaOFallar(datos.categoria_id);
  const unidad = await unidadActivaOFallar(datos.unidad_id);
  exigirCantidadPorUnidad('stock_minimo', datos.stock_minimo, unidad);
  await verificarDuplicados(datos);

  let id;
  try {
    id = await Inventario.crearProductoConStockInicial(req.usuario.id, datos, {
      controlaLotes: categoria.controla_lotes, unidad,
    });
  } catch (err) {
    throw traducirDuplicado(err);
  }
  res.status(201).json({ ok: true, data: await Producto.buscarPorId(id) });
}

async function actualizar(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCamposProducto(cuerpoObjeto(req), { parcial: true });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de producto invalidos.', errores);
  const actual = await obtenerOFallar(id);

  let controlaLotes = actual.controla_lotes;
  let permiteDecimales = actual.permite_decimales;
  let unidad = { nombre: actual.unidad_nombre, permite_decimales: actual.permite_decimales };

  if (datos.categoria_id !== undefined && datos.categoria_id !== actual.categoria_id) {
    controlaLotes = (await categoriaActivaOFallar(datos.categoria_id)).controla_lotes;
  }
  if (datos.unidad_id !== undefined && datos.unidad_id !== actual.unidad_id) {
    const u = await unidadActivaOFallar(datos.unidad_id);
    permiteDecimales = u.permite_decimales;
    unidad = u;
  }
  if (actual.tiene_movimientos && (controlaLotes !== actual.controla_lotes || permiteDecimales !== actual.permite_decimales)) {
    throw new HttpError(409, 'CAMBIO_NO_PERMITIDO',
      'No se puede cambiar la categoria o la unidad a una con distinto control de lotes o decimales: el producto tiene movimientos.');
  }
  exigirCantidadPorUnidad('stock_minimo', datos.stock_minimo ?? actual.stock_minimo, unidad);
  await verificarDuplicados(datos, id);

  try {
    await Producto.actualizar(id, datos);
  } catch (err) {
    throw traducirDuplicado(err);
  }
  res.json({ ok: true, data: await Producto.buscarPorId(id) });
}

async function cambiarEstado(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCuerpoEstado(cuerpoObjeto(req));
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos invalidos.', errores);
  await obtenerOFallar(id);
  await Producto.cambiarEstado(id, datos.estado);
  res.json({ ok: true, data: await Producto.buscarPorId(id) });
}

async function eliminar(req, res) {
  const id = idDeRuta(req);
  await obtenerOFallar(id);
  const conMovimientos = () => new HttpError(409, 'PRODUCTO_CON_MOVIMIENTOS',
    'El producto tiene movimientos de inventario; solo puede desactivarse.');
  if (await Producto.tieneMovimientos(id)) throw conMovimientos();
  try {
    await Producto.eliminar(id);
  } catch (err) {
    // Respaldo: la FK RESTRICT impide borrar si aparecieron movimientos entre la consulta y el borrado.
    if (err && (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED')) throw conMovimientos();
    throw err;
  }
  res.json({ ok: true, data: { id, eliminado: true } });
}

module.exports = { listar, obtener, listarLotes, crear, actualizar, cambiarEstado, eliminar };
