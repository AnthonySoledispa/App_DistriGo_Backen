'use strict';
const { ejecutar } = require('../config/db');
const { patronLike } = require('../utils/sql');

const SELECT_CATEGORIA = `SELECT c.id, c.nombre, c.descripcion, c.controla_lotes, c.estado,
  (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id) AS total_productos,
  EXISTS(SELECT 1 FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id WHERE p.categoria_id = c.id) AS tiene_movimientos,
  c.creado_en, c.actualizado_en
  FROM categorias c`;

function mapear(f) {
  if (!f) return null;
  return {
    ...f,
    controla_lotes: Boolean(f.controla_lotes),
    total_productos: Number(f.total_productos),
    tiene_movimientos: Boolean(f.tiene_movimientos),
  };
}


async function listar({ estado, buscar, controla_lotes: controlaLotes } = {}, conexion) {
  const cond = []; const params = [];
  if (estado) { cond.push('c.estado = ?'); params.push(estado); }
  if (controlaLotes !== undefined) { cond.push('c.controla_lotes = ?'); params.push(controlaLotes ? 1 : 0); }
  if (buscar) {
    cond.push('(c.nombre LIKE ? OR c.descripcion LIKE ?)');
    params.push(patronLike(buscar), patronLike(buscar));
  }
  const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const filas = await ejecutar(conexion, `${SELECT_CATEGORIA} ${donde} ORDER BY c.nombre ASC, c.id ASC`, params);
  return filas.map(mapear);
}

async function buscarPorId(id, conexion) {
  const filas = await ejecutar(conexion, `${SELECT_CATEGORIA} WHERE c.id = ? LIMIT 1`, [id]);
  return mapear(filas[0]);
}

async function buscarDuplicado(nombre, excluirId, conexion) {
  const filas = await ejecutar(conexion, 'SELECT id FROM categorias WHERE nombre = ? AND id <> ? LIMIT 1', [nombre, excluirId ?? 0]);
  return filas[0] ?? null;
}

async function crear({ nombre, descripcion, controlaLotes, creadoPor }, conexion) {
  const r = await ejecutar(conexion,
    'INSERT INTO categorias (nombre, descripcion, controla_lotes, creado_por) VALUES (?, ?, ?, ?)',
    [nombre, descripcion ?? null, controlaLotes ? 1 : 0, creadoPor ?? null]);
  return r.insertId;
}

async function actualizar(id, campos, conexion) {
  const sets = []; const params = [];
  if (campos.nombre !== undefined) { sets.push('nombre = ?'); params.push(campos.nombre); }
  if (campos.descripcion !== undefined) { sets.push('descripcion = ?'); params.push(campos.descripcion); }
  if (campos.controla_lotes !== undefined) { sets.push('controla_lotes = ?'); params.push(campos.controla_lotes ? 1 : 0); }
  if (!sets.length) return;
  params.push(id);
  await ejecutar(conexion, `UPDATE categorias SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function cambiarEstado(id, estado, conexion) {
  await ejecutar(conexion, 'UPDATE categorias SET estado = ? WHERE id = ?', [estado, id]);
}

async function contarProductosActivos(id, conexion) {
  const f = await ejecutar(conexion, "SELECT COUNT(*) AS total FROM productos WHERE categoria_id = ? AND estado = 'activo'", [id]);
  return Number(f[0].total);
}

module.exports = { listar, buscarPorId, buscarDuplicado, crear, actualizar, cambiarEstado, contarProductosActivos };
