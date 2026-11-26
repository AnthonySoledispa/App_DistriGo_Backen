'use strict';
const { ejecutar } = require('../config/db');
const { patronLike } = require('../utils/sql');

const SELECT_RUTA = `SELECT r.id, r.nombre, r.descripcion, r.estado,
  (SELECT COUNT(*) FROM clientes c WHERE c.ruta_id = r.id) AS total_clientes,
  (SELECT COUNT(*) FROM clientes c WHERE c.ruta_id = r.id AND c.estado = 'activo') AS clientes_activos,
  r.creado_en, r.actualizado_en
  FROM rutas r`;

function mapear(f) {
  if (!f) return null;
  return { ...f, total_clientes: Number(f.total_clientes), clientes_activos: Number(f.clientes_activos) };
}

async function listar({ estado, buscar } = {}, conexion) {
  const cond = []; const params = [];
  if (estado) { cond.push('r.estado = ?'); params.push(estado); }
  if (buscar) {
    cond.push('(r.nombre LIKE ? OR r.descripcion LIKE ?)');
    params.push(patronLike(buscar), patronLike(buscar));
  }
  const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const filas = await ejecutar(conexion, `${SELECT_RUTA} ${donde} ORDER BY r.nombre ASC, r.id ASC`, params);
  return filas.map(mapear);
}

async function buscarPorId(id, conexion) {
  const filas = await ejecutar(conexion, `${SELECT_RUTA} WHERE r.id = ? LIMIT 1`, [id]);
  return mapear(filas[0]);
}

async function buscarDuplicado(nombre, excluirId, conexion) {
  const filas = await ejecutar(conexion, 'SELECT id FROM rutas WHERE nombre = ? AND id <> ? LIMIT 1', [nombre, excluirId ?? 0]);
  return filas[0] ?? null;
}

async function crear({ nombre, descripcion, creadoPor }, conexion) {
  const r = await ejecutar(conexion,
    'INSERT INTO rutas (nombre, descripcion, creado_por) VALUES (?, ?, ?)',
    [nombre, descripcion ?? null, creadoPor ?? null]);
  return r.insertId;
}

async function actualizar(id, campos, conexion) {
  const sets = []; const params = [];
  if (campos.nombre !== undefined) { sets.push('nombre = ?'); params.push(campos.nombre); }
  if (campos.descripcion !== undefined) { sets.push('descripcion = ?'); params.push(campos.descripcion); }
  if (!sets.length) return;
  params.push(id);
  await ejecutar(conexion, `UPDATE rutas SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function cambiarEstado(id, estado, conexion) {
  await ejecutar(conexion, 'UPDATE rutas SET estado = ? WHERE id = ?', [estado, id]);
}

async function contarClientesActivos(id, conexion) {
  const f = await ejecutar(conexion, "SELECT COUNT(*) AS total FROM clientes WHERE ruta_id = ? AND estado = 'activo'", [id]);
  return Number(f[0].total);
}

module.exports = { listar, buscarPorId, buscarDuplicado, crear, actualizar, cambiarEstado, contarClientesActivos };
