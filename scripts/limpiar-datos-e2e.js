'use strict';
// Borra los datos de las pruebas E2E del panel (producto, categoria o unidad cuyo nombre empieza por "E2E ")
// en una sola transaccion. Orden: movimientos_inventario, lotes, productos, categorias, unidades_medida.
// NO toca la tabla usuarios. Imprime solo los conteos borrados por tabla.
// Codigo de salida: 0 si todo va bien, 1 si falla (la transaccion se revierte).
const { pool, conTransaccion } = require('../src/config/db');

const PATRON = 'E2E %';
const UNIONES = `JOIN categorias c ON c.id = p.categoria_id JOIN unidades_medida u ON u.id = p.unidad_id`;
const CONDICION = 'WHERE p.nombre LIKE ? OR c.nombre LIKE ? OR u.nombre LIKE ?';
const PARAMS_PRODUCTO = [PATRON, PATRON, PATRON];

async function limpiar() {
  return conTransaccion(async (c) => {
    const ejecutar = async (sql, params) => (await c.execute(sql, params))[0].affectedRows;
    const conteos = {};
    conteos.movimientos_inventario = await ejecutar(
      `DELETE m FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id ${UNIONES} ${CONDICION}`, PARAMS_PRODUCTO);
    conteos.lotes = await ejecutar(
      `DELETE l FROM lotes l JOIN productos p ON p.id = l.producto_id ${UNIONES} ${CONDICION}`, PARAMS_PRODUCTO);
    conteos.productos = await ejecutar(`DELETE p FROM productos p ${UNIONES} ${CONDICION}`, PARAMS_PRODUCTO);
    conteos.categorias = await ejecutar('DELETE FROM categorias WHERE nombre LIKE ?', [PATRON]);
    conteos.unidades_medida = await ejecutar('DELETE FROM unidades_medida WHERE nombre LIKE ?', [PATRON]);
    return conteos;
  });
}

if (require.main === module) {
  limpiar()
    .then((conteos) => {
      for (const [tabla, n] of Object.entries(conteos)) console.log(`${tabla}: ${n}`);
    })
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('No se pudo limpiar los datos E2E:', err.code || err.message);
      try { await pool.end(); } catch { /* ignorar */ }
      process.exit(1);
    });
}

module.exports = { limpiar };
