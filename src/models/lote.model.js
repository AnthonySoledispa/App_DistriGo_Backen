'use strict';
const { ejecutar } = require('../config/db');
const env = require('../config/env');
const { hoyNegocio, sumarDias, diasEntre } = require('../utils/fechas');

const COLUMNAS = 'l.id, l.producto_id, l.codigo_lote, l.fecha_caducidad, l.cantidad_ingresada, l.cantidad_disponible';

/** Agrega dias_para_vencer y estado_caducidad (vigente | por_vencer | vencido). */
function enriquecer(lote, hoy = hoyNegocio(), dias = env.alertaCaducidadDias) {
  if (!lote) return null;
  const restantes = diasEntre(hoy, lote.fecha_caducidad);
  let estado = 'vigente';
  if (lote.fecha_caducidad < hoy) estado = 'vencido';
  else if (lote.fecha_caducidad <= sumarDias(hoy, dias)) estado = 'por_vencer';
  return { ...lote, dias_para_vencer: restantes, estado_caducidad: estado };
}

async function listarPorProducto(productoId, { con_stock: conStock } = {}, conexion) {
  const cond = ['l.producto_id = ?'];
  if (conStock === true) cond.push('l.cantidad_disponible > 0');
  const filas = await ejecutar(conexion,
    `SELECT ${COLUMNAS} FROM lotes l WHERE ${cond.join(' AND ')} ORDER BY l.fecha_caducidad ASC, l.id ASC`, [productoId]);
  const hoy = hoyNegocio();
  return filas.map((f) => enriquecer(f, hoy));
}

async function buscarPorId(id, conexion, { bloquear = false } = {}) {
  const f = await ejecutar(conexion,
    `SELECT ${COLUMNAS} FROM lotes l WHERE l.id = ? LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  return f[0] ?? null;
}

async function buscarPorProductoYCodigo(productoId, codigo, conexion, { bloquear = false } = {}) {
  const f = await ejecutar(conexion,
    `SELECT ${COLUMNAS} FROM lotes l WHERE l.producto_id = ? AND l.codigo_lote = ? LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
    [productoId, codigo]);
  return f[0] ?? null;
}

async function crear({ productoId, codigoLote, fechaCaducidad }, conexion) {
  const r = await ejecutar(conexion,
    'INSERT INTO lotes (producto_id, codigo_lote, fecha_caducidad) VALUES (?, ?, ?)',
    [productoId, codigoLote, fechaCaducidad]);
  return r.insertId;
}

/** Suma al lote: aumenta lo ingresado y lo disponible. */
async function sumar(id, cantidad, conexion) {
  await ejecutar(conexion,
    `UPDATE lotes SET cantidad_ingresada = cantidad_ingresada + CAST(? AS DECIMAL(12,3)),
       cantidad_disponible = cantidad_disponible + CAST(? AS DECIMAL(12,3)) WHERE id = ?`,
    [cantidad, cantidad, id]);
}

/** Resta del disponible solo si alcanza. Devuelve filas afectadas. */
async function restar(id, cantidad, conexion) {
  const r = await ejecutar(conexion,
    `UPDATE lotes SET cantidad_disponible = cantidad_disponible - CAST(? AS DECIMAL(12,3))
     WHERE id = ? AND cantidad_disponible >= CAST(? AS DECIMAL(12,3))`, [cantidad, id, cantidad]);
  return r.affectedRows;
}

/** Bloquea y devuelve los lotes vigentes con existencias, primero el que caduca antes (FEFO). */
async function vigentesFEFO(productoId, hoy, conexion) {
  return ejecutar(conexion,
    `SELECT ${COLUMNAS} FROM lotes l
     WHERE l.producto_id = ? AND l.cantidad_disponible > 0 AND l.fecha_caducidad >= ?
     ORDER BY l.fecha_caducidad ASC, l.id ASC FOR UPDATE`, [productoId, hoy]);
}

/** Bloquea los lotes vigentes del producto (para leer su stock vendible de forma consistente). */
async function bloquearVigentes(productoId, hoy, conexion) {
  await ejecutar(conexion,
    'SELECT l.id FROM lotes l WHERE l.producto_id = ? AND l.fecha_caducidad >= ? FOR UPDATE', [productoId, hoy]);
}

/** Lotes con existencias de productos activos. modo 'por_vencer' (hoy..hoy+dias) o 'vencidos' (< hoy). */
async function listarParaAlertas(modo, { hoy, dias }, conexion) {
  const cond = ["p.estado = 'activo'", 'l.cantidad_disponible > 0'];
  const params = [];
  if (modo === 'vencidos') { cond.push('l.fecha_caducidad < ?'); params.push(hoy); }
  else { cond.push('l.fecha_caducidad BETWEEN ? AND ?'); params.push(hoy, sumarDias(hoy, dias)); }
  const filas = await ejecutar(conexion,
    `SELECT ${COLUMNAS}, p.nombre AS producto_nombre, u.abreviatura AS unidad_abreviatura
     FROM lotes l JOIN productos p ON p.id = l.producto_id JOIN unidades_medida u ON u.id = p.unidad_id
     WHERE ${cond.join(' AND ')} ORDER BY l.fecha_caducidad ASC, l.id ASC`, params);
  return filas.map((f) => enriquecer(f, hoy, dias));
}

module.exports = {
  enriquecer, listarPorProducto, buscarPorId, buscarPorProductoYCodigo, crear, sumar, restar,
  vigentesFEFO, bloquearVigentes, listarParaAlertas,
};
