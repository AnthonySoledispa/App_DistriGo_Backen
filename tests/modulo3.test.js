'use strict';
// Pruebas del Modulo 3 (clientes/tiendas y rutas). node:test + fetch.
// La suite levanta su propio servidor (puerto 3105) y requiere la BD con los scripts 00 a 03,
// y TEST_ADMIN_* / TEST_REPARTIDOR_* en .env. Todos los datos llevan la marca T<EJECUCION> y se
// borran al final por SQL directo.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const RAIZ = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });

const servicio = require('../src/services/clientes.service');
const { calcularCredito } = require('../src/utils/credito');
const { conTransaccion, pool } = require('../src/config/db');
const { limpiar } = require('../scripts/limpiar-datos-e2e');

const PUERTO = 3105;
const BASE = `http://127.0.0.1:${PUERTO}/api`;
const EJECUCION = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const MARCA = `T${EJECUCION}`;
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

let telContador = 0;
const telefonoNuevo = () => `09${String(10000000 + (++telContador)).slice(-8)}`;

const cuerpoCliente = (extra = {}) => ({
  nombre: unico('Tienda'), contacto: 'Maria Perez', telefono: telefonoNuevo(),
  direccion: 'Calle Principal 123', limite_credito: 100, ...extra,
});

async function crearRuta(etiqueta = 'Ruta', extra = {}) {
  return exito(await api('POST', '/rutas', { cuerpo: { nombre: unico(etiqueta), ...extra } }), 201);
}

async function crearCliente(extra = {}) {
  return exito(await api('POST', '/clientes', { cuerpo: cuerpoCliente(extra) }), 201);
}

async function conteo(tabla) {
  const [f] = await bd.query(`SELECT COUNT(*) AS n FROM ${tabla}`);
  return Number(f[0].n);
}

describe('Modulo 3: clientes (tiendas) y rutas', () => {
  let rutaA;

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
      decimalNumbers: true,
    });
    await bd.query("SET time_zone='+00:00'");
    await iniciarServidor();
    const a = await login(process.env.TEST_ADMIN_CORREO, process.env.TEST_ADMIN_CONTRASENA, 'web');
    tokenAdmin = a.token; adminId = a.usuario.id;
    const rep = await login(process.env.TEST_REPARTIDOR_CORREO, process.env.TEST_REPARTIDOR_CONTRASENA, 'movil');
    tokenRepartidor = rep.token;
    rutaA = await crearRuta('Ruta A', { descripcion: 'Zona norte' });
  });

  after(async () => {
    try {
      await bd.query('DELETE FROM clientes WHERE nombre LIKE ?', [`${MARCA}%`]);
      await bd.query('DELETE FROM rutas WHERE nombre LIKE ?', [`${MARCA}%`]);
      await bd.query('DELETE FROM sesiones WHERE usuario_id = ? AND creada_en >= FROM_UNIXTIME(?)', [adminId, Math.floor(inicio / 1000) - 5]);
    } finally {
      await bd.end();
      await pool.end();
      for (const p of procesos) p.kill();
    }
  });

  // ---------- Permisos ----------
  const RUTAS_API = [
    ['GET', '/clientes'], ['POST', '/clientes'], ['GET', '/clientes/1'], ['PUT', '/clientes/1'],
    ['PATCH', '/clientes/1/estado'], ['GET', '/clientes/1/compras'],
    ['GET', '/rutas'], ['POST', '/rutas'], ['GET', '/rutas/1'], ['PUT', '/rutas/1'], ['PATCH', '/rutas/1/estado'],
  ];
  const cuerpoDe = (m) => (m === 'GET' ? undefined : { nombre: unico('x') });

  test('P3-01 el repartidor recibe 403 en clientes y rutas y no se crean filas', async () => {
    const antes = [await conteo('clientes'), await conteo('rutas')];
    for (const [m, ruta] of RUTAS_API) {
      fallo(await api(m, ruta, { token: tokenRepartidor, cuerpo: cuerpoDe(m) }), 403, 'ACCESO_DENEGADO');
    }
    assert.deepEqual([await conteo('clientes'), await conteo('rutas')], antes);
  });

  test('P3-02 sin token responde 401 TOKEN_AUSENTE', async () => {
    for (const [m, ruta] of RUTAS_API) fallo(await sinToken(m, ruta, cuerpoDe(m)), 401, 'TOKEN_AUSENTE');
  });

  // ---------- Rutas ----------
  test('P3-03 crear ruta; duplicada con mayusculas; nombre corto y largo; campo extra', async () => {
    const nombre = unico('Ruta crear');
    const r = exito(await api('POST', '/rutas', { cuerpo: { nombre, descripcion: 'Centro' } }), 201);
    assert.equal(r.nombre, nombre);
    assert.equal(r.estado, 'activo');
    assert.equal(r.total_clientes, 0);
    fallo(await api('POST', '/rutas', { cuerpo: { nombre: nombre.toUpperCase() } }), 409, 'RUTA_DUPLICADA');
    errorEn(await api('POST', '/rutas', { cuerpo: { nombre: 'a' } }), 'nombre');
    errorEn(await api('POST', '/rutas', { cuerpo: { nombre: 'a'.repeat(81) } }), 'nombre');
    errorEn(await api('POST', '/rutas', { cuerpo: { nombre: unico('Ruta'), dia_visita: 'lunes' } }), 'dia_visita');
    errorEn(await api('POST', '/rutas', { cuerpo: {} }), 'nombre');
  });

  test('P3-04 editar ruta; descripcion vacia pasa a null; PUT vacio', async () => {
    const ruta = await crearRuta('Ruta editar', { descripcion: 'Inicial' });
    const nuevo = unico('Ruta editada');
    const e = exito(await api('PUT', `/rutas/${ruta.id}`, { cuerpo: { nombre: nuevo, descripcion: '   ' } }), 200);
    assert.equal(e.nombre, nuevo);
    assert.equal(e.descripcion, null);
    errorEn(await api('PUT', `/rutas/${ruta.id}`, { cuerpo: {} }), 'cuerpo');
    const otra = await crearRuta('Ruta otra');
    fallo(await api('PUT', `/rutas/${ruta.id}`, { cuerpo: { nombre: otra.nombre } }), 409, 'RUTA_DUPLICADA');
    fallo(await api('PUT', '/rutas/999999', { cuerpo: { nombre: unico('x') } }), 404, 'RUTA_NO_ENCONTRADA');
  });

  test('P3-05 listar rutas con filtros y total_clientes; filtro invalido', async () => {
    const ruta = await crearRuta('Ruta lista');
    await crearCliente({ ruta_id: ruta.id });
    const todas = exito(await api('GET', `/rutas?buscar=${encodeURIComponent(ruta.nombre)}`), 200);
    assert.equal(todas.length, 1);
    assert.equal(todas[0].total_clientes, 1);
    assert.equal(todas[0].clientes_activos, 1);
    assert.equal(typeof todas[0].total_clientes, 'number');
    const inactivas = exito(await api('GET', `/rutas?estado=inactivo&buscar=${encodeURIComponent(MARCA)}`), 200);
    assert.ok(!inactivas.some((x) => x.id === ruta.id));
    errorEn(await api('GET', '/rutas?estado=otro'), 'estado');
    errorEn(await api('GET', `/rutas?buscar=${'a'.repeat(101)}`), 'buscar');
    exito(await api('GET', `/rutas/${ruta.id}`), 200);
  });

  // ---------- Crear tienda ----------
  test('P3-06 crear tienda completa con ruta: telefono normalizado y credito calculado', async () => {
    const c = exito(await api('POST', '/clientes', {
      cuerpo: { nombre: unico('Tienda completa'), contacto: '  Juan Mora ', telefono: '+593 99 123-4567', direccion: 'Av. Central 45', ruta_id: rutaA.id, limite_credito: 250.5 },
    }), 201);
    assert.equal(c.telefono, '0991234567');
    assert.equal(c.contacto, 'Juan Mora');
    assert.equal(c.ruta_id, rutaA.id);
    assert.equal(c.ruta_nombre, rutaA.nombre);
    assert.equal(c.ruta_estado, 'activo');
    assert.equal(c.limite_credito, 250.5);
    assert.equal(c.saldo_pendiente, 0);
    assert.equal(c.credito_disponible, 250.5);
    assert.equal(c.credito_excedido, false);
    assert.equal(c.estado, 'activo');
    assert.equal(c.creado_por, adminId);
    const claves = ['id', 'nombre', 'contacto', 'telefono', 'direccion', 'ruta_id', 'ruta_nombre', 'ruta_estado',
      'limite_credito', 'saldo_pendiente', 'credito_disponible', 'credito_excedido', 'estado', 'creado_por', 'creado_en', 'actualizado_en'];
    assert.deepEqual(Object.keys(c), claves);
    assert.deepEqual(exito(await api('GET', `/clientes/${c.id}`), 200), c);
  });

  test('P3-07 tienda sin ruta o con ruta_id null', async () => {
    const a = await crearCliente();
    assert.equal(a.ruta_id, null);
    assert.equal(a.ruta_nombre, null);
    const b = await crearCliente({ ruta_id: null });
    assert.equal(b.ruta_id, null);
  });

  test('P3-08 falta cada campo obligatorio', async () => {
    for (const campo of ['nombre', 'contacto', 'telefono', 'direccion', 'limite_credito']) {
      const cuerpo = cuerpoCliente();
      delete cuerpo[campo];
      errorEn(await api('POST', '/clientes', { cuerpo }), campo);
    }
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ nombre: 'a' }) }), 'nombre');
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ contacto: 'a' }) }), 'contacto');
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ direccion: 'abc' }) }), 'direccion');
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ nombre: 'a'.repeat(121) }) }), 'nombre');
  });

  test('P3-09 telefonos validos en varios formatos quedan normalizados', async () => {
    const casos = [
      ['0991234567', '0991234567'], ['099 123 4567', '0991234567'], ['099-123-4567', '0991234567'],
      ['(099) 123.4567', '0991234567'], ['+593991234567', '0991234567'], ['593991234567', '0991234567'],
      ['042345678', '042345678'], ['+593 2 2345678', '022345678'], ['072345678', '072345678'],
    ];
    for (const [entrada, esperado] of casos) {
      const c = exito(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ telefono: entrada }) }), 201);
      assert.equal(c.telefono, esperado, entrada);
    }
  });

  test('P3-10 telefonos invalidos', async () => {
    const malos = ['', '   ', 'abc', '12345', '0891234567', '09912345', '09912345678', '0112345678', '082345678',
      '+34991234567', '099123456a', '++593991234567', '099+1234567'];
    for (const t of malos) errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ telefono: t }) }), 'telefono');
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ telefono: 991234567 }) }), 'telefono');
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ telefono: null }) }), 'telefono');
  });

  test('P3-11 limite_credito invalidos y cero', async () => {
    for (const v of [-1, 100000000, 1.234, '100', null, true]) {
      errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ limite_credito: v }) }), 'limite_credito');
    }
    const cero = exito(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ limite_credito: 0 }) }), 201);
    assert.equal(cero.limite_credito, 0);
    assert.equal(cero.credito_disponible, 0);
    assert.equal(cero.credito_excedido, false);
    const max = exito(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ limite_credito: 99999999.99 }) }), 201);
    assert.equal(max.limite_credito, 99999999.99);
  });

  test('P3-12 campos no permitidos en POST', async () => {
    for (const extra of [{ saldo: 5 }, { estado: 'inactivo' }, { id: 1 }, { creado_por: 1 }, { dia_visita: 'lunes' }]) {
      const campo = Object.keys(extra)[0];
      errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente(extra) }), campo);
    }
    fallo(await api('POST', '/clientes', { cuerpo: [] }), 400, 'VALIDACION');
  });

  test('P3-13 nombre duplicado responde 409; mismo telefono se permite', async () => {
    const base = await crearCliente();
    fallo(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ nombre: base.nombre.toUpperCase() }) }), 409, 'CLIENTE_DUPLICADO');
    const otra = exito(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ telefono: base.telefono }) }), 201);
    assert.equal(otra.telefono, base.telefono);
  });

  test('P3-14 ruta inexistente responde 404; ruta inactiva responde 409', async () => {
    fallo(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ ruta_id: 999999 }) }), 404, 'RUTA_NO_ENCONTRADA');
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ ruta_id: 'abc' }) }), 'ruta_id');
    errorEn(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ ruta_id: 0 }) }), 'ruta_id');
    const ruta = await crearRuta('Ruta inactiva');
    exito(await api('PATCH', `/rutas/${ruta.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    fallo(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ ruta_id: ruta.id }) }), 409, 'RUTA_INACTIVA');
  });

  // ---------- Editar y estado ----------
  test('P3-15 editar tienda, cambiar y quitar ruta, PUT vacio, campo prohibido', async () => {
    const c = await crearCliente({ ruta_id: rutaA.id });
    const rutaB = await crearRuta('Ruta B');
    const nuevoNombre = unico('Tienda editada');
    const e1 = exito(await api('PUT', `/clientes/${c.id}`, {
      cuerpo: { nombre: nuevoNombre, contacto: 'Pedro Ruiz', telefono: '0987654321', direccion: 'Otra calle 99', limite_credito: 300 },
    }), 200);
    assert.equal(e1.nombre, nuevoNombre);
    assert.equal(e1.contacto, 'Pedro Ruiz');
    assert.equal(e1.limite_credito, 300);
    assert.equal(e1.credito_disponible, 300);
    assert.equal(e1.ruta_id, rutaA.id);
    const e2 = exito(await api('PUT', `/clientes/${c.id}`, { cuerpo: { ruta_id: rutaB.id } }), 200);
    assert.equal(e2.ruta_id, rutaB.id);
    assert.equal(e2.ruta_nombre, rutaB.nombre);
    const e3 = exito(await api('PUT', `/clientes/${c.id}`, { cuerpo: { ruta_id: null } }), 200);
    assert.equal(e3.ruta_id, null);
    errorEn(await api('PUT', `/clientes/${c.id}`, { cuerpo: {} }), 'cuerpo');
    errorEn(await api('PUT', `/clientes/${c.id}`, { cuerpo: { estado: 'inactivo' } }), 'estado');
    errorEn(await api('PUT', `/clientes/${c.id}`, { cuerpo: { saldo_pendiente: 0 } }), 'saldo_pendiente');
    const otro = await crearCliente();
    fallo(await api('PUT', `/clientes/${c.id}`, { cuerpo: { nombre: otro.nombre } }), 409, 'CLIENTE_DUPLICADO');
    fallo(await api('PUT', `/clientes/${c.id}`, { cuerpo: { ruta_id: 999999 } }), 404, 'RUTA_NO_ENCONTRADA');
  });

  test('P3-16 con la ruta inactivada se puede editar el contacto, pero no cambiar a otra ruta inactiva', async () => {
    const r1 = await crearRuta('Ruta r1');
    const r2 = await crearRuta('Ruta r2');
    const c = await crearCliente({ ruta_id: r1.id });
    // Para inactivar r1 primero se desactiva la tienda; luego se reactiva con la ruta ya inactiva.
    exito(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    exito(await api('PATCH', `/rutas/${r1.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    exito(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: { estado: 'activo' } }), 200);
    exito(await api('PATCH', `/rutas/${r2.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    const e = exito(await api('PUT', `/clientes/${c.id}`, { cuerpo: { contacto: 'Nuevo Contacto', ruta_id: r1.id } }), 200);
    assert.equal(e.contacto, 'Nuevo Contacto');
    assert.equal(e.ruta_estado, 'inactivo');
    fallo(await api('PUT', `/clientes/${c.id}`, { cuerpo: { ruta_id: r2.id } }), 409, 'RUTA_INACTIVA');
  });

  test('P3-17 desactivar y reactivar tienda', async () => {
    const c = await crearCliente();
    assert.equal(exito(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200).estado, 'inactivo');
    assert.equal(exito(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: { estado: 'activo' } }), 200).estado, 'activo');
    errorEn(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: { estado: 'borrado' } }), 'estado');
    errorEn(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: {} }), 'estado');
    fallo(await api('PATCH', '/clientes/999999/estado', { cuerpo: { estado: 'inactivo' } }), 404, 'CLIENTE_NO_ENCONTRADO');
  });

  test('P3-18 no existe DELETE de tienda ni de ruta', async () => {
    const c = await crearCliente();
    const r = await crearRuta('Ruta delete');
    fallo(await api('DELETE', `/clientes/${c.id}`), 404, 'ENDPOINT_NO_ENCONTRADO');
    fallo(await api('DELETE', `/rutas/${r.id}`), 404, 'ENDPOINT_NO_ENCONTRADO');
    exito(await api('GET', `/clientes/${c.id}`), 200);
    exito(await api('GET', `/rutas/${r.id}`), 200);
  });

  test('P3-19 desactivar ruta: con tienda activa 409; solo inactivas 200; sin tiendas 200', async () => {
    const ruta = await crearRuta('Ruta uso');
    const c = await crearCliente({ ruta_id: ruta.id });
    const f = fallo(await api('PATCH', `/rutas/${ruta.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 409, 'RUTA_EN_USO');
    assert.ok(f.mensaje);
    exito(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    const ok = exito(await api('PATCH', `/rutas/${ruta.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    assert.equal(ok.estado, 'inactivo');
    assert.equal(ok.total_clientes, 1);
    assert.equal(ok.clientes_activos, 0);
    const vacia = await crearRuta('Ruta vacia');
    exito(await api('PATCH', `/rutas/${vacia.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    exito(await api('PATCH', `/rutas/${vacia.id}/estado`, { cuerpo: { estado: 'activo' } }), 200);
    errorEn(await api('PATCH', `/rutas/${vacia.id}/estado`, { cuerpo: { estado: 'x' } }), 'estado');
  });

  // ---------- Busqueda ----------
  test('P3-20 busqueda por nombre, contacto, telefono y nombre de ruta', async () => {
    const ruta = await crearRuta('Ruta Zafiro');
    const unicoTxt = crypto.randomBytes(4).toString('hex');
    const c = await crearCliente({ nombre: `${MARCA} Bodega ${unicoTxt}`, contacto: `Contacto ${unicoTxt}x`, telefono: '0961112233', ruta_id: ruta.id });
    const buscar = async (q) => exito(await api('GET', `/clientes?buscar=${encodeURIComponent(q)}`), 200);
    assert.ok((await buscar(`Bodega ${unicoTxt}`)).some((x) => x.id === c.id), 'por nombre');
    assert.ok((await buscar(`BODEGA ${unicoTxt.toUpperCase()}`)).some((x) => x.id === c.id), 'sin distinguir mayusculas');
    assert.ok((await buscar(`Contacto ${unicoTxt}x`)).some((x) => x.id === c.id), 'por contacto');
    assert.ok((await buscar('0961112233')).some((x) => x.id === c.id), 'por telefono');
    assert.ok((await buscar('096 111 2233')).some((x) => x.id === c.id), 'por telefono con espacios');
    const porRuta = await buscar(ruta.nombre);
    assert.ok(porRuta.some((x) => x.id === c.id), 'por nombre de ruta');
    assert.equal(porRuta.length, 1);
    assert.equal((await buscar(`zzz${unicoTxt}`)).length, 0);
    const todas = exito(await api('GET', '/clientes'), 200);
    assert.ok(Array.isArray(todas) && todas.length >= 1);
  });

  test('P3-21 filtros por ruta, sin ruta, estado y combinaciones invalidas', async () => {
    const ruta = await crearRuta('Ruta filtro');
    const activa = await crearCliente({ ruta_id: ruta.id });
    const inactiva = await crearCliente({ ruta_id: ruta.id });
    exito(await api('PATCH', `/clientes/${inactiva.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    const sin = await crearCliente();
    const porRuta = exito(await api('GET', `/clientes?ruta_id=${ruta.id}`), 200);
    assert.deepEqual(porRuta.map((x) => x.id).sort(), [activa.id, inactiva.id].sort());
    const soloAct = exito(await api('GET', `/clientes?ruta_id=${ruta.id}&estado=activo`), 200);
    assert.deepEqual(soloAct.map((x) => x.id), [activa.id]);
    const sinRuta = exito(await api('GET', '/clientes?sin_ruta=true'), 200);
    assert.ok(sinRuta.some((x) => x.id === sin.id));
    assert.ok(sinRuta.every((x) => x.ruta_id === null));
    const conRuta = exito(await api('GET', '/clientes?sin_ruta=false'), 200);
    assert.ok(conRuta.some((x) => x.id === activa.id));
    errorEn(await api('GET', `/clientes?ruta_id=${ruta.id}&sin_ruta=true`), 'sin_ruta');
    errorEn(await api('GET', '/clientes?ruta_id=abc'), 'ruta_id');
    errorEn(await api('GET', '/clientes?sin_ruta=si'), 'sin_ruta');
    errorEn(await api('GET', '/clientes?estado=otro'), 'estado');
    errorEn(await api('GET', `/clientes?buscar=${'a'.repeat(101)}`), 'buscar');
  });

  test('P3-22 inyeccion SQL y comodines en buscar no producen 500 ni filas extra', async () => {
    const total = exito(await api('GET', '/clientes'), 200).length;
    for (const q of ["' OR '1'='1", "'; DROP TABLE clientes; --", '" OR 1=1 --', '%', '_', '\\', '%%', '\\%']) {
      const r = await api('GET', `/clientes?buscar=${encodeURIComponent(q)}`);
      assert.notEqual(r.estado, 500, q);
      const lista = exito(r, 200);
      assert.ok(lista.length <= total, q);
      if (q.includes("'") || q.includes('"')) assert.equal(lista.length, 0, q);
      const rr = await api('GET', `/rutas?buscar=${encodeURIComponent(q)}`);
      assert.notEqual(rr.estado, 500, q);
    }
    // El comodin se busca como texto literal: ninguna tienda del test lleva % ni _ en nombre, contacto, telefono ni ruta.
    assert.equal(exito(await api('GET', `/clientes?buscar=${encodeURIComponent('%')}`), 200).length, 0);
    assert.equal(exito(await api('GET', `/clientes?buscar=${encodeURIComponent('_')}`), 200).length, 0);
    assert.equal(await conteo('clientes') > 0, true);
  });

  test('P3-23 tienda inexistente o id invalido', async () => {
    fallo(await api('GET', '/clientes/999999'), 404, 'CLIENTE_NO_ENCONTRADO');
    errorEn(await api('GET', '/clientes/abc'), 'id');
    fallo(await api('PUT', '/clientes/999999', { cuerpo: { contacto: 'Alguien' } }), 404, 'CLIENTE_NO_ENCONTRADO');
    errorEn(await api('PUT', '/clientes/abc', { cuerpo: { contacto: 'Alguien' } }), 'id');
    fallo(await api('GET', '/rutas/999999'), 404, 'RUTA_NO_ENCONTRADA');
    errorEn(await api('GET', '/rutas/abc'), 'id');
  });

  // ---------- Historial ----------
  test('P3-24 historial vacio con su contrato; filtros invalidos; tienda inexistente', async () => {
    const c = await crearCliente();
    const h = exito(await api('GET', `/clientes/${c.id}/compras`), 200);
    assert.deepEqual(h, { items: [], total: 0, pagina: 1, limite: 20 });
    const h2 = exito(await api('GET', `/clientes/${c.id}/compras?desde=2026-01-01&hasta=2026-12-31&pagina=2&limite=50`), 200);
    assert.deepEqual(h2, { items: [], total: 0, pagina: 2, limite: 50 });
    errorEn(await api('GET', `/clientes/${c.id}/compras?desde=2026-02-30`), 'desde');
    errorEn(await api('GET', `/clientes/${c.id}/compras?desde=2026-05-02&hasta=2026-05-01`), 'desde');
    errorEn(await api('GET', `/clientes/${c.id}/compras?pagina=0`), 'pagina');
    errorEn(await api('GET', `/clientes/${c.id}/compras?limite=101`), 'limite');
    fallo(await api('GET', '/clientes/999999/compras'), 404, 'CLIENTE_NO_ENCONTRADO');
    errorEn(await api('GET', '/clientes/abc/compras'), 'id');
  });

  // ---------- Credito (servicio) ----------
  test('P3-25 calcularCredito con valores exactos', () => {
    assert.deepEqual(calcularCredito(100, 0), { saldo_pendiente: 0, credito_disponible: 100, credito_excedido: false });
    assert.deepEqual(calcularCredito(100, 40.5), { saldo_pendiente: 40.5, credito_disponible: 59.5, credito_excedido: false });
    assert.deepEqual(calcularCredito(100, 100), { saldo_pendiente: 100, credito_disponible: 0, credito_excedido: false });
    assert.deepEqual(calcularCredito(100, 100.01), { saldo_pendiente: 100.01, credito_disponible: 0, credito_excedido: true });
    assert.deepEqual(calcularCredito(0, 0), { saldo_pendiente: 0, credito_disponible: 0, credito_excedido: false });
    assert.deepEqual(calcularCredito(0, 5), { saldo_pendiente: 5, credito_disponible: 0, credito_excedido: true });
    // Errores clasicos de coma flotante: 0.3 - 0.1 y 0.7 - 0.1.
    assert.equal(calcularCredito(0.3, 0.1).credito_disponible, 0.2);
    assert.equal(calcularCredito(0.7, 0.1).credito_disponible, 0.6);
    assert.equal(calcularCredito('99999999.99', '0.01').credito_disponible, 99999999.98);
  });

  test('P3-26 obtenerEstadoCredito: saldo 0, bloqueo y cliente inexistente', async () => {
    const c = await crearCliente({ limite_credito: 80 });
    const e = await servicio.obtenerEstadoCredito(null, c.id);
    assert.deepEqual(e, {
      cliente_id: c.id, estado: 'activo', limite_credito: 80,
      saldo_pendiente: 0, credito_disponible: 80, credito_excedido: false,
    });
    const b = await conTransaccion((cn) => servicio.obtenerEstadoCredito(cn, c.id, { bloquear: true }));
    assert.deepEqual(b, e);
    assert.equal(await servicio.obtenerEstadoCredito(null, 999999), null);
    const mapa = await servicio.saldosPendientes(null, [c.id, 999999]);
    assert.equal(mapa.get(c.id), 0);
  });

  test('P3-27 validarCreditoParaPedido: ok, credito insuficiente, inactivo e inexistente', async () => {
    const c = await crearCliente({ limite_credito: 50 });
    const ok = await conTransaccion((cn) => servicio.validarCreditoParaPedido(cn, c.id, 50));
    assert.equal(ok.credito_disponible, 50);
    await assert.rejects(
      () => conTransaccion((cn) => servicio.validarCreditoParaPedido(cn, c.id, 50.01)),
      (e) => e.estado === 409 && e.codigo === 'CREDITO_INSUFICIENTE'
        && e.detalles.cliente_id === c.id && e.detalles.limite_credito === 50 && e.detalles.saldo_pendiente === 0
        && e.detalles.credito_disponible === 50 && e.detalles.monto === 50.01
    );
    exito(await api('PATCH', `/clientes/${c.id}/estado`, { cuerpo: { estado: 'inactivo' } }), 200);
    await assert.rejects(
      () => conTransaccion((cn) => servicio.validarCreditoParaPedido(cn, c.id, 1)),
      (e) => e.estado === 409 && e.codigo === 'CLIENTE_INACTIVO'
    );
    await assert.rejects(
      () => conTransaccion((cn) => servicio.validarCreditoParaPedido(cn, 999999, 1)),
      (e) => e.estado === 404 && e.codigo === 'CLIENTE_NO_ENCONTRADO'
    );
    for (const malo of [undefined, null, 'abc', '10', NaN, Infinity, 0, -5]) {
      await assert.rejects(
        () => conTransaccion((cn) => servicio.validarCreditoParaPedido(cn, c.id, malo)),
        (e) => e.estado === 400 && e.codigo === 'VALIDACION',
        `monto ${String(malo)} debe rechazarse`
      );
    }
    const cero = await crearCliente({ limite_credito: 0 });
    await assert.rejects(
      () => conTransaccion((cn) => servicio.validarCreditoParaPedido(cn, cero.id, 0.01)),
      (e) => e.codigo === 'CREDITO_INSUFICIENTE'
    );
  });

  test('P3-28 bajar el limite a 0 deja disponible 0 y no excedido (saldo 0)', async () => {
    const c = await crearCliente({ limite_credito: 500 });
    const e = exito(await api('PUT', `/clientes/${c.id}`, { cuerpo: { limite_credito: 0 } }), 200);
    assert.equal(e.limite_credito, 0);
    assert.equal(e.credito_disponible, 0);
    assert.equal(e.credito_excedido, false);
    assert.equal(e.saldo_pendiente, 0);
  });

  test('P3-29 la BD rechaza un limite de credito negativo (CHECK)', async () => {
    await assert.rejects(
      () => bd.query('INSERT INTO clientes (nombre, contacto, telefono, direccion, limite_credito) VALUES (?, ?, ?, ?, ?)',
        [unico('Negativa'), 'Contacto', '0991234567', 'Direccion 123', -1])
    );
  });

  test('P3-30 JSON mal formado responde 400 JSON_INVALIDO', async () => {
    fallo(await api('POST', '/clientes', { crudo: '{"nombre": ' }), 400, 'JSON_INVALIDO');
    fallo(await api('POST', '/rutas', { crudo: '{"nombre": ' }), 400, 'JSON_INVALIDO');
  });

  test('P3-31 tipos numericos y booleanos en las respuestas', async () => {
    const c = await crearCliente({ limite_credito: 12.5, ruta_id: rutaA.id });
    for (const x of [c, exito(await api('GET', `/clientes?buscar=${encodeURIComponent(c.nombre)}`), 200)[0]]) {
      assert.equal(typeof x.id, 'number');
      assert.equal(typeof x.ruta_id, 'number');
      assert.equal(typeof x.limite_credito, 'number');
      assert.equal(typeof x.saldo_pendiente, 'number');
      assert.equal(typeof x.credito_disponible, 'number');
      assert.equal(typeof x.credito_excedido, 'boolean');
    }
    const ruta = exito(await api('GET', `/rutas/${rutaA.id}`), 200);
    assert.equal(typeof ruta.total_clientes, 'number');
    assert.equal(typeof ruta.clientes_activos, 'number');
  });

  test('P3-32 GET /clientes responde en menos de 3 segundos', async () => {
    const t0 = Date.now();
    exito(await api('GET', '/clientes'), 200);
    assert.ok(Date.now() - t0 < 3000);
    const t1 = Date.now();
    exito(await api('GET', `/clientes?buscar=${encodeURIComponent(MARCA)}`), 200);
    assert.ok(Date.now() - t1 < 3000);
  });

  test('P3-33 la limpieza E2E borra solo clientes y rutas que empiezan por "E2E "', async () => {
    const sufijo = crypto.randomBytes(3).toString('hex');
    const ruta = exito(await api('POST', '/rutas', { cuerpo: { nombre: `E2E Ruta ${sufijo}` } }), 201);
    const cliente = exito(await api('POST', '/clientes', { cuerpo: cuerpoCliente({ nombre: `E2E Tienda ${sufijo}`, ruta_id: ruta.id }) }), 201);
    const propio = await crearCliente();
    const propiaRuta = await crearRuta('Ruta propia');
    const conteos = await limpiar();
    assert.ok(conteos.clientes >= 1);
    assert.ok(conteos.rutas >= 1);
    fallo(await api('GET', `/clientes/${cliente.id}`), 404, 'CLIENTE_NO_ENCONTRADO');
    fallo(await api('GET', `/rutas/${ruta.id}`), 404, 'RUTA_NO_ENCONTRADA');
    exito(await api('GET', `/clientes/${propio.id}`), 200);
    exito(await api('GET', `/rutas/${propiaRuta.id}`), 200);
  });
});
