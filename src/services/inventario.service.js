'use strict';
// Servicio de inventario: unico lugar donde cambia el stock.
// Cada cambio inserta un movimiento inmutable en la MISMA transaccion que actualiza el saldo (RB-01, RF-19).
const { conTransaccion } = require('../config/db');
const HttpError = require('../utils/HttpError');
const { hoyNegocio } = require('../utils/fechas');
const { validarCantidad, errorPorUnidad } = require('../utils/validacionesInventario');
const Producto = require('../models/producto.model');
const Lote = require('../models/lote.model');
const Movimiento = require('../models/movimiento.model');

const r3 = (n) => Math.round(n * 1000) / 1000;

function stockInsuficiente(abreviatura, detalles) {
  return new HttpError(409, 'STOCK_INSUFICIENTE',
    `Stock insuficiente. Disponible: ${detalles.disponible} ${abreviatura}.`, undefined, detalles);
}

/** Bloquea el producto y devuelve su ficha completa (categoria, unidad, stock). 404 si no existe. */
async function bloquearProducto(conexion, productoId) {
  const base = await Producto.bloquear(productoId, conexion);
  if (!base) throw new HttpError(404, 'PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado.');
  return Producto.buscarPorId(productoId, conexion);
}

function validarUnidad(cantidad, producto) {
  const e = errorPorUnidad(cantidad, { nombre: producto.unidad_nombre, permite_decimales: producto.permite_decimales });
  if (e) throw new HttpError(400, 'VALIDACION', e, [{ campo: 'cantidad', mensaje: e }]);
}

/** Aplica una entrada (con o sin lote) sobre un producto ya bloqueado. Devuelve el id del movimiento. */
async function aplicarEntrada(conexion, producto, { cantidad, fecha, codigoLote, fechaCaducidad, observacion, motivo, usuarioId }) {
  validarUnidad(cantidad, producto);
  let loteId = null;
  if (producto.controla_lotes) {
    if (!codigoLote || !fechaCaducidad) {
      throw new HttpError(400, 'LOTE_REQUERIDO',
        'La categoria controla lotes: indique el codigo de lote y la fecha de caducidad.', [
          ...(!codigoLote ? [{ campo: 'codigo_lote', mensaje: 'Es obligatorio.' }] : []),
          ...(!fechaCaducidad ? [{ campo: 'fecha_caducidad', mensaje: 'Es obligatoria.' }] : []),
        ]);
    }
    const existente = await Lote.buscarPorProductoYCodigo(producto.id, codigoLote, conexion, { bloquear: true });
    if (existente) {
      if (existente.fecha_caducidad !== fechaCaducidad) {
        throw new HttpError(409, 'LOTE_CADUCIDAD_DISTINTA',
          `El lote ${codigoLote} ya existe con otra fecha de caducidad (${existente.fecha_caducidad}).`);
      }
      loteId = existente.id;
    } else {
      loteId = await Lote.crear({ productoId: producto.id, codigoLote, fechaCaducidad }, conexion);
    }
    await Lote.sumar(loteId, cantidad, conexion);
  } else if (codigoLote !== undefined || fechaCaducidad !== undefined) {
    throw new HttpError(400, 'LOTE_NO_APLICA', 'La categoria del producto no controla lotes: no envie datos de lote.');
  }

  const anterior = await Producto.leerStockActual(producto.id, conexion);
  await Producto.sumarStock(producto.id, cantidad, conexion);
  const resultante = await Producto.leerStockActual(producto.id, conexion);
  return Movimiento.crear({
    productoId: producto.id, loteId, tipo: 'entrada', cantidad, stockAnterior: anterior,
    stockResultante: resultante, motivo: motivo ?? null, observacion: observacion ?? null,
    fechaMovimiento: fecha ?? hoyNegocio(), usuarioId,
  }, conexion);
}

/** RF-12: entrada de mercaderia. Devuelve { movimiento, producto }. */
async function registrarEntrada(usuarioId, datos) {
  const movId = await conTransaccion(async (conexion) => {
    const producto = await bloquearProducto(conexion, datos.producto_id);
    if (producto.estado !== 'activo') {
      throw new HttpError(409, 'PRODUCTO_INACTIVO', 'El producto esta inactivo: actívelo para registrar entradas.');
    }
    return aplicarEntrada(conexion, producto, {
      cantidad: datos.cantidad, fecha: datos.fecha, codigoLote: datos.codigo_lote,
      fechaCaducidad: datos.fecha_caducidad, observacion: datos.observacion, usuarioId,
    });
  });
  return { movimiento: await Movimiento.buscarPorId(movId), producto: await Producto.buscarPorId(datos.producto_id) };
}

/** RF-09 + DERCAS 10.1: crea el producto y, si hay stock inicial, su entrada, en una sola transaccion. */
async function crearProductoConStockInicial(usuarioId, datos, { controlaLotes, unidad }) {
  const stockInicial = datos.stock_inicial ?? 0;
  const hayLote = datos.codigo_lote !== undefined || datos.fecha_caducidad !== undefined;
  if (stockInicial > 0) {
    const e = errorPorUnidad(stockInicial, unidad);
    if (e) throw new HttpError(400, 'VALIDACION', e, [{ campo: 'stock_inicial', mensaje: e }]);
  }
  if (!controlaLotes && hayLote) {
    throw new HttpError(400, 'LOTE_NO_APLICA', 'La categoria del producto no controla lotes: no envie datos de lote.');
  }
  if (stockInicial <= 0 && hayLote) {
    throw new HttpError(400, 'VALIDACION', 'Los datos de lote solo aplican con un stock inicial mayor que cero.', [
      { campo: 'stock_inicial', mensaje: 'Indique un stock inicial mayor que cero.' },
    ]);
  }
  if (stockInicial > 0 && controlaLotes && (!datos.codigo_lote || !datos.fecha_caducidad)) {
    throw new HttpError(400, 'LOTE_REQUERIDO',
      'La categoria controla lotes: con stock inicial indique codigo de lote y fecha de caducidad.');
  }
  return conTransaccion(async (conexion) => {
    const id = await Producto.crear({ ...datos, creado_por: usuarioId }, conexion);
    if (stockInicial > 0) {
      const producto = await bloquearProducto(conexion, id);
      await aplicarEntrada(conexion, producto, {
        cantidad: stockInicial, fecha: datos.fecha, codigoLote: datos.codigo_lote,
        fechaCaducidad: datos.fecha_caducidad, motivo: 'stock_inicial', usuarioId,
      });
    }
    return id;
  });
}

/** RF-18: ajuste de inventario (disminucion o aumento) con motivo. Devuelve { movimiento, producto }. */
async function registrarAjuste(usuarioId, datos) {
  const movId = await conTransaccion(async (conexion) => {
    const producto = await bloquearProducto(conexion, datos.producto_id);
    validarUnidad(datos.cantidad, producto);
    const hoy = hoyNegocio();
    const cantidad = datos.cantidad;
    let lote = null;

    if (producto.controla_lotes) {
      if (datos.lote_id === undefined) {
        throw new HttpError(400, 'LOTE_REQUERIDO', 'La categoria controla lotes: indique el lote del ajuste.', [
          { campo: 'lote_id', mensaje: 'Es obligatorio.' },
        ]);
      }
      lote = await Lote.buscarPorId(datos.lote_id, conexion, { bloquear: true });
      if (!lote || lote.producto_id !== producto.id) {
        throw new HttpError(404, 'LOTE_NO_ENCONTRADO', 'Lote no encontrado para este producto.');
      }
    } else if (datos.lote_id !== undefined) {
      throw new HttpError(400, 'LOTE_NO_APLICA', 'La categoria del producto no controla lotes: no envie lote_id.');
    }

    const anterior = await Producto.leerStockActual(producto.id, conexion);
    let firmada;
    if (datos.tipo_ajuste === 'aumento') {
      if (lote && lote.fecha_caducidad < hoy) {
        throw new HttpError(409, 'LOTE_VENCIDO', 'El lote esta vencido: no se puede aumentar; solo darlo de baja.');
      }
      if (lote) await Lote.sumar(lote.id, cantidad, conexion);
      await Producto.sumarStock(producto.id, cantidad, conexion);
      firmada = cantidad;
    } else {
      if (lote && lote.cantidad_disponible < cantidad) {
        throw stockInsuficiente(producto.unidad_abreviatura, { lote_id: lote.id, disponible: lote.cantidad_disponible });
      }
      if ((await Producto.restarStock(producto.id, cantidad, conexion)) === 0) {
        throw stockInsuficiente(producto.unidad_abreviatura, { producto_id: producto.id, disponible: anterior });
      }
      if (lote && (await Lote.restar(lote.id, cantidad, conexion)) === 0) {
        throw stockInsuficiente(producto.unidad_abreviatura, { lote_id: lote.id, disponible: lote.cantidad_disponible });
      }
      firmada = -cantidad;
    }
    const resultante = await Producto.leerStockActual(producto.id, conexion);
    return Movimiento.crear({
      productoId: producto.id, loteId: lote ? lote.id : null, tipo: 'ajuste', cantidad: firmada,
      stockAnterior: anterior, stockResultante: resultante, motivo: datos.motivo,
      observacion: datos.observacion ?? null, fechaMovimiento: datos.fecha ?? hoy, usuarioId,
    }, conexion);
  });
  return { movimiento: await Movimiento.buscarPorId(movId), producto: await Producto.buscarPorId(datos.producto_id) };
}

/**
 * Contrato para el Modulo 4: stock vendible de un producto, con la misma formula que la API.
 * Con bloquear=true toma FOR UPDATE sobre el producto y sus lotes vigentes (usar dentro de una transaccion).
 */
async function obtenerStockVendible(conexion, productoId, { bloquear = false } = {}) {
  if (bloquear) {
    const base = await Producto.bloquear(productoId, conexion);
    if (!base) throw new HttpError(404, 'PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado.');
    await Lote.bloquearVigentes(productoId, hoyNegocio(), conexion);
  }
  const p = await Producto.buscarPorId(productoId, conexion);
  if (!p) throw new HttpError(404, 'PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado.');
  return {
    producto_id: p.id,
    stock_actual: p.stock_actual,
    stock_vendible: p.stock_vendible,
    stock_vencido: p.stock_vencido,
    unidad_abreviatura: p.unidad_abreviatura,
  };
}

/**
 * RF-13: salida por despacho. Usa la conexion de la transaccion del llamador (Modulo 5).
 * Valida contra el stock vendible; con lotes consume FEFO (primero el que caduca antes) y
 * crea un movimiento por lote. Lanza 409 STOCK_INSUFICIENTE sin escribir nada si no alcanza.
 * Devuelve los movimientos creados.
 */
async function registrarSalida(conexion, { productoId, cantidad, usuarioId, referencia, fecha } = {}) {
  const vc = validarCantidad(cantidad);
  if (vc.error) throw new HttpError(400, 'VALIDACION', vc.error, [{ campo: 'cantidad', mensaje: vc.error }]);
  if (!referencia || referencia.tipo !== 'pedido' || !Number.isInteger(referencia.id) || referencia.id < 1) {
    throw new HttpError(400, 'VALIDACION', 'La salida requiere la referencia del pedido.');
  }
  if (!Number.isInteger(usuarioId)) throw new HttpError(400, 'VALIDACION', 'La salida requiere el usuario que despacha.');

  const producto = await bloquearProducto(conexion, productoId);
  validarUnidad(cantidad, producto);
  const hoy = hoyNegocio();
  const fechaMov = fecha ?? hoy;
  const ids = [];

  const registrar = async (loteId, cant) => {
    const anterior = await Producto.leerStockActual(producto.id, conexion);
    if ((await Producto.restarStock(producto.id, cant, conexion)) === 0) {
      throw stockInsuficiente(producto.unidad_abreviatura, { producto_id: producto.id, disponible: anterior });
    }
    const resultante = await Producto.leerStockActual(producto.id, conexion);
    ids.push(await Movimiento.crear({
      productoId: producto.id, loteId, tipo: 'salida', cantidad: -cant, stockAnterior: anterior,
      stockResultante: resultante, motivo: 'despacho', fechaMovimiento: fechaMov,
      referenciaTipo: referencia.tipo, referenciaId: referencia.id, usuarioId,
    }, conexion));
  };

  if (!producto.controla_lotes) {
    if (producto.stock_actual < cantidad) {
      throw stockInsuficiente(producto.unidad_abreviatura, { producto_id: producto.id, disponible: producto.stock_actual });
    }
    await registrar(null, cantidad);
  } else {
    const lotes = await Lote.vigentesFEFO(producto.id, hoy, conexion);
    const vendible = r3(lotes.reduce((s, l) => s + l.cantidad_disponible, 0));
    if (vendible < cantidad) {
      throw stockInsuficiente(producto.unidad_abreviatura, { producto_id: producto.id, disponible: vendible });
    }
    let faltante = cantidad;
    for (const lote of lotes) {
      if (faltante <= 0) break;
      const tomar = r3(Math.min(faltante, lote.cantidad_disponible));
      if ((await Lote.restar(lote.id, tomar, conexion)) === 0) {
        throw stockInsuficiente(producto.unidad_abreviatura, { producto_id: producto.id, disponible: vendible });
      }
      await registrar(lote.id, tomar);
      faltante = r3(faltante - tomar);
    }
  }
  const movimientos = [];
  for (const id of ids) movimientos.push(await Movimiento.buscarPorId(id, conexion));
  return movimientos;
}

module.exports = {
  registrarEntrada, crearProductoConStockInicial, registrarAjuste, registrarSalida, obtenerStockVendible,
};
