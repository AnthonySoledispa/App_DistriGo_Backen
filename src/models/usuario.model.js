'use strict';
const { query } = require('../config/db');

const COLUMNAS_PUBLICAS =
  'id, nombre, correo, rol, estado, ultimo_acceso, creado_por, creado_en, actualizado_en';

async function buscarPorCorreoConHash(correo) {
  const filas = await query(
    'SELECT id, nombre, correo, contrasena_hash, rol, estado FROM usuarios WHERE correo = ? LIMIT 1',
    [correo]
  );
  return filas[0] ?? null;
}

async function buscarPorId(id) {
  const filas = await query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = ? LIMIT 1`, [id]);
  return filas[0] ?? null;
}

async function listar({ rol, estado, buscar }) {
  const condiciones = [];
  const params = [];
  if (rol) { condiciones.push('rol = ?'); params.push(rol); }
  if (estado) { condiciones.push('estado = ?'); params.push(estado); }
  if (buscar) {
    const patron = `%${buscar.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    condiciones.push('(nombre LIKE ? OR correo LIKE ?)');
    params.push(patron, patron);
  }
  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios ${donde} ORDER BY nombre ASC, id ASC`, params);
}

async function contarAdministradores() {
  const filas = await query("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'administrador'");
  return Number(filas[0].total);
}

async function crear({ nombre, correo, contrasenaHash, rol, creadoPor }) {
  const r = await query(
    'INSERT INTO usuarios (nombre, correo, contrasena_hash, rol, creado_por) VALUES (?, ?, ?, ?, ?)',
    [nombre, correo, contrasenaHash, rol, creadoPor ?? null]
  );
  return r.insertId;
}

/** Actualiza solo los campos presentes: nombre, correo, rol, contrasenaHash. */
async function actualizar(id, campos) {
  const mapa = { nombre: 'nombre', correo: 'correo', rol: 'rol', contrasenaHash: 'contrasena_hash' };
  const sets = [];
  const params = [];
  for (const [clave, columna] of Object.entries(mapa)) {
    if (campos[clave] !== undefined) { sets.push(`${columna} = ?`); params.push(campos[clave]); }
  }
  if (sets.length === 0) return;
  params.push(id);
  await query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function cambiarEstado(id, estado) {
  await query('UPDATE usuarios SET estado = ? WHERE id = ?', [estado, id]);
}

async function registrarAcceso(id) {
  await query('UPDATE usuarios SET ultimo_acceso = UTC_TIMESTAMP() WHERE id = ?', [id]);
}

module.exports = {
  buscarPorCorreoConHash, buscarPorId, listar, contarAdministradores,
  crear, actualizar, cambiarEstado, registrarAcceso,
};
