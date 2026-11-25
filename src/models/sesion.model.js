'use strict';
const { query } = require('../config/db');

async function crear({ id, usuarioId, cliente, expiraSegundos, ip }) {
  await query(
    `INSERT INTO sesiones (id, usuario_id, cliente, creada_en, ultima_actividad, expira_en, ip)
     VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), ?)`,
    [id, usuarioId, cliente, expiraSegundos, ip ? String(ip).slice(0, 45) : null]
  );
}

/** Sesion con datos del usuario y tiempos calculados en la BD (UTC). */
async function buscarConUsuario(id) {
  const filas = await query(
    `SELECT s.id, s.usuario_id, s.cliente, s.cerrada_en,
            (s.expira_en <= UTC_TIMESTAMP()) AS expirada,
            TIMESTAMPDIFF(SECOND, s.ultima_actividad, UTC_TIMESTAMP()) AS segundos_inactiva,
            u.nombre, u.correo, u.rol, u.estado
       FROM sesiones s
       INNER JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = ? LIMIT 1`,
    [id]
  );
  return filas[0] ?? null;
}

async function registrarActividad(id) {
  await query('UPDATE sesiones SET ultima_actividad = UTC_TIMESTAMP() WHERE id = ? AND cerrada_en IS NULL', [id]);
}

async function cerrar(id, motivo) {
  await query(
    'UPDATE sesiones SET cerrada_en = UTC_TIMESTAMP(), motivo_cierre = ? WHERE id = ? AND cerrada_en IS NULL',
    [motivo, id]
  );
}

/** Cierra las sesiones abiertas del usuario; si se indica exceptoId, esa sesion se conserva. */
async function cerrarTodasDeUsuario(usuarioId, motivo, exceptoId = null) {
  if (exceptoId) {
    await query(
      'UPDATE sesiones SET cerrada_en = UTC_TIMESTAMP(), motivo_cierre = ? WHERE usuario_id = ? AND id <> ? AND cerrada_en IS NULL',
      [motivo, usuarioId, exceptoId]
    );
    return;
  }
  await query(
    'UPDATE sesiones SET cerrada_en = UTC_TIMESTAMP(), motivo_cierre = ? WHERE usuario_id = ? AND cerrada_en IS NULL',
    [motivo, usuarioId]
  );
}

module.exports = { crear, buscarConUsuario, registrarActividad, cerrar, cerrarTodasDeUsuario };
