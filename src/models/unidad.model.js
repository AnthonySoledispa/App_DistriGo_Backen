'use strict';
const { ejecutar } = require('../config/db');
const { patronLike } = require('../utils/sql');

const SELECT_UNIDAD = `SELECT u.id, u.nombre, u.abreviatura, u.permite_decimales, u.estado,
  (SELECT COUNT(*) FROM productos p WHERE p.unidad_id = u.id) AS total_productos,
  EXISTS(SELECT 1 FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id WHERE p.unidad_id = u.id) AS tiene_movimientos,
  u.creado_en, u.actualizado_en
  FROM unidades_medida u`;

function mapear(f) {
  if (!f) return null;
  return {
    ...f,
    permite_decimales: Boolean(f.permite_decimales),
    total_productos: Number(f.total_productos),
    tiene_movimientos: Boolean(f.tiene_movimientos),
  };
}


async function listar({ estado, buscar } = {}, conexion) {
  const cond = []; const params = [];
  if (estado) { cond.push('u.estado = ?'); params.push(estado); }
  if (buscar) {
    cond.push('(u.nombre LIKE ? OR u.abreviatura LIKE ?)');
    params.push(patronLike(buscar), patronLike(buscar));
  }
  const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const filas = await ejecutar(conexion, `${SELECT_UNIDAD} ${donde} ORDER BY u.nombre ASC, u.id ASC`, params);
  return filas.map(mapear);
}

async function buscarPorId(id, conexion) {
  const filas = await ejecutar(conexion, `${SELECT_UNIDAD} WHERE u.id = ? LIMIT 1`, [id]);
  return mapear(filas[0]);
}

/** Unidad con nombre o abreviatura repetidos (excluyendo un id). */
async function buscarDuplicado({ nombre, abreviatura }, excluirId, conexion) {
  const filas = await ejecutar(conexion,
    'SELECT id, nombre, abreviatura FROM unidades_medida WHERE (nombre = ? OR abreviatura = ?) AND id <> ? LIMIT 1',
    [nombre ?? '', abreviatura ?? '', excluirId ?? 0]);
  return filas[0] ?? null;
}

async function crear({ nombre, abreviatura, permiteDecimales, creadoPor }, conexion) {
  const r = await ejecutar(conexion,
    'INSERT INTO unidades_medida (nombre, abreviatura, permite_decimales, creado_por) VALUES (?, ?, ?, ?)',
    [nombre, abreviatura, permiteDecimales ? 1 : 0, creadoPor ?? null]);
  return r.insertId;
}

async function actualizar(id, campos, conexion) {
  const sets = []; const params = [];
  if (campos.nombre !== undefined) { sets.push('nombre = ?'); params.push(campos.nombre); }
  if (campos.abreviatura !== undefined) { sets.push('abreviatura = ?'); params.push(campos.abreviatura); }
  if (campos.permite_decimales !== undefined) { sets.push('permite_decimales = ?'); params.push(campos.permite_decimales ? 1 : 0); }
  if (!sets.length) return;
  params.push(id);
  await ejecutar(conexion, `UPDATE unidades_medida SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function cambiarEstado(id, estado, conexion) {
  await ejecutar(conexion, 'UPDATE unidades_medida SET estado = ? WHERE id = ?', [estado, id]);
}

async function contarProductosActivos(id, conexion) {
  const f = await ejecutar(conexion, "SELECT COUNT(*) AS total FROM productos WHERE unidad_id = ? AND estado = 'activo'", [id]);
  return Number(f[0].total);
}

module.exports = { listar, buscarPorId, buscarDuplicado, crear, actualizar, cambiarEstado, contarProductosActivos };
