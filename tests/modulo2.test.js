'use strict';
// Pruebas del Modulo 2 (productos e inventario). node:test + fetch.
// La suite levanta su propio servidor (puerto 3104) y requiere la BD con los scripts 00, 01 y 02,
// y TEST_ADMIN_* / TEST_REPARTIDOR_* en .env. Todos los datos llevan la marca T<EJECUCION> y se
// borran al final por SQL directo (por la API, RB-05 impide borrar productos con movimientos).
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const RAIZ = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });

const { hoyNegocio, sumarDias } = require('../src/utils/fechas');
const servicio = require('../src/services/inventario.service');
const { conTransaccion, pool } = require('../src/config/db');
const env = require('../src/config/env');

const PUERTO = 3104;
const BASE = `http://127.0.0.1:${PUERTO}/api`;
const EJECUCION = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const MARCA = `T${EJECUCION}`;
const HOY = hoyNegocio();
const procesos = [];
let bd;
let inicio;
let contador = 0;
let tokenAdmin;
let tokenRepartidor;
let adminId;

const unico = (etiqueta) => `${MARCA} ${etiqueta} ${++contador}`;

async function api(metodo, ruta, { token = tokenAdmin, cuerpo, crudo } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (crudo !== undefined) { body = crudo; h['Content-Type'] = 'application/json'; }
  else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); h['Content-Type'] = 'application/json'; }
  const r = await fetch(BASE + ruta, { method: metodo, headers: h, body });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* sin JSON */ }
  return { estado: r.status, json, texto };
}

const sinToken = (metodo, ruta, cuerpo) => api(metodo, ruta, { token: null, cuerpo });

async function iniciarServidor() {
  const hijo = spawn(process.execPath, ['src/server.js'], {
    cwd: RAIZ,
    env: { ...process.env, PUERTO: String(PUERTO), HOST: '127.0.0.1', LOGIN_MAX_INTENTOS: '1000' },
    stdio: 'ignore',
  });
  procesos.push(hijo);
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/salud`);
      if (r.status === 200) return;
    } catch { /* aun no arranca */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`El servidor de pruebas no arranco en el puerto ${PUERTO}`);
}

async function login(correo, contrasena, cliente) {
  const r = await api('POST', '/auth/login', { token: null, cuerpo: { correo, contrasena, cliente } });
  assert.equal(r.estado, 200, r.texto);
  return r.json.data;
}

function exito(r, estado) {
  assert.equal(r.estado, estado, r.texto);
  assert.equal(r.json.ok, true);
  return r.json.data;
}

function fallo(r, estado, codigo) {
  assert.equal(r.estado, estado, r.texto);
  assert.equal(r.json.ok, false);
  if (codigo) assert.equal(r.json.codigo, codigo, r.texto);
  return r.json;
}

const errorEn = (r, campo) => {
  fallo(r, 400, 'VALIDACION');
  assert.ok(Array.isArray(r.json.errores) && r.json.errores.some((e) => e.campo === campo), `Falta error en ${campo}: ${r.texto}`);
};

// ---- Fabricas de datos ----
async function crearUnidad(etiqueta, permiteDecimales = false) {
  const r = await api('POST', '/unidades-medida', {
    cuerpo: { nombre: unico(etiqueta), abreviatura: `u${crypto.randomBytes(3).toString('hex')}`, permite_decimales: permiteDecimales },
  });
  return exito(r, 201);
}

async function crearCategoria(etiqueta, controlaLotes = false) {
  const r = await api('POST', '/categorias', { cuerpo: { nombre: unico(etiqueta), controla_lotes: controlaLotes } });
  return exito(r, 201);
}

async function crearProducto(categoria, unidad, extra = {}) {
  const r = await api('POST', '/productos', {
    cuerpo: {
      nombre: unico('Producto'), categoria_id: categoria.id, unidad_id: unidad.id,
      precio_venta: 2.5, stock_minimo: 0, ...extra,
    },
  });
  return exito(r, 201);
}

const entrada = (producto, cantidad, extra = {}) =>
  api('POST', '/inventario/entradas', { cuerpo: { producto_id: producto.id, cantidad, ...extra } });

const ajuste = (producto, tipo, cantidad, motivo, extra = {}) =>
  api('POST', '/inventario/ajustes', { cuerpo: { producto_id: producto.id, tipo_ajuste: tipo, cantidad, motivo, ...extra } });

const verProducto = async (id) => exito(await api('GET', `/productos/${id}`), 200);
const verLotes = async (id) => exito(await api('GET', `/productos/${id}/lotes`), 200);

async function conteo(tabla) {
  const [f] = await bd.query(`SELECT COUNT(*) AS n FROM ${tabla}`);
  return Number(f[0].n);
}

describe('Modulo 2: productos e inventario', () => {
  let uEntera; let uDec; let cSin; let cLotes;
  let precargadas;

  before(async () => {
    assert.ok(process.env.TEST_ADMIN_CORREO && process.env.TEST_REPARTIDOR_CORREO, 'Faltan TEST_ADMIN_* / TEST_REPARTIDOR_* en .env');
    inicio = Date.now();
    bd = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USUARIO,
      password: process.env.DB_CONTRASENA,
      database: process.env.DB_NOMBRE || 'distrigo',
      timezone: 'Z',
      dateStrings: ['DATE'],
      decimalNumbers: true,
    });
    await bd.query("SET time_zone='+00:00'");
    await iniciarServidor();
    const a = await login(process.env.TEST_ADMIN_CORREO, process.env.TEST_ADMIN_CONTRASENA, 'web');
    tokenAdmin = a.token; adminId = a.usuario.id;
    const rep = await login(process.env.TEST_REPARTIDOR_CORREO, process.env.TEST_REPARTIDOR_CONTRASENA, 'movil');
    tokenRepartidor = rep.token;
    uEntera = await crearUnidad('Entera', false);
    uDec = await crearUnidad('Decimal', true);
    cSin = await crearCategoria('Sin lotes', false);
    cLotes = await crearCategoria('Con lotes', true);
    precargadas = exito(await api('GET', '/unidades-medida'), 200);
  });

  after(async () => {
    try {
      await bd.query(`DELETE m FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id WHERE p.nombre LIKE ?`, [`${MARCA}%`]);
      await bd.query(`DELETE l FROM lotes l JOIN productos p ON p.id = l.producto_id WHERE p.nombre LIKE ?`, [`${MARCA}%`]);
      await bd.query('DELETE FROM productos WHERE nombre LIKE ?', [`${MARCA}%`]);
      await bd.query('DELETE FROM categorias WHERE nombre LIKE ?', [`${MARCA}%`]);
      await bd.query('DELETE FROM unidades_medida WHERE nombre LIKE ?', [`${MARCA}%`]);
      await bd.query('DELETE FROM sesiones WHERE usuario_id = ? AND creada_en >= FROM_UNIXTIME(?)', [adminId, Math.floor(inicio / 1000) - 5]);
    } finally {
      await bd.end();
      await pool.end();
      for (const p of procesos) p.kill();
    }
  });

  // ---------- Permisos ----------
  const RUTAS = [
    ['GET', '/productos'], ['POST', '/productos'], ['GET', '/categorias'], ['POST', '/categorias'],
    ['GET', '/unidades-medida'], ['POST', '/unidades-medida'], ['POST', '/inventario/entradas'],
    ['POST', '/inventario/ajustes'], ['GET', '/inventario/movimientos'], ['GET', '/inventario/alertas'],
  ];

  test('P2-01 el repartidor recibe 403 en todas las rutas del modulo y no se crean filas', async () => {
    const antes = [await conteo('productos'), await conteo('categorias'), await conteo('unidades_medida'), await conteo('movimientos_inventario')];
    for (const [m, ruta] of RUTAS) {
      const r = await api(m, ruta, { token: tokenRepartidor, cuerpo: m === 'POST' ? { nombre: unico('x') } : undefined });
      fallo(r, 403, 'ACCESO_DENEGADO');
    }
    const despues = [await conteo('productos'), await conteo('categorias'), await conteo('unidades_medida'), await conteo('movimientos_inventario')];
    assert.deepEqual(despues, antes);
  });

  test('P2-02 sin token responde 401 TOKEN_AUSENTE', async () => {
    for (const [m, ruta] of RUTAS) {
      fallo(await sinToken(m, ruta, m === 'POST' ? {} : undefined), 401, 'TOKEN_AUSENTE');
    }
  });

  // ---------- Unidades y categorias ----------
  test('P2-03 crear unidad y rechazar duplicada con otras mayusculas', async () => {
    const nombre = unico('Docena');
    const ab = `d${crypto.randomBytes(3).toString('hex')}`;
    const u = exito(await api('POST', '/unidades-medida', { cuerpo: { nombre, abreviatura: ab } }), 201);
    assert.equal(u.permite_decimales, false);
    assert.equal(u.estado, 'activo');
    fallo(await api('POST', '/unidades-medida', { cuerpo: { nombre: nombre.toUpperCase(), abreviatura: 'zz' + ab.slice(0, 5) } }), 409, 'UNIDAD_DUPLICADA');
    fallo(await api('POST', '/unidades-medida', { cuerpo: { nombre: unico('Otra'), abreviatura: ab.toUpperCase() } }), 409, 'UNIDAD_DUPLICADA');
  });

  test('P2-04 unidad invalida', async () => {
    errorEn(await api('POST', '/unidades-medida', { cuerpo: { nombre: '', abreviatura: 'x' } }), 'nombre');
    errorEn(await api('POST', '/unidades-medida', { cuerpo: { nombre: 'a'.repeat(51), abreviatura: 'x' } }), 'nombre');
    errorEn(await api('POST', '/unidades-medida', { cuerpo: { nombre: unico('U'), abreviatura: 'a'.repeat(11) } }), 'abreviatura');
    errorEn(await api('POST', '/unidades-medida', { cuerpo: { nombre: unico('U'), abreviatura: 'ab', permite_decimales: 'si' } }), 'permite_decimales');
    errorEn(await api('POST', '/unidades-medida', { cuerpo: { nombre: unico('U'), abreviatura: 'ab', extra: 1 } }), 'extra');
  });

  test('P2-05 editar unidad, desactivar en uso y sin uso', async () => {
    const u = await crearUnidad('Editable');
    const nuevo = unico('Editada');
    const e = exito(await api('PUT', `/unidades-medida/${u.id}`, { cuerpo: { nombre: nuevo } }), 200);
    assert.equal(e.nombre, nuevo);
    await crearProducto(cSin, u);
    fallo(await api('PATCH', `/unidades-medida/${u.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 409, 'UNIDAD_EN_USO');
    const libre = await crearUnidad('Libre');
    const d = exito(await api('PATCH', `/unidades-medida/${libre.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    assert.equal(d.estado, 'inactivo');
    fallo(await api('GET', '/unidades-medida/999999'), 404, 'UNIDAD_NO_ENCONTRADA');
  });

  test('P2-06 categorias: crear con y sin lotes, duplicada, invalidas', async () => {
    assert.equal(cLotes.controla_lotes, true);
    assert.equal(cSin.controla_lotes, false);
    fallo(await api('POST', '/categorias', { cuerpo: { nombre: cSin.nombre.toLowerCase() } }), 409, 'CATEGORIA_DUPLICADA');
    errorEn(await api('POST', '/categorias', { cuerpo: { nombre: 'a' } }), 'nombre');
    errorEn(await api('POST', '/categorias', { cuerpo: { nombre: unico('C'), controla_lotes: 'true' } }), 'controla_lotes');
    errorEn(await api('POST', '/categorias', { cuerpo: { nombre: unico('C'), estado: 'activo' } }), 'estado');
    fallo(await api('GET', '/categorias/999999'), 404, 'CATEGORIA_NO_ENCONTRADA');
  });

  test('P2-07 listar categorias y unidades con filtros', async () => {
    const porLotes = exito(await api('GET', `/categorias?controla_lotes=true&buscar=${encodeURIComponent(MARCA)}`), 200);
    assert.ok(porLotes.length >= 1 && porLotes.every((c) => c.controla_lotes === true));
    assert.ok(porLotes.some((c) => c.id === cLotes.id) && !porLotes.some((c) => c.id === cSin.id));
    const inact = exito(await api('GET', '/unidades-medida?estado=inactivo'), 200);
    assert.ok(inact.every((u) => u.estado === 'inactivo'));
    const buscar = exito(await api('GET', `/unidades-medida?buscar=${encodeURIComponent(uDec.nombre)}`), 200);
    assert.equal(buscar.length, 1);
    fallo(await api('GET', '/categorias?estado=otro'), 400, 'VALIDACION');
    fallo(await api('GET', '/categorias?controla_lotes=quizas'), 400, 'VALIDACION');
    fallo(await api('GET', '/unidades-medida?estado=x'), 400, 'VALIDACION');
  });

  // ---------- Productos ----------
  test('P2-08 crear producto sin stock inicial', async () => {
    const p = exito(await api('POST', '/productos', {
      cuerpo: { nombre: unico('Basico'), categoria_id: cSin.id, unidad_id: uEntera.id, precio_venta: 3.75, stock_minimo: 5 },
    }), 201);
    assert.equal(p.stock_actual, 0);
    assert.equal(p.stock_vendible, 0);
    assert.equal(p.stock_vencido, 0);
    assert.equal(p.stock_bajo, true);
    assert.equal(p.sku, null);
    assert.equal(p.descripcion, null);
    assert.equal(p.creado_por, adminId);
    assert.equal(p.precio_venta, 3.75);
    assert.equal(p.stock_minimo, 5);
    assert.equal(p.estado, 'activo');
    assert.equal(p.tiene_movimientos, false);
  });

  test('P2-09 producto invalido', async () => {
    const base = { categoria_id: cSin.id, unidad_id: uEntera.id, precio_venta: 2, stock_minimo: 0 };
    const nuevo = (extra) => api('POST', '/productos', { cuerpo: { nombre: unico('Inv'), ...base, ...extra } });
    errorEn(await nuevo({ precio_venta: 0 }), 'precio_venta');
    errorEn(await nuevo({ precio_venta: -3 }), 'precio_venta');
    errorEn(await nuevo({ precio_venta: 1.234 }), 'precio_venta');
    errorEn(await nuevo({ precio_venta: 'caro' }), 'precio_venta');
    errorEn(await nuevo({ stock_minimo: -1 }), 'stock_minimo');
    errorEn(await nuevo({ nombre: 'a' }), 'nombre');
    errorEn(await nuevo({ stock_actual: 50 }), 'stock_actual');
    errorEn(await nuevo({ estado: 'inactivo' }), 'estado');
    errorEn(await api('POST', '/productos', { cuerpo: { nombre: unico('Inv') } }), 'categoria_id');
  });

  test('P2-10 categoria o unidad inexistente o inactiva', async () => {
    const base = { precio_venta: 2, stock_minimo: 0 };
    fallo(await api('POST', '/productos', { cuerpo: { nombre: unico('P'), ...base, categoria_id: 999999, unidad_id: uEntera.id } }), 404, 'CATEGORIA_NO_ENCONTRADA');
    fallo(await api('POST', '/productos', { cuerpo: { nombre: unico('P'), ...base, categoria_id: cSin.id, unidad_id: 999999 } }), 404, 'UNIDAD_NO_ENCONTRADA');
    const cInact = await crearCategoria('Inactiva');
    exito(await api('PATCH', `/categorias/${cInact.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    const uInact = await crearUnidad('Inactiva');
    exito(await api('PATCH', `/unidades-medida/${uInact.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    fallo(await api('POST', '/productos', { cuerpo: { nombre: unico('P'), ...base, categoria_id: cInact.id, unidad_id: uEntera.id } }), 409, 'CATEGORIA_INACTIVA');
    fallo(await api('POST', '/productos', { cuerpo: { nombre: unico('P'), ...base, categoria_id: cSin.id, unidad_id: uInact.id } }), 409, 'UNIDAD_INACTIVA');
  });

  test('P2-11 nombre de producto duplicado con otras mayusculas', async () => {
    const p = await crearProducto(cSin, uEntera);
    fallo(await api('POST', '/productos', {
      cuerpo: { nombre: p.nombre.toUpperCase(), categoria_id: cSin.id, unidad_id: uEntera.id, precio_venta: 1, stock_minimo: 0 },
    }), 409, 'PRODUCTO_DUPLICADO');
  });

  test('P2-12 stock inicial sin lotes crea movimiento stock_inicial', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 20 });
    assert.equal(p.stock_actual, 20);
    assert.equal(p.tiene_movimientos, true);
    const m = exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}`), 200);
    assert.equal(m.total, 1);
    const mov = m.items[0];
    assert.equal(mov.tipo, 'entrada');
    assert.equal(mov.motivo, 'stock_inicial');
    assert.equal(mov.cantidad, 20);
    assert.equal(mov.usuario_id, adminId);
    assert.equal(mov.stock_anterior, 0);
    assert.equal(mov.stock_resultante, 20);
  });

  test('P2-13 stock inicial y lotes', async () => {
    const nuevo = (cat, extra) => api('POST', '/productos', {
      cuerpo: { nombre: unico('SI'), categoria_id: cat.id, unidad_id: uEntera.id, precio_venta: 1, stock_minimo: 0, stock_inicial: 10, ...extra },
    });
    fallo(await nuevo(cLotes, {}), 400, 'LOTE_REQUERIDO');
    const ok = exito(await nuevo(cLotes, { codigo_lote: 'L-1', fecha_caducidad: sumarDias(HOY, 30) }), 201);
    assert.equal(ok.stock_actual, 10);
    assert.equal(ok.stock_vendible, 10);
    const lotes = await verLotes(ok.id);
    assert.equal(lotes.length, 1);
    assert.equal(lotes[0].codigo_lote, 'L-1');
    assert.equal(lotes[0].cantidad_disponible, 10);
    fallo(await nuevo(cSin, { codigo_lote: 'L-1', fecha_caducidad: sumarDias(HOY, 30) }), 400, 'LOTE_NO_APLICA');
    // No quedo ningun producto a medias del intento fallido.
    const lista = exito(await api('GET', `/productos?buscar=${encodeURIComponent(MARCA)}`), 200);
    assert.ok(lista.every((x) => x.stock_actual >= 0));
  });

  test('P2-14 listar productos con filtros', async () => {
    const cat = await crearCategoria('Filtros');
    const bajo = await crearProducto(cat, uEntera, { stock_minimo: 5, stock_inicial: 2 });
    const alto = await crearProducto(cat, uEntera, { stock_minimo: 1, stock_inicial: 9 });
    const todos = exito(await api('GET', `/productos?categoria_id=${cat.id}`), 200);
    assert.deepEqual(todos.map((p) => p.id).sort(), [bajo.id, alto.id].sort());
    const soloBajos = exito(await api('GET', `/productos?categoria_id=${cat.id}&stock_bajo=true`), 200);
    assert.deepEqual(soloBajos.map((p) => p.id), [bajo.id]);
    const buscados = exito(await api('GET', `/productos?buscar=${encodeURIComponent(alto.nombre)}`), 200);
    assert.deepEqual(buscados.map((p) => p.id), [alto.id]);
    const inactivos = exito(await api('GET', `/productos?categoria_id=${cat.id}&estado=inactivo`), 200);
    assert.equal(inactivos.length, 0);
    fallo(await api('GET', '/productos?estado=x'), 400, 'VALIDACION');
    fallo(await api('GET', '/productos?stock_bajo=quiza'), 400, 'VALIDACION');
    fallo(await api('GET', '/productos?categoria_id=abc'), 400, 'VALIDACION');
  });

  test('P2-15 producto inexistente o id invalido', async () => {
    fallo(await api('GET', '/productos/999999'), 404, 'PRODUCTO_NO_ENCONTRADO');
    fallo(await api('GET', '/productos/abc'), 400, 'VALIDACION');
  });

  test('P2-16 editar precio y stock minimo recalcula stock_bajo', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_minimo: 1, stock_inicial: 10 });
    assert.equal(p.stock_bajo, false);
    const e = exito(await api('PUT', `/productos/${p.id}`, { cuerpo: { precio_venta: 9.99, stock_minimo: 10 } }), 200);
    assert.equal(e.precio_venta, 9.99);
    assert.equal(e.stock_bajo, true);
    errorEn(await api('PUT', `/productos/${p.id}`, { cuerpo: { stock_actual: 99 } }), 'stock_actual');
    errorEn(await api('PUT', `/productos/${p.id}`, { cuerpo: {} }), 'cuerpo');
    assert.equal((await verProducto(p.id)).stock_actual, 10);
  });

  // ---------- Entradas ----------
  test('P2-17 entrada de 10 sobre stock 20', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 20 });
    const d = exito(await entrada(p, 10), 201);
    assert.equal(d.producto.stock_actual, 30);
    assert.equal(d.movimiento.cantidad, 10);
    assert.equal(d.movimiento.stock_anterior, 20);
    assert.equal(d.movimiento.stock_resultante, 30);
    assert.equal(d.movimiento.usuario_id, adminId);
    assert.equal(d.movimiento.fecha_movimiento, HOY);
    assert.equal(d.movimiento.tipo, 'entrada');
  });

  test('P2-18 entrada invalida', async () => {
    const p = await crearProducto(cSin, uEntera);
    errorEn(await entrada(p, 0), 'cantidad');
    errorEn(await entrada(p, -5), 'cantidad');
    errorEn(await entrada(p, 'diez'), 'cantidad');
    errorEn(await entrada(p, 1.0001), 'cantidad');
    errorEn(await entrada(p, 1, { fecha: sumarDias(HOY, 2) }), 'fecha');
    errorEn(await entrada(p, 1, { fecha: '2026-02-30' }), 'fecha');
    fallo(await api('POST', '/inventario/entradas', { cuerpo: { producto_id: 999999, cantidad: 1 } }), 404, 'PRODUCTO_NO_ENCONTRADO');
    assert.equal((await verProducto(p.id)).stock_actual, 0);
  });

  test('P2-19 cantidades decimales segun la unidad', async () => {
    const entero = await crearProducto(cSin, uEntera);
    const decimal = await crearProducto(cSin, uDec);
    errorEn(await entrada(entero, 1.5), 'cantidad');
    const d = exito(await entrada(decimal, 1.5), 201);
    assert.equal(d.producto.stock_actual, 1.5);
  });

  test('P2-20 entrada a producto inactivo', async () => {
    const sin = await crearProducto(cSin, uEntera, { stock_inicial: 5 });
    const con = await crearProducto(cLotes, uEntera, { stock_inicial: 5, codigo_lote: 'A', fecha_caducidad: sumarDias(HOY, 20) });
    for (const p of [sin, con]) exito(await api('PATCH', `/productos/${p.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    const antesMov = await conteo('movimientos_inventario');
    fallo(await entrada(sin, 3), 409, 'PRODUCTO_INACTIVO');
    fallo(await entrada(con, 3, { codigo_lote: 'A', fecha_caducidad: sumarDias(HOY, 20) }), 409, 'PRODUCTO_INACTIVO');
    assert.equal(await conteo('movimientos_inventario'), antesMov);
    assert.equal((await verProducto(sin.id)).stock_actual, 5);
    assert.equal((await verLotes(con.id))[0].cantidad_disponible, 5);
    exito(await api('PATCH', `/productos/${sin.id}/estado`, { cuerpo: { estado: 'activo' } }), 200);
    const d = exito(await entrada(sin, 3), 201);
    assert.equal(d.producto.stock_actual, 8);
  });

  test('P2-21 entradas con lotes', async () => {
    const p = await crearProducto(cLotes, uEntera);
    const cad = sumarDias(HOY, 40);
    fallo(await entrada(p, 5), 400, 'LOTE_REQUERIDO');
    exito(await entrada(p, 5, { codigo_lote: 'X1', fecha_caducidad: cad }), 201);
    const suma = exito(await entrada(p, 4, { codigo_lote: 'X1', fecha_caducidad: cad }), 201);
    assert.equal(suma.producto.stock_actual, 9);
    const lotes = await verLotes(p.id);
    assert.equal(lotes.length, 1);
    assert.equal(lotes[0].cantidad_disponible, 9);
    assert.equal(lotes[0].cantidad_ingresada, 9);
    fallo(await entrada(p, 1, { codigo_lote: 'X1', fecha_caducidad: sumarDias(HOY, 41) }), 409, 'LOTE_CADUCIDAD_DISTINTA');
    errorEn(await entrada(p, 1, { codigo_lote: 'X2', fecha_caducidad: sumarDias(HOY, -1) }), 'fecha_caducidad');
    const sin = await crearProducto(cSin, uEntera);
    fallo(await entrada(sin, 1, { codigo_lote: 'Z', fecha_caducidad: cad }), 400, 'LOTE_NO_APLICA');
  });

  // ---------- Ajustes ----------
  test('P2-22 ajuste disminucion con merma', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 10 });
    const d = exito(await ajuste(p, 'disminucion', 3, 'merma'), 201);
    assert.equal(d.producto.stock_actual, 7);
    assert.equal(d.movimiento.tipo, 'ajuste');
    assert.equal(d.movimiento.cantidad, -3);
    assert.equal(d.movimiento.motivo, 'merma');
    assert.equal(d.movimiento.usuario_id, adminId);
    assert.equal(d.movimiento.fecha_movimiento, HOY);
  });

  test('P2-23 ajuste invalido', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 10 });
    const enviar = (cuerpo) => api('POST', '/inventario/ajustes', { cuerpo: { producto_id: p.id, ...cuerpo } });
    errorEn(await enviar({ tipo_ajuste: 'disminucion', cantidad: 1 }), 'motivo');
    errorEn(await enviar({ tipo_ajuste: 'disminucion', cantidad: 1, motivo: 'robo' }), 'motivo');
    errorEn(await enviar({ tipo_ajuste: 'disminucion', cantidad: 1, motivo: 'otro' }), 'observacion');
    errorEn(await enviar({ tipo_ajuste: 'aumento', cantidad: 1, motivo: 'correccion' }), 'observacion');
    errorEn(await enviar({ tipo_ajuste: 'aumento', cantidad: 1, motivo: 'danio' }), 'motivo');
    errorEn(await enviar({ cantidad: 1, motivo: 'merma' }), 'tipo_ajuste');
    assert.equal((await verProducto(p.id)).stock_actual, 10);
  });

  test('P2-24 ajuste mayor al stock', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 4 });
    const antesMov = await conteo('movimientos_inventario');
    const r = fallo(await ajuste(p, 'disminucion', 5, 'perdida'), 409, 'STOCK_INSUFICIENTE');
    assert.equal(r.detalles.disponible, 4);
    assert.equal(r.detalles.producto_id, p.id);
    assert.match(r.mensaje, /Disponible: 4/);
    assert.equal((await verProducto(p.id)).stock_actual, 4);
    assert.equal(await conteo('movimientos_inventario'), antesMov);
  });

  test('P2-25 ajuste en producto con lotes', async () => {
    const p = await crearProducto(cLotes, uEntera, { stock_inicial: 10, codigo_lote: 'A', fecha_caducidad: sumarDias(HOY, 30) });
    const otro = await crearProducto(cLotes, uEntera, { stock_inicial: 10, codigo_lote: 'B', fecha_caducidad: sumarDias(HOY, 30) });
    const loteP = (await verLotes(p.id))[0];
    const loteOtro = (await verLotes(otro.id))[0];
    fallo(await ajuste(p, 'disminucion', 1, 'merma'), 400, 'LOTE_REQUERIDO');
    fallo(await ajuste(p, 'disminucion', 1, 'merma', { lote_id: loteOtro.id }), 404, 'LOTE_NO_ENCONTRADO');
    const r = fallo(await ajuste(p, 'disminucion', 11, 'merma', { lote_id: loteP.id }), 409, 'STOCK_INSUFICIENTE');
    assert.equal(r.detalles.disponible, 10);
    const d = exito(await ajuste(p, 'disminucion', 4, 'danio', { lote_id: loteP.id }), 201);
    assert.equal(d.producto.stock_actual, 6);
    assert.equal((await verLotes(p.id))[0].cantidad_disponible, 6);
    assert.equal(d.movimiento.lote_id, loteP.id);
  });

  test('P2-26 ajustes que suman y motivos solo de resta', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 10 });
    let d = exito(await ajuste(p, 'aumento', 5, 'correccion', { observacion: 'Conteo fisico' }), 201);
    assert.equal(d.producto.stock_actual, 15);
    assert.equal(d.movimiento.cantidad, 5);
    d = exito(await ajuste(p, 'aumento', 2, 'otro', { observacion: 'Hallazgo' }), 201);
    assert.equal(d.producto.stock_actual, 17);
    d = exito(await ajuste(p, 'disminucion', 7, 'correccion', { observacion: 'Conteo fisico' }), 201);
    assert.equal(d.producto.stock_actual, 10);
    assert.equal(d.movimiento.fecha_movimiento, HOY);
    for (const motivo of ['merma', 'danio', 'perdida', 'caducidad']) {
      errorEn(await ajuste(p, 'aumento', 1, motivo), 'motivo');
    }
    assert.equal((await verProducto(p.id)).stock_actual, 10);
  });

  test('P2-27 concurrencia: 10 ajustes de 1 sobre stock 5', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 5 });
    const rs = await Promise.all(Array.from({ length: 10 }, () => ajuste(p, 'disminucion', 1, 'merma')));
    assert.equal(rs.filter((r) => r.estado === 201).length, 5, rs.map((r) => r.estado).join(','));
    assert.equal(rs.filter((r) => r.estado === 409).length, 5);
    assert.equal((await verProducto(p.id)).stock_actual, 0);
  });

  test('P2-28 CHECK de BD impide stock negativo', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 1 });
    await assert.rejects(
      () => bd.query('UPDATE productos SET stock_actual = -1 WHERE id = ?', [p.id]),
      (err) => /constraint|check/i.test(err.message) || [4025, 3819].includes(err.errno)
    );
    assert.equal((await verProducto(p.id)).stock_actual, 1);
  });

  // ---------- Movimientos ----------
  test('P2-30 movimientos: filtros, paginacion y orden', async () => {
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 10 });
    await entrada(p, 5);
    await ajuste(p, 'disminucion', 2, 'merma');
    const todos = exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}`), 200);
    assert.equal(todos.total, 3);
    assert.deepEqual(todos.items.map((m) => m.tipo), ['ajuste', 'entrada', 'entrada']);
    assert.equal(todos.pagina, 1);
    const pag = exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}&limite=2`), 200);
    assert.equal(pag.items.length, 2);
    assert.equal(pag.total, 3);
    const pag2 = exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}&limite=2&pagina=2`), 200);
    assert.equal(pag2.items.length, 1);
    assert.equal(exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}&tipo=ajuste`), 200).total, 1);
    assert.equal(exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}&motivo=merma`), 200).total, 1);
    assert.equal(exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}&desde=${HOY}&hasta=${HOY}`), 200).total, 3);
    assert.equal(exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}&hasta=${sumarDias(HOY, -1)}`), 200).total, 0);
    assert.equal(exito(await api('GET', '/inventario/movimientos?producto_id=999999'), 200).total, 0);
    fallo(await api('GET', `/inventario/movimientos?desde=${HOY}&hasta=${sumarDias(HOY, -3)}`), 400, 'VALIDACION');
    fallo(await api('GET', '/inventario/movimientos?limite=500'), 400, 'VALIDACION');
    fallo(await api('GET', '/inventario/movimientos?tipo=x'), 400, 'VALIDACION');
  });

  test('P2-31 los movimientos son inmutables (sin PUT ni DELETE)', async () => {
    fallo(await api('PUT', '/inventario/movimientos/1', { cuerpo: {} }), 404, 'RUTA_NO_ENCONTRADA');
    fallo(await api('DELETE', '/inventario/movimientos/1'), 404, 'RUTA_NO_ENCONTRADA');
  });

  // ---------- Alertas ----------
  test('P2-32 alertas de stock bajo', async () => {
    const cat = await crearCategoria('Alertas');
    const igual = await crearProducto(cat, uEntera, { stock_minimo: 3, stock_inicial: 3 });
    const mayor = await crearProducto(cat, uEntera, { stock_minimo: 3, stock_inicial: 4 });
    const inact = await crearProducto(cat, uEntera, { stock_minimo: 3, stock_inicial: 1 });
    exito(await api('PATCH', `/productos/${inact.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    const a = exito(await api('GET', '/inventario/alertas'), 200);
    const ids = a.stock_bajo.map((p) => p.id);
    assert.ok(ids.includes(igual.id));
    assert.ok(!ids.includes(mayor.id));
    assert.ok(!ids.includes(inact.id));
    assert.equal(a.totales.stock_bajo, a.stock_bajo.length);
  });

  test('P2-33 alertas de caducidad', async () => {
    const p = await crearProducto(cLotes, uEntera, { stock_minimo: 0 });
    await entrada(p, 5, { codigo_lote: 'C3', fecha_caducidad: sumarDias(HOY, 3) });
    const lote = (await verLotes(p.id))[0];
    const en = (a, arr) => a[arr].some((l) => l.id === lote.id);
    let a = exito(await api('GET', '/inventario/alertas?dias=7'), 200);
    assert.equal(a.dias, 7);
    assert.ok(en(a, 'por_vencer'));
    const item = a.por_vencer.find((l) => l.id === lote.id);
    assert.equal(item.dias_para_vencer, 3);
    assert.equal(item.estado_caducidad, 'por_vencer');
    a = exito(await api('GET', '/inventario/alertas?dias=2'), 200);
    assert.ok(!en(a, 'por_vencer'));
    a = exito(await api('GET', '/inventario/alertas'), 200);
    assert.equal(a.dias, env.alertaCaducidadDias);
    assert.equal(a.hoy, HOY);
    assert.ok(en(a, 'por_vencer'));
    assert.equal(a.totales.por_vencer, a.por_vencer.length);
    // lote vencido
    await bd.query('UPDATE lotes SET fecha_caducidad = ? WHERE id = ?', [sumarDias(HOY, -2), lote.id]);
    a = exito(await api('GET', '/inventario/alertas'), 200);
    assert.ok(en(a, 'vencidos'));
    assert.ok(!en(a, 'por_vencer'));
    assert.equal(a.vencidos.find((l) => l.id === lote.id).estado_caducidad, 'vencido');
    // lote agotado
    await ajuste(p, 'disminucion', 5, 'caducidad', { lote_id: lote.id });
    a = exito(await api('GET', '/inventario/alertas'), 200);
    assert.ok(!en(a, 'vencidos'));
    fallo(await api('GET', '/inventario/alertas?dias=0'), 400, 'VALIDACION');
    fallo(await api('GET', '/inventario/alertas?dias=abc'), 400, 'VALIDACION');
    fallo(await api('GET', '/inventario/alertas?dias=366'), 400, 'VALIDACION');
  });

  // ---------- Eliminar, estado, cambios de categoria ----------
  test('P2-34 eliminar producto sin y con movimientos', async () => {
    const libre = await crearProducto(cSin, uEntera);
    const d = exito(await api('DELETE', `/productos/${libre.id}`), 200);
    assert.deepEqual(d, { id: libre.id, eliminado: true });
    fallo(await api('GET', `/productos/${libre.id}`), 404, 'PRODUCTO_NO_ENCONTRADO');
    const usado = await crearProducto(cSin, uEntera, { stock_inicial: 3 });
    fallo(await api('DELETE', `/productos/${usado.id}`), 409, 'PRODUCTO_CON_MOVIMIENTOS');
    assert.equal((await verProducto(usado.id)).id, usado.id);
    fallo(await api('DELETE', '/productos/999999'), 404, 'PRODUCTO_NO_ENCONTRADO');
  });

  test('P2-35 desactivar y reactivar producto; categoria en uso', async () => {
    const cat = await crearCategoria('Uso');
    const p = await crearProducto(cat, uEntera);
    assert.equal(exito(await api('PATCH', `/productos/${p.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200).estado, 'inactivo');
    assert.equal(exito(await api('PATCH', `/productos/${p.id}/estado`, { cuerpo: { estado: 'activo' } }), 200).estado, 'activo');
    fallo(await api('PATCH', `/categorias/${cat.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 409, 'CATEGORIA_EN_USO');
    errorEn(await api('PATCH', `/productos/${p.id}/estado`, { cuerpo: { estado: 'activo', otro: 1 } }), 'otro');
  });

  test('P2-36 cambios de control de lotes con y sin movimientos', async () => {
    const conMov = await crearCategoria('ConMov', false);
    await crearProducto(conMov, uEntera, { stock_inicial: 2 });
    fallo(await api('PUT', `/categorias/${conMov.id}`, { cuerpo: { controla_lotes: true } }), 409, 'CAMBIO_LOTES_NO_PERMITIDO');
    const sinMov = await crearCategoria('SinMov', false);
    await crearProducto(sinMov, uEntera);
    const r = exito(await api('PUT', `/categorias/${sinMov.id}`, { cuerpo: { controla_lotes: true } }), 200);
    assert.equal(r.controla_lotes, true);
    const p = await crearProducto(cSin, uEntera, { stock_inicial: 2 });
    fallo(await api('PUT', `/productos/${p.id}`, { cuerpo: { categoria_id: cLotes.id } }), 409, 'CAMBIO_NO_PERMITIDO');
    fallo(await api('PUT', `/productos/${p.id}`, { cuerpo: { unidad_id: uDec.id } }), 409, 'CAMBIO_NO_PERMITIDO');
    const u = await crearUnidad('ConMov', false);
    await crearProducto(cSin, u, { stock_inicial: 1 });
    fallo(await api('PUT', `/unidades-medida/${u.id}`, { cuerpo: { permite_decimales: true } }), 409, 'CAMBIO_NO_PERMITIDO');
  });

  // ---------- Servicio (salidas y stock vendible) ----------
  test('P2-37 registrarSalida: sin lotes, FEFO, insuficiente y lote vencido', async () => {
    const ref = { tipo: 'pedido', id: 999 };
    const salida = (productoId, cantidad) =>
      conTransaccion((c) => servicio.registrarSalida(c, { productoId, cantidad, usuarioId: adminId, referencia: ref }));

    // sin lotes
    const sin = await crearProducto(cSin, uEntera, { stock_inicial: 10 });
    const movs = await salida(sin.id, 4);
    assert.equal(movs.length, 1);
    assert.equal(movs[0].cantidad, -4);
    assert.equal(movs[0].motivo, 'despacho');
    assert.equal(movs[0].tipo, 'salida');
    assert.equal(movs[0].referencia_id, 999);
    assert.equal(movs[0].stock_resultante, 6);
    assert.equal((await verProducto(sin.id)).stock_actual, 6);

    // con lotes: FEFO (se crea primero el que caduca despues)
    const p = await crearProducto(cLotes, uEntera);
    await entrada(p, 4, { codigo_lote: 'TARDE', fecha_caducidad: sumarDias(HOY, 20) });
    await entrada(p, 3, { codigo_lote: 'PRONTO', fecha_caducidad: sumarDias(HOY, 5) });
    const fefo = await salida(p.id, 5);
    assert.equal(fefo.length, 2);
    assert.equal(fefo[0].codigo_lote, 'PRONTO');
    assert.equal(fefo[0].cantidad, -3);
    assert.equal(fefo[1].codigo_lote, 'TARDE');
    assert.equal(fefo[1].cantidad, -2);
    assert.ok(fefo.every((m) => m.referencia_tipo === 'pedido' && m.referencia_id === 999));
    const lotes = await verLotes(p.id);
    assert.deepEqual(lotes.map((l) => [l.codigo_lote, l.cantidad_disponible]), [['PRONTO', 0], ['TARDE', 2]]);
    assert.equal((await verProducto(p.id)).stock_actual, 2);

    // insuficiente: 409 sin cambios
    const antes = await conteo('movimientos_inventario');
    await assert.rejects(() => salida(p.id, 3), (e) => e.estado === 409 && e.codigo === 'STOCK_INSUFICIENTE' && e.detalles.disponible === 2);
    await assert.rejects(() => salida(sin.id, 7), (e) => e.estado === 409 && e.detalles.disponible === 6);
    assert.equal(await conteo('movimientos_inventario'), antes);
    assert.equal((await verProducto(p.id)).stock_actual, 2);

    // lote vencido no se consume
    const q = await crearProducto(cLotes, uEntera);
    await entrada(q, 3, { codigo_lote: 'VENCIDO', fecha_caducidad: sumarDias(HOY, 1) });
    await entrada(q, 5, { codigo_lote: 'VIGENTE', fecha_caducidad: sumarDias(HOY, 30) });
    await bd.query("UPDATE lotes SET fecha_caducidad = ? WHERE producto_id = ? AND codigo_lote = 'VENCIDO'", [sumarDias(HOY, -1), q.id]);
    const m = await salida(q.id, 5);
    assert.equal(m.length, 1);
    assert.equal(m[0].codigo_lote, 'VIGENTE');
    const lq = await verLotes(q.id);
    assert.equal(lq.find((l) => l.codigo_lote === 'VENCIDO').cantidad_disponible, 3);
  });

  // ---------- Seguridad y formato ----------
  test('P2-38 inyeccion SQL en buscar', async () => {
    const total = await conteo('productos');
    for (const ruta of ['/productos', '/categorias', '/unidades-medida']) {
      for (const carga of ["' OR '1'='1", "'; DROP TABLE productos; --", '%', '_']) {
        const r = await api('GET', `${ruta}?buscar=${encodeURIComponent(carga)}`);
        assert.ok(r.estado === 200, `${ruta} ${carga}: ${r.texto}`);
        if (carga.startsWith("'")) assert.equal(r.json.data.length, 0);
      }
    }
    assert.equal(await conteo('productos'), total);
  });

  test('P2-38b comodines % y _ se buscan como texto literal (categorias, unidades y productos)', async () => {
    const buscar = (ruta, texto) => api('GET', `${ruta}?buscar=${encodeURIComponent(texto)}`);
    const casos = [
      ['/categorias', (e) => crearCategoria(e)],
      ['/unidades-medida', (e) => crearUnidad(e)],
      ['/productos', (e) => crearProducto(cSin, uEntera, { nombre: unico(e) })],
    ];
    for (const [ruta, crear] of casos) {
      const guion = await crear('Za_b'); const guionX = await crear('ZaXb');
      const pct = await crear('Zc%d'); const pctX = await crear('ZcXYd');
      const idsDe = async (texto) => exito(await buscar(ruta, texto), 200).map((x) => x.id);
      assert.deepEqual(await idsDe('Za_b'), [guion.id], `${ruta}: _ no debe ser comodin`);
      assert.deepEqual(await idsDe('Zc%d'), [pct.id], `${ruta}: % no debe ser comodin`);
      assert.ok(!(await idsDe('Za_b')).includes(guionX.id));
      assert.ok(!(await idsDe('Zc%d')).includes(pctX.id));
    }
  });

  test('P2-39 JSON mal formado', async () => {
    fallo(await api('POST', '/productos', { crudo: '{"nombre": ' }), 400, 'JSON_INVALIDO');
    fallo(await api('POST', '/inventario/entradas', { crudo: '{oops' }), 400, 'JSON_INVALIDO');
  });

  test('P2-40 formato de numeros y fechas', async () => {
    const p = await crearProducto(cLotes, uEntera, { stock_minimo: 2, stock_inicial: 7, codigo_lote: 'F1', fecha_caducidad: sumarDias(HOY, 10) });
    const ver = await verProducto(p.id);
    for (const campo of ['precio_venta', 'stock_actual', 'stock_vendible', 'stock_vencido', 'stock_minimo']) {
      assert.equal(typeof ver[campo], 'number', campo);
    }
    const lote = (await verLotes(p.id))[0];
    assert.equal(typeof lote.cantidad_disponible, 'number');
    assert.equal(lote.fecha_caducidad, sumarDias(HOY, 10));
    assert.match(lote.fecha_caducidad, /^\d{4}-\d{2}-\d{2}$/);
    const m = exito(await api('GET', `/inventario/movimientos?producto_id=${p.id}`), 200).items[0];
    assert.equal(typeof m.cantidad, 'number');
    assert.equal(typeof m.stock_resultante, 'number');
    assert.match(m.fecha_movimiento, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(m.creado_en, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('P2-41 rendimiento: listas en menos de 3 s', async () => {
    for (const ruta of ['/productos', '/inventario/alertas']) {
      const t = Date.now();
      exito(await api('GET', ruta), 200);
      assert.ok(Date.now() - t < 3000, `${ruta} tardo ${Date.now() - t} ms`);
    }
  });

  // ---------- SKU y lotes vencidos ----------
  test('P2-43 SKU opcional y unico', async () => {
    const sku = `SKU-${EJECUCION}`;
    const crear = (extra) => api('POST', '/productos', {
      cuerpo: { nombre: unico('Sku'), categoria_id: cSin.id, unidad_id: uEntera.id, precio_venta: 1, stock_minimo: 0, ...extra },
    });
    const a = exito(await crear({ sku }), 201);
    assert.equal(a.sku, sku);
    fallo(await crear({ sku: sku.toLowerCase() }), 409, 'SKU_DUPLICADO');
    exito(await crear({}), 201);
    exito(await crear({ sku: '' }), 201);
    const b = exito(await api('GET', `/productos?buscar=${encodeURIComponent(sku)}`), 200);
    assert.deepEqual(b.map((p) => p.id), [a.id]);
    errorEn(await crear({ sku: 'con espacio' }), 'sku');
    errorEn(await crear({ sku: 'X'.repeat(51) }), 'sku');
    const quitado = exito(await api('PUT', `/productos/${a.id}`, { cuerpo: { sku: null } }), 200);
    assert.equal(quitado.sku, null);
    const c = exito(await crear({ sku }), 201);
    assert.equal(c.sku, sku);
    const d = exito(await crear({}), 201);
    fallo(await api('PUT', `/productos/${d.id}`, { cuerpo: { sku } }), 409, 'SKU_DUPLICADO');
  });

  test('P2-44 aumento en producto con lotes', async () => {
    const p = await crearProducto(cLotes, uEntera, { stock_inicial: 5, codigo_lote: 'V', fecha_caducidad: sumarDias(HOY, 30) });
    const lote = (await verLotes(p.id))[0];
    fallo(await ajuste(p, 'aumento', 2, 'correccion', { observacion: 'conteo' }), 400, 'LOTE_REQUERIDO');
    const d = exito(await ajuste(p, 'aumento', 2, 'correccion', { observacion: 'conteo', lote_id: lote.id }), 201);
    assert.equal(d.producto.stock_actual, 7);
    assert.equal((await verLotes(p.id))[0].cantidad_disponible, 7);
    await bd.query('UPDATE lotes SET fecha_caducidad = ? WHERE id = ?', [sumarDias(HOY, -1), lote.id]);
    fallo(await ajuste(p, 'aumento', 1, 'correccion', { observacion: 'conteo', lote_id: lote.id }), 409, 'LOTE_VENCIDO');
    assert.equal((await verProducto(p.id)).stock_actual, 7);
  });

  // Estado compartido de los casos 45 a 47 (lote vigente de 5 y lote vencido de 3).
  const vencidoCaso = {};

  test('P2-45 los lotes vencidos no cuentan como stock vendible', async () => {
    const p = await crearProducto(cLotes, uEntera, { stock_minimo: 6 });
    await entrada(p, 3, { codigo_lote: 'VENC', fecha_caducidad: sumarDias(HOY, 1) });
    await entrada(p, 5, { codigo_lote: 'VIG', fecha_caducidad: sumarDias(HOY, 60) });
    await bd.query("UPDATE lotes SET fecha_caducidad = ? WHERE producto_id = ? AND codigo_lote = 'VENC'", [sumarDias(HOY, -1), p.id]);
    const ver = await verProducto(p.id);
    assert.equal(ver.stock_actual, 8);
    assert.equal(ver.stock_vendible, 5);
    assert.equal(ver.stock_vencido, 3);
    assert.equal(ver.stock_bajo, true);
    const a = exito(await api('GET', '/inventario/alertas'), 200);
    assert.ok(a.stock_bajo.some((x) => x.id === p.id));
    const lotes = await verLotes(p.id);
    const venc = lotes.find((l) => l.codigo_lote === 'VENC');
    assert.ok(a.vencidos.some((l) => l.id === venc.id));
    Object.assign(vencidoCaso, { producto: p, lote: venc });
  });

  test('P2-47 servicio obtenerStockVendible y salida sobre el caso P2-45', async () => {
    const { producto } = vencidoCaso;
    assert.ok(producto, 'Depende de P2-45');
    for (const bloquear of [false, true]) {
      const v = await conTransaccion((c) => servicio.obtenerStockVendible(c, producto.id, { bloquear }));
      assert.equal(v.stock_vendible, 5);
      assert.equal(v.stock_vencido, 3);
      assert.equal(v.stock_actual, 8);
      assert.equal(v.producto_id, producto.id);
    }
    const antes = await conteo('movimientos_inventario');
    await assert.rejects(
      () => conTransaccion((c) => servicio.registrarSalida(c, {
        productoId: producto.id, cantidad: 6, usuarioId: adminId, referencia: { tipo: 'pedido', id: 1 },
      })),
      (e) => e.estado === 409 && e.codigo === 'STOCK_INSUFICIENTE' && e.detalles.disponible === 5
    );
    assert.equal(await conteo('movimientos_inventario'), antes);
    assert.equal((await verProducto(producto.id)).stock_actual, 8);
  });

  test('P2-46 baja del lote vencido con ajuste por caducidad', async () => {
    const { producto, lote } = vencidoCaso;
    assert.ok(producto, 'Depende de P2-45');
    const d = exito(await ajuste(producto, 'disminucion', 3, 'caducidad', { lote_id: lote.id }), 201);
    assert.equal(d.producto.stock_actual, 5);
    assert.equal(d.producto.stock_vendible, 5);
    assert.equal(d.movimiento.motivo, 'caducidad');
    assert.equal(d.movimiento.usuario_id, adminId);
    const a = exito(await api('GET', '/inventario/alertas'), 200);
    assert.ok(!a.vencidos.some((l) => l.id === lote.id));
  });

  test('P2-48 unidades precargadas', async () => {
    const por = (n) => precargadas.find((u) => u.nombre === n);
    for (const n of ['Unidad', 'Caja', 'Paquete']) assert.equal(por(n).permite_decimales, false, n);
    assert.equal(por('Litro').permite_decimales, true);
    const litro = await crearProducto(cSin, por('Litro'));
    const caja = await crearProducto(cSin, por('Caja'));
    exito(await entrada(litro, 1.5), 201);
    errorEn(await entrada(caja, 1.5), 'cantidad');
  });

  // Va al final: comprueba el invariante sobre todos los productos de esta ejecucion.
  test('P2-29 invariante: stock = suma de movimientos y de lotes', async () => {
    const [filas] = await bd.query(
      `SELECT p.id, p.stock_actual, c.controla_lotes,
         COALESCE((SELECT SUM(m.cantidad) FROM movimientos_inventario m WHERE m.producto_id = p.id), 0) AS suma_mov,
         COALESCE((SELECT SUM(l.cantidad_disponible) FROM lotes l WHERE l.producto_id = p.id), 0) AS suma_lotes
       FROM productos p JOIN categorias c ON c.id = p.categoria_id WHERE p.nombre LIKE ?`, [`${MARCA}%`]);
    assert.ok(filas.length > 20);
    for (const f of filas) {
      assert.equal(f.stock_actual, f.suma_mov, `producto ${f.id}: stock vs movimientos`);
      if (f.controla_lotes) assert.equal(f.stock_actual, f.suma_lotes, `producto ${f.id}: stock vs lotes`);
    }
  });
});
