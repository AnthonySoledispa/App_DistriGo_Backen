'use strict';
const { ejecutar } = require('../config/db');
const { patronLike } = require('../utils/sql');

const SELECT_CLIENTE = `SELECT c.id, c.nombre, c.contacto, c.telefono, c.direccion, c.ruta_id,
  r.nombre AS ruta_nombre, r.estado AS ruta_estado, c.limite_credito, c.estado,
  c.creado_por, c.creado_en, c.actualizado_en
  FROM clientes c LEFT JOIN rutas r ON r.id = c.ruta_id`;

function mapear(f) {
  if (!f) return null;
  return { ...f, limite_credito: Number(f.limite_credito) };
}

async function listar({ estado, buscar, ruta_id: rutaId, sin_ruta: sinRuta } = {}, conexion) {
  const cond = []; const params = [];
  if (estado) { cond.push('c.estado = ?'); params.push(estado); }
  if (rutaId !== undefined) { cond.push('c.ruta_id = ?'); params.push(rutaId); }
  if (sinRuta === true) cond.push('c.ruta_id IS NULL');
  if (buscar) {
    // El telefono se guarda sin separadores: "099 123" tambien debe encontrar 0991234567.
    const sinSeparadores = buscar.replace(/[\s\-().]/g, '') || buscar;
    cond.push('(c.nombre LIKE ? OR c.contacto LIKE ? OR c.telefono LIKE ? OR c.telefono LIKE ? OR r.nombre LIKE ?)');
    const p = patronLike(buscar);
    params.push(p, p, p, patronLike(sinSeparadores), p);
  }
  const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const filas = await ejecutar(conexion, `${SELECT_CLIENTE} ${donde} ORDER BY c.nombre ASC, c.id ASC`, params);
  return filas.map(mapear);
}

async function buscarPorId(id, conexion) {
  const filas = await ejecutar(conexion, `${SELECT_CLIENTE} WHERE c.id = ? LIMIT 1`, [id]);
  return mapear(filas[0]);
}

/** Datos minimos para el contrato de credito; con bloquear usa FOR UPDATE (requiere transaccion). */
async function buscarParaCredito(id, { bloquear = false } = {}, conexion) {
  const filas = await ejecutar(conexion,
    `SELECT id, estado, limite_credito FROM clientes WHERE id = ? LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  return filas[0] ? { ...filas[0], limite_credito: Number(filas[0].limite_credito) } : null;
}

async function buscarDuplicado(nombre, excluirId, conexion) {
  const filas = await ejecutar(conexion, 'SELECT id FROM clientes WHERE nombre = ? AND id <> ? LIMIT 1', [nombre, excluirId ?? 0]);
  return filas[0] ?? null;
}

async function crear({ nombre, contacto, telefono, direccion, rutaId, limiteCredito, creadoPor }, conexion) {
  const r = await ejecutar(conexion,
    `INSERT INTO clientes (nombre, contacto, telefono, direccion, ruta_id, limite_credito, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nombre, contacto, telefono, direccion, rutaId ?? null, limiteCredito, creadoPor ?? null]);
  return r.insertId;
}

async function actualizar(id, campos, conexion) {
  const sets = []; const params = [];
  for (const campo of ['nombre', 'contacto', 'telefono', 'direccion', 'ruta_id', 'limite_credito']) {
    if (campos[campo] !== undefined) { sets.push(`${campo} = ?`); params.push(campos[campo]); }
  }
  if (!sets.length) return;
  params.push(id);
  await ejecutar(conexion, `UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function cambiarEstado(id, estado, conexion) {
  await ejecutar(conexion, 'UPDATE clientes SET estado = ? WHERE id = ?', [estado, id]);
}

module.exports = { listar, buscarPorId, buscarParaCredito, buscarDuplicado, crear, actualizar, cambiarEstado };
