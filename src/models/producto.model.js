'use strict';
const { ejecutar } = require('../config/db');
const { patronLike } = require('../utils/sql');
const { hoyNegocio } = require('../utils/fechas');

// UNICA formula del stock vendible (la reutilizan lista, detalle, alertas y servicio):
//  - sin control de lotes: stock_actual
//  - con control de lotes: suma de lotes cuya caducidad es >= hoy (los vencidos no se venden).
// El unico parametro (?) de esta consulta es la fecha de hoy del negocio.
const SQL_BASE = `SELECT t.*,
    (t.stock_actual - t.stock_vendible) AS stock_vencido,
    (t.stock_vendible <= t.stock_minimo) AS stock_bajo
  FROM (
    SELECT p.id, p.nombre, p.sku, p.descripcion,
      p.categoria_id, c.nombre AS categoria_nombre, c.controla_lotes,
      p.unidad_id, u.nombre AS unidad_nombre, u.abreviatura AS unidad_abreviatura, u.permite_decimales,
      p.precio_venta, p.stock_actual,
      CASE WHEN c.controla_lotes = 1
        THEN COALESCE((SELECT SUM(l.cantidad_disponible) FROM lotes l
                       WHERE l.producto_id = p.id AND l.fecha_caducidad >= ?), 0)
        ELSE p.stock_actual END AS stock_vendible,
      p.stock_minimo, p.estado,
      EXISTS(SELECT 1 FROM movimientos_inventario m WHERE m.producto_id = p.id) AS tiene_movimientos,
      p.creado_por, p.creado_en, p.actualizado_en
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    JOIN unidades_medida u ON u.id = p.unidad_id
  ) t`;

function mapear(f) {
  if (!f) return null;
  return {
    id: f.id,
    nombre: f.nombre,
    sku: f.sku,
    descripcion: f.descripcion,
    categoria_id: f.categoria_id,
    categoria_nombre: f.categoria_nombre,
    controla_lotes: Boolean(f.controla_lotes),
    unidad_id: f.unidad_id,
    unidad_nombre: f.unidad_nombre,
    unidad_abreviatura: f.unidad_abreviatura,
    permite_decimales: Boolean(f.permite_decimales),
    precio_venta: f.precio_venta,
    stock_actual: f.stock_actual,
    stock_vendible: f.stock_vendible,
    stock_vencido: f.stock_vencido,
    stock_minimo: f.stock_minimo,
    stock_bajo: Boolean(f.stock_bajo),
    estado: f.estado,
    tiene_movimientos: Boolean(f.tiene_movimientos),
    creado_por: f.creado_por,
    creado_en: f.creado_en,
    actualizado_en: f.actualizado_en,
  };
}


/** Lista productos. filtros: estado, buscar, categoria_id, unidad_id, stock_bajo. orden: 'nombre' | 'holgura'. */
async function listar(filtros = {}, conexion, { orden = 'nombre' } = {}) {
  const cond = []; const params = [hoyNegocio()];
  if (filtros.estado) { cond.push('t.estado = ?'); params.push(filtros.estado); }
  if (filtros.categoria_id) { cond.push('t.categoria_id = ?'); params.push(filtros.categoria_id); }
  if (filtros.unidad_id) { cond.push('t.unidad_id = ?'); params.push(filtros.unidad_id); }
  if (filtros.stock_bajo === true) cond.push('t.stock_vendible <= t.stock_minimo');
  if (filtros.stock_bajo === false) cond.push('t.stock_vendible > t.stock_minimo');
  if (filtros.buscar) {
    cond.push('(t.nombre LIKE ? OR t.sku LIKE ?)');
    params.push(patronLike(filtros.buscar), patronLike(filtros.buscar));
  }
  const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const orderBy = orden === 'holgura'
    ? 'ORDER BY (t.stock_vendible - t.stock_minimo) ASC, t.nombre ASC, t.id ASC'
    : 'ORDER BY t.nombre ASC, t.id ASC';
  const filas = await ejecutar(conexion, `${SQL_BASE} ${donde} ${orderBy}`, params);
  return filas.map(mapear);
}

async function buscarPorId(id, conexion) {
  const filas = await ejecutar(conexion, `${SQL_BASE} WHERE t.id = ? LIMIT 1`, [hoyNegocio(), id]);
  return mapear(filas[0]);
}

/** Bloquea la fila del producto (FOR UPDATE) y devuelve sus datos base, o null. */
async function bloquear(id, conexion) {
  const filas = await ejecutar(conexion,
    'SELECT id, nombre, categoria_id, unidad_id, stock_actual, estado FROM productos WHERE id = ? FOR UPDATE', [id]);
  return filas[0] ?? null;
}

async function buscarDuplicadoNombre(nombre, excluirId, conexion) {
  const f = await ejecutar(conexion, 'SELECT id FROM productos WHERE nombre = ? AND id <> ? LIMIT 1', [nombre, excluirId ?? 0]);
  return f[0] ?? null;
}

async function buscarDuplicadoSku(sku, excluirId, conexion) {
  const f = await ejecutar(conexion, 'SELECT id FROM productos WHERE sku = ? AND id <> ? LIMIT 1', [sku, excluirId ?? 0]);
  return f[0] ?? null;
}

async function crear(d, conexion) {
  const r = await ejecutar(conexion,
    `INSERT INTO productos (nombre, sku, descripcion, categoria_id, unidad_id, precio_venta, stock_minimo, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.nombre, d.sku ?? null, d.descripcion ?? null, d.categoria_id, d.unidad_id, d.precio_venta, d.stock_minimo, d.creado_por ?? null]);
  return r.insertId;
}

async function actualizar(id, campos, conexion) {
  const columnas = ['nombre', 'sku', 'descripcion', 'categoria_id', 'unidad_id', 'precio_venta', 'stock_minimo'];
  const sets = []; const params = [];
  for (const c of columnas) {
    if (campos[c] !== undefined) { sets.push(`${c} = ?`); params.push(campos[c]); }
  }
  if (!sets.length) return;
  params.push(id);
  await ejecutar(conexion, `UPDATE productos SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function cambiarEstado(id, estado, conexion) {
  await ejecutar(conexion, 'UPDATE productos SET estado = ? WHERE id = ?', [estado, id]);
}

async function eliminar(id, conexion) {
  const r = await ejecutar(conexion, 'DELETE FROM productos WHERE id = ?', [id]);
  return r.affectedRows;
}

/** true si el producto tiene movimientos o lotes. */
async function tieneMovimientos(id, conexion) {
  const f = await ejecutar(conexion,
    `SELECT (EXISTS(SELECT 1 FROM movimientos_inventario WHERE producto_id = ?)
          OR EXISTS(SELECT 1 FROM lotes WHERE producto_id = ?)) AS tiene`, [id, id]);
  return Boolean(f[0].tiene);
}

/** Suma al stock (delta > 0). Aritmetica en SQL (DECIMAL). */
async function sumarStock(id, cantidad, conexion) {
  await ejecutar(conexion,
    'UPDATE productos SET stock_actual = stock_actual + CAST(? AS DECIMAL(12,3)) WHERE id = ?', [cantidad, id]);
}

/** Resta al stock solo si alcanza. Devuelve filas afectadas (0 = no alcanzo). */
async function restarStock(id, cantidad, conexion) {
  const r = await ejecutar(conexion,
    `UPDATE productos SET stock_actual = stock_actual - CAST(? AS DECIMAL(12,3))
     WHERE id = ? AND stock_actual >= CAST(? AS DECIMAL(12,3))`, [cantidad, id, cantidad]);
  return r.affectedRows;
}

async function leerStockActual(id, conexion) {
  const f = await ejecutar(conexion, 'SELECT stock_actual FROM productos WHERE id = ?', [id]);
  return f[0] ? f[0].stock_actual : null;
}

module.exports = {
  listar, buscarPorId, bloquear, buscarDuplicadoNombre, buscarDuplicadoSku, crear, actualizar,
  cambiarEstado, eliminar, tieneMovimientos, sumarStock, restarStock, leerStockActual,
};
