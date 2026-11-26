'use strict';
const { ejecutar } = require('../config/db');

const SELECT_MOV = `SELECT m.id, m.producto_id, p.nombre AS producto_nombre, u.abreviatura AS unidad_abreviatura,
    m.tipo, m.cantidad, m.stock_anterior, m.stock_resultante, m.lote_id, l.codigo_lote,
    m.motivo, m.observacion, m.fecha_movimiento, m.referencia_tipo, m.referencia_id,
    m.usuario_id, us.nombre AS usuario_nombre, m.creado_en
  FROM movimientos_inventario m
  JOIN productos p ON p.id = m.producto_id
  JOIN unidades_medida u ON u.id = p.unidad_id
  LEFT JOIN lotes l ON l.id = m.lote_id
  LEFT JOIN usuarios us ON us.id = m.usuario_id`;

async function crear(d, conexion) {
  const r = await ejecutar(conexion,
    `INSERT INTO movimientos_inventario
       (producto_id, lote_id, tipo, cantidad, stock_anterior, stock_resultante, motivo, observacion,
        fecha_movimiento, referencia_tipo, referencia_id, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.productoId, d.loteId ?? null, d.tipo, d.cantidad, d.stockAnterior, d.stockResultante, d.motivo ?? null,
      d.observacion ?? null, d.fechaMovimiento, d.referenciaTipo ?? null, d.referenciaId ?? null, d.usuarioId]);
  return r.insertId;
}

async function buscarPorId(id, conexion) {
  const f = await ejecutar(conexion, `${SELECT_MOV} WHERE m.id = ? LIMIT 1`, [id]);
  return f[0] ?? null;
}

/** Lista paginada. filtros: producto_id, tipo, motivo, usuario_id, desde, hasta, pagina, limite. */
async function listar(filtros = {}, conexion) {
  const cond = []; const params = [];
  if (filtros.producto_id) { cond.push('m.producto_id = ?'); params.push(filtros.producto_id); }
  if (filtros.usuario_id) { cond.push('m.usuario_id = ?'); params.push(filtros.usuario_id); }
  if (filtros.tipo) { cond.push('m.tipo = ?'); params.push(filtros.tipo); }
  if (filtros.motivo) { cond.push('m.motivo = ?'); params.push(filtros.motivo); }
  if (filtros.desde) { cond.push('m.fecha_movimiento >= ?'); params.push(filtros.desde); }
  if (filtros.hasta) { cond.push('m.fecha_movimiento <= ?'); params.push(filtros.hasta); }
  const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const pagina = filtros.pagina ?? 1;
  const limite = filtros.limite ?? 50;
  const desplazamiento = (pagina - 1) * limite;

  const total = await ejecutar(conexion, `SELECT COUNT(*) AS total FROM movimientos_inventario m ${donde}`, params);
  // limite y desplazamiento son enteros ya validados (no vienen del usuario sin validar).
  const items = await ejecutar(conexion,
    `${SELECT_MOV} ${donde} ORDER BY m.creado_en DESC, m.id DESC LIMIT ${Number(limite)} OFFSET ${Number(desplazamiento)}`, params);
  return { items, total: Number(total[0].total), pagina, limite };
}

module.exports = { crear, buscarPorId, listar };
