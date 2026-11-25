'use strict';
// Pruebas del Modulo 1 (autenticacion y usuarios). Usan node:test + fetch.
// La suite levanta sus propias instancias del servidor (puertos 3101 a 3103) y requiere
// la BD con los scripts 00 y 01 ejecutados, y TEST_ADMIN_* en .env (admin creado con npm run crear-admin).
// P38 (servicio mysql detenido) es manual. Es repetible: usa correos unicos y limpia al final.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const RAIZ = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });

const ADMIN = {
  correo: process.env.TEST_ADMIN_CORREO,
  contrasena: process.env.TEST_ADMIN_CONTRASENA,
};
const PUERTOS = { principal: 3101, limite: 3102, inactividad: 3103 };
const base = (p) => `http://127.0.0.1:${p}/api`;
const BASE = base(PUERTOS.principal);
const EJECUCION = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const correoUnico = (etiqueta) => `test-${EJECUCION}-${etiqueta}@distrigo.test`;
const CLAVE_BUENA = 'Clave1234';

const procesos = [];
const respuestas = []; // todos los cuerpos recibidos, para P40
let bd;
let inicio;

async function api(metodo, ruta, { token, cuerpo, crudo, url = BASE, cabeceras = {} } = {}) {
  const h = { ...cabeceras };
  if (token !== undefined) h.Authorization = `Bearer ${token}`;
  let body;
  if (crudo !== undefined) { body = crudo; h['Content-Type'] = 'application/json'; }
  else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); h['Content-Type'] = 'application/json'; }
  const r = await fetch(url + ruta, { method: metodo, headers: h, body });
  const texto = await r.text();
  respuestas.push(texto);
  let json = null;
  try { json = JSON.parse(texto); } catch { /* sin cuerpo JSON */ }
  return { estado: r.status, json, texto };
}

const login = (correo, contrasena, cliente, url) =>
  api('POST', '/auth/login', { cuerpo: { correo, contrasena, cliente }, url });

async function iniciarServidor(puerto, extra = {}) {
  const hijo = spawn(process.execPath, ['src/server.js'], {
    cwd: RAIZ,
    env: { ...process.env, PUERTO: String(puerto), HOST: '127.0.0.1', LOGIN_MAX_INTENTOS: '1000', ...extra },
    stdio: 'ignore',
  });
  procesos.push(hijo);
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base(puerto)}/salud`);
      if (r.status === 200) return;
    } catch { /* aun no arranca */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`El servidor de pruebas no arranco en el puerto ${puerto}`);
}

/** Crea un usuario via API (como admin) y devuelve sus datos. */
async function crearUsuario(tokenAdmin, etiqueta, rol = 'repartidor', contrasena = CLAVE_BUENA) {
  const correo = correoUnico(etiqueta);
  const r = await api('POST', '/usuarios', {
    token: tokenAdmin,
    cuerpo: { nombre: `Prueba ${etiqueta}`, correo, contrasena, rol },
  });
  assert.equal(r.estado, 201, r.texto);
  return { id: r.json.data.id, correo, contrasena, rol };
}

const clienteDe = (rol) => (rol === 'administrador' ? 'web' : 'movil');

async function sesionDe(usuario) {
  const r = await login(usuario.correo, usuario.contrasena, clienteDe(usuario.rol));
  assert.equal(r.estado, 200, r.texto);
  return r.json.data.token;
}

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('Modulo 1: autenticacion y usuarios', () => {
  let tokenAdmin;
  let adminId;
  let jtiAdmin;

  before(async () => {
    assert.ok(ADMIN.correo && ADMIN.contrasena, 'Faltan TEST_ADMIN_CORREO / TEST_ADMIN_CONTRASENA en .env');
    inicio = Date.now();
    bd = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USUARIO,
      password: process.env.DB_CONTRASENA,
      database: process.env.DB_NOMBRE || 'distrigo',
      timezone: 'Z',
    });
    await bd.query("SET time_zone='+00:00'");
    await iniciarServidor(PUERTOS.principal);
    const r = await login(ADMIN.correo, ADMIN.contrasena, 'web');
    assert.equal(r.estado, 200, 'No se pudo iniciar sesion con el admin de prueba: ' + r.texto);
    tokenAdmin = r.json.data.token;
    adminId = r.json.data.usuario.id;
    jtiAdmin = jwt.decode(tokenAdmin).jti;
  });

  after(async () => {
    try {
      await bd.query('DELETE FROM usuarios WHERE correo LIKE ?', [`test-${EJECUCION}-%@distrigo.test`]);
      await bd.query('DELETE FROM sesiones WHERE usuario_id = ? AND creada_en >= FROM_UNIXTIME(?)', [
        adminId, Math.floor(inicio / 1000) - 5,
      ]);
    } finally {
      await bd.end();
      for (const p of procesos) p.kill();
    }
  });

  test('P01 GET /salud responde 200', async () => {
    const r = await api('GET', '/salud');
    assert.equal(r.estado, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.data.bd, 'ok');
  });

  test('P02 crear-admin por segunda vez se niega', async () => {
    const r = spawnSync(process.execPath, ['scripts/crear-admin.js'], {
      cwd: RAIZ,
      env: {
        ...process.env,
        ADMIN_NOMBRE: 'Otro Admin',
        ADMIN_CORREO: correoUnico('segundo-admin'),
        ADMIN_CONTRASENA: CLAVE_BUENA,
      },
      encoding: 'utf8',
    });
    assert.notEqual(r.status, 0);
    const [[{ total }]] = await bd.query('SELECT COUNT(*) AS total FROM usuarios WHERE correo = ?', [correoUnico('segundo-admin')]);
    assert.equal(total, 0);
  });

  test('P03 el hash en la BD es bcrypt', async () => {
    const [[fila]] = await bd.query('SELECT contrasena_hash FROM usuarios WHERE id = ?', [adminId]);
    assert.match(fila.contrasena_hash, /^\$2[aby]\$/);
    assert.notEqual(fila.contrasena_hash, ADMIN.contrasena);
  });

  test('P04 login del admin por web crea sesion y ultimo_acceso', async () => {
    const r = await login(ADMIN.correo, ADMIN.contrasena, 'web');
    assert.equal(r.estado, 200);
    assert.equal(r.json.ok, true);
    assert.ok(r.json.data.token);
    assert.equal(r.json.data.usuario.rol, 'administrador');
    assert.equal(r.json.data.inactividad_minutos, 30);
    const jti = jwt.decode(r.json.data.token).jti;
    const [[sesion]] = await bd.query('SELECT id, cliente, cerrada_en FROM sesiones WHERE id = ?', [jti]);
    assert.equal(sesion.cliente, 'web');
    assert.equal(sesion.cerrada_en, null);
    const [[u]] = await bd.query('SELECT ultimo_acceso FROM usuarios WHERE id = ?', [adminId]);
    assert.ok(u.ultimo_acceso);
  });

  test('P05 y P06 contrasena mala y correo inexistente dan la misma respuesta', async () => {
    const mala = await login(ADMIN.correo, 'Incorrecta99', 'web');
    const inexistente = await login(correoUnico('no-existe'), 'Incorrecta99', 'web');
    assert.equal(mala.estado, 401);
    assert.equal(inexistente.estado, 401);
    assert.equal(mala.json.codigo, 'CREDENCIALES_INVALIDAS');
    assert.deepEqual(mala.json, inexistente.json);
  });

  test('P07 campos faltantes o cliente invalido dan 400', async () => {
    const casos = [
      {},
      { correo: ADMIN.correo, contrasena: ADMIN.contrasena },
      { correo: ADMIN.correo, contrasena: ADMIN.contrasena, cliente: 'escritorio' },
      { contrasena: ADMIN.contrasena, cliente: 'web' },
      { correo: ADMIN.correo, cliente: 'web' },
      { correo: 123, contrasena: ['x'], cliente: 'web' },
    ];
    for (const cuerpo of casos) {
      const r = await api('POST', '/auth/login', { cuerpo });
      assert.equal(r.estado, 400, JSON.stringify(cuerpo));
      assert.equal(r.json.codigo, 'VALIDACION');
    }
  });

  test('P08 correo en mayusculas o con espacios inicia sesion', async () => {
    const r = await login(`  ${ADMIN.correo.toUpperCase()}  `, ADMIN.contrasena, 'web');
    assert.equal(r.estado, 200, r.texto);
  });

  let repartidor;
  test('P09 el admin crea un repartidor con creado_por', async () => {
    repartidor = { correo: correoUnico('rep'), contrasena: CLAVE_BUENA, rol: 'repartidor' };
    const r = await api('POST', '/usuarios', {
      token: tokenAdmin,
      cuerpo: { nombre: '  Reparto Uno  ', correo: `  ${repartidor.correo.toUpperCase()} `, contrasena: CLAVE_BUENA, rol: 'repartidor' },
    });
    assert.equal(r.estado, 201, r.texto);
    assert.equal(r.json.data.creado_por, adminId);
    assert.equal(r.json.data.estado, 'activo');
    assert.equal(r.json.data.nombre, 'Reparto Uno');
    assert.equal(r.json.data.correo, repartidor.correo);
    assert.equal(r.json.data.contrasena_hash, undefined);
    repartidor.id = r.json.data.id;
  });

  test('P10 correo duplicado (otras mayusculas) da 409', async () => {
    const r = await api('POST', '/usuarios', {
      token: tokenAdmin,
      cuerpo: { nombre: 'Duplicado', correo: repartidor.correo.toUpperCase(), contrasena: CLAVE_BUENA, rol: 'repartidor' },
    });
    assert.equal(r.estado, 409);
    assert.equal(r.json.codigo, 'CORREO_DUPLICADO');
  });

  test('P11 datos invalidos dan 400 con errores[]', async () => {
    const valido = { nombre: 'Nombre Valido', correo: correoUnico('inv'), contrasena: CLAVE_BUENA, rol: 'repartidor' };
    const variantes = [
      ['rol', 'superusuario'],
      ['rol', undefined],
      ['contrasena', 'corta1'],
      ['contrasena', 'sololetrasaqui'],
      ['contrasena', '1234567890'],
      ['contrasena', `a1${'x'.repeat(80)}`],
      ['nombre', 'A'],
      ['nombre', 'N'.repeat(101)],
      ['correo', 'no-es-correo'],
      ['correo', `${'a'.repeat(150)}@distrigo.test`],
    ];
    for (const [campo, valor] of variantes) {
      const cuerpo = { ...valido, [campo]: valor };
      const r = await api('POST', '/usuarios', { token: tokenAdmin, cuerpo });
      assert.equal(r.estado, 400, `${campo}=${String(valor).slice(0, 20)}`);
      assert.ok(Array.isArray(r.json.errores) && r.json.errores.some((e) => e.campo === campo));
    }
    const [[{ total }]] = await bd.query('SELECT COUNT(*) AS total FROM usuarios WHERE correo = ?', [valido.correo]);
    assert.equal(total, 0);
  });

  test('P12 estado, contrasena_hash, id y creado_por son rechazados', async () => {
    for (const extra of [{ estado: 'inactivo' }, { contrasena_hash: 'x' }, { id: 99 }, { creado_por: 1 }]) {
      const correo = correoUnico('extra');
      const r = await api('POST', '/usuarios', {
        token: tokenAdmin,
        cuerpo: { nombre: 'Con Extra', correo, contrasena: CLAVE_BUENA, rol: 'repartidor', ...extra },
      });
      assert.equal(r.estado, 400);
      const [[{ total }]] = await bd.query('SELECT COUNT(*) AS total FROM usuarios WHERE correo = ?', [correo]);
      assert.equal(total, 0);
    }
  });

  let tokenRepartidor;
  test('P13 repartidor inicia sesion por movil', async () => {
    const r = await login(repartidor.correo, repartidor.contrasena, 'movil');
    assert.equal(r.estado, 200, r.texto);
    assert.equal(r.json.data.usuario.rol, 'repartidor');
    tokenRepartidor = r.json.data.token;
  });

  test('P14 repartidor por web da 403 CLIENTE_NO_PERMITIDO', async () => {
    const r = await login(repartidor.correo, repartidor.contrasena, 'web');
    assert.equal(r.estado, 403);
    assert.equal(r.json.codigo, 'CLIENTE_NO_PERMITIDO');
  });

  test('P15 admin por movil da 403 CLIENTE_NO_PERMITIDO', async () => {
    const r = await login(ADMIN.correo, ADMIN.contrasena, 'movil');
    assert.equal(r.estado, 403);
    assert.equal(r.json.codigo, 'CLIENTE_NO_PERMITIDO');
  });

  test('P16 sin Authorization da 401 TOKEN_AUSENTE', async () => {
    for (const [metodo, ruta] of [['GET', '/usuarios'], ['GET', '/auth/perfil'], ['POST', '/auth/logout']]) {
      const r = await api(metodo, ruta);
      assert.equal(r.estado, 401);
      assert.equal(r.json.codigo, 'TOKEN_AUSENTE');
    }
  });

  test('P17 token alterado, basura o vacio da 401 TOKEN_INVALIDO', async () => {
    const alterado = tokenAdmin.slice(0, -3) + (tokenAdmin.endsWith('aaa') ? 'bbb' : 'aaa');
    for (const token of [alterado, 'basura', 'a.b.c']) {
      const r = await api('GET', '/auth/perfil', { token });
      assert.equal(r.estado, 401, token);
      assert.equal(r.json.codigo, 'TOKEN_INVALIDO');
    }
    const vacio = await api('GET', '/auth/perfil', { cabeceras: { Authorization: 'Bearer ' } });
    assert.equal(vacio.estado, 401);
  });

  test('P18 token con otro secreto o alg none da 401', async () => {
    const carga = { rol: 'administrador', cli: 'web' };
    const opciones = { algorithm: 'HS256', subject: String(adminId), jwtid: jtiAdmin, expiresIn: 600 };
    const otroSecreto = jwt.sign(carga, 'otro-secreto-que-no-es-el-del-servidor-123456', opciones);
    const sinAlg = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ ...carga, sub: String(adminId), jti: jtiAdmin })}.`;
    for (const token of [otroSecreto, sinAlg]) {
      const r = await api('GET', '/usuarios', { token });
      assert.equal(r.estado, 401);
      assert.equal(r.json.codigo, 'TOKEN_INVALIDO');
    }
  });

  test('P19 repartidor no puede crear usuarios (403, sin fila nueva)', async () => {
    const correo = correoUnico('intruso');
    const r = await api('POST', '/usuarios', {
      token: tokenRepartidor,
      cuerpo: { nombre: 'Intruso', correo, contrasena: CLAVE_BUENA, rol: 'administrador' },
    });
    assert.equal(r.estado, 403);
    assert.equal(r.json.codigo, 'ACCESO_DENEGADO');
    const [[{ total }]] = await bd.query('SELECT COUNT(*) AS total FROM usuarios WHERE correo = ?', [correo]);
    assert.equal(total, 0);
  });

  test('P20 repartidor no puede listar, editar ni cambiar estado', async () => {
    const intentos = [
      ['GET', '/usuarios'],
      ['GET', `/usuarios/${adminId}`],
      ['PUT', `/usuarios/${adminId}`, { nombre: 'Hackeado' }],
      ['PATCH', `/usuarios/${adminId}/estado`, { estado: 'inactivo' }],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      const r = await api(metodo, ruta, { token: tokenRepartidor, cuerpo });
      assert.equal(r.estado, 403, `${metodo} ${ruta}`);
    }
    const [[a]] = await bd.query('SELECT nombre, estado FROM usuarios WHERE id = ?', [adminId]);
    assert.notEqual(a.nombre, 'Hackeado');
    assert.equal(a.estado, 'activo');
  });

  test('P21 repartidor puede ver su perfil', async () => {
    const r = await api('GET', '/auth/perfil', { token: tokenRepartidor });
    assert.equal(r.estado, 200);
    assert.equal(r.json.data.correo, repartidor.correo);
    assert.equal(r.json.data.contrasena_hash, undefined);
  });

  test('P22 no existe registro publico', async () => {
    const r = await api('POST', '/auth/registro', {
      cuerpo: { nombre: 'X Y', correo: correoUnico('reg'), contrasena: CLAVE_BUENA, rol: 'administrador' },
    });
    assert.equal(r.estado, 404);
  });

  test('P23 filtros de la lista', async () => {
    const porRol = await api('GET', '/usuarios?rol=repartidor', { token: tokenAdmin });
    assert.equal(porRol.estado, 200);
    assert.ok(porRol.json.data.length >= 1);
    assert.ok(porRol.json.data.every((u) => u.rol === 'repartidor'));

    const porEstado = await api('GET', '/usuarios?estado=activo', { token: tokenAdmin });
    assert.ok(porEstado.json.data.every((u) => u.estado === 'activo'));

    const buscar = await api('GET', `/usuarios?buscar=${encodeURIComponent('Reparto Uno')}`, { token: tokenAdmin });
    assert.ok(buscar.json.data.some((u) => u.id === repartidor.id));

    const orden = await api('GET', '/usuarios', { token: tokenAdmin });
    const nombres = orden.json.data.map((u) => u.nombre);
    for (let i = 1; i < nombres.length; i++) {
      assert.ok(nombres[i - 1].toLowerCase() <= nombres[i].toLowerCase(), 'la lista debe venir ordenada por nombre');
    }

    for (const q of ['rol=otro', 'estado=zzz', `buscar=${'x'.repeat(101)}`]) {
      const r = await api('GET', `/usuarios?${q}`, { token: tokenAdmin });
      assert.equal(r.estado, 400, q);
    }
  });

  test('P24 id inexistente da 404 e id invalido da 400', async () => {
    const r404 = await api('GET', '/usuarios/999999', { token: tokenAdmin });
    assert.equal(r404.estado, 404);
    for (const id of ['abc', '0', '-1', '1.5']) {
      const r = await api('GET', `/usuarios/${id}`, { token: tokenAdmin });
      assert.equal(r.estado, 400, id);
    }
  });

  test('P25 editar nombre y correo', async () => {
    const nuevoCorreo = correoUnico('rep-editado');
    const r = await api('PUT', `/usuarios/${repartidor.id}`, {
      token: tokenAdmin,
      cuerpo: { nombre: 'Reparto Editado', correo: nuevoCorreo.toUpperCase() },
    });
    assert.equal(r.estado, 200, r.texto);
    assert.equal(r.json.data.nombre, 'Reparto Editado');
    assert.equal(r.json.data.correo, nuevoCorreo);
    repartidor.correo = nuevoCorreo;

    const vacio = await api('PUT', `/usuarios/${repartidor.id}`, { token: tokenAdmin, cuerpo: {} });
    assert.equal(vacio.estado, 400);
    const inexistente = await api('PUT', '/usuarios/999999', { token: tokenAdmin, cuerpo: { nombre: 'Nadie Mas' } });
    assert.equal(inexistente.estado, 404);
    const dup = await api('PUT', `/usuarios/${repartidor.id}`, { token: tokenAdmin, cuerpo: { correo: ADMIN.correo } });
    assert.equal(dup.estado, 409);
  });

  test('P26 cambiar contrasena cierra sesiones y la clave vieja deja de servir', async () => {
    const u = await crearUsuario(tokenAdmin, 'cambio-clave');
    const viejo = await sesionDe(u);
    const nueva = 'NuevaClave789';
    const r = await api('PUT', `/usuarios/${u.id}`, { token: tokenAdmin, cuerpo: { contrasena: nueva } });
    assert.equal(r.estado, 200, r.texto);
    assert.equal((await api('GET', '/auth/perfil', { token: viejo })).estado, 401);
    assert.equal((await login(u.correo, u.contrasena, 'movil')).estado, 401);
    assert.equal((await login(u.correo, nueva, 'movil')).estado, 200);
    const [[s]] = await bd.query('SELECT motivo_cierre FROM sesiones WHERE id = ?', [jwt.decode(viejo).jti]);
    assert.equal(s.motivo_cierre, 'cambio_credenciales');
  });

  test('P27 y P28 desactivar y reactivar', async () => {
    const u = await crearUsuario(tokenAdmin, 'desactivar');
    const token = await sesionDe(u);
    const d = await api('PATCH', `/usuarios/${u.id}/estado`, { token: tokenAdmin, cuerpo: { estado: 'inactivo' } });
    assert.equal(d.estado, 200, d.texto);
    assert.equal(d.json.data.estado, 'inactivo');

    const viejo = await api('GET', '/auth/perfil', { token });
    assert.equal(viejo.estado, 401);
    const intento = await login(u.correo, u.contrasena, 'movil');
    assert.equal(intento.estado, 403);
    assert.equal(intento.json.codigo, 'USUARIO_INACTIVO');
    assert.equal(intento.json.mensaje, 'Usuario desactivado. Contacte al administrador.');
    const [[s]] = await bd.query('SELECT motivo_cierre FROM sesiones WHERE id = ?', [jwt.decode(token).jti]);
    assert.equal(s.motivo_cierre, 'desactivado');
    // Con contrasena incorrecta no se revela que esta desactivado.
    assert.equal((await login(u.correo, 'Incorrecta99', 'movil')).json.codigo, 'CREDENCIALES_INVALIDAS');

    const a = await api('PATCH', `/usuarios/${u.id}/estado`, { token: tokenAdmin, cuerpo: { estado: 'activo' } });
    assert.equal(a.estado, 200);
    assert.equal((await login(u.correo, u.contrasena, 'movil')).estado, 200);

    const mal = await api('PATCH', `/usuarios/${u.id}/estado`, { token: tokenAdmin, cuerpo: { estado: 'borrado' } });
    assert.equal(mal.estado, 400);
  });

  test('P29 el admin no puede desactivarse ni cambiar su propio rol', async () => {
    const a = await api('PATCH', `/usuarios/${adminId}/estado`, { token: tokenAdmin, cuerpo: { estado: 'inactivo' } });
    assert.equal(a.estado, 409);
    const b = await api('PUT', `/usuarios/${adminId}`, { token: tokenAdmin, cuerpo: { rol: 'repartidor' } });
    assert.equal(b.estado, 409);
    const [[fila]] = await bd.query('SELECT rol, estado FROM usuarios WHERE id = ?', [adminId]);
    assert.equal(fila.rol, 'administrador');
    assert.equal(fila.estado, 'activo');
  });

  test('P30 cambiar el rol de otro usuario cierra sus sesiones', async () => {
    const u = await crearUsuario(tokenAdmin, 'cambio-rol');
    const token = await sesionDe(u);
    const r = await api('PUT', `/usuarios/${u.id}`, { token: tokenAdmin, cuerpo: { rol: 'administrador' } });
    assert.equal(r.estado, 200, r.texto);
    assert.equal((await api('GET', '/auth/perfil', { token })).estado, 401);
    const [[s]] = await bd.query('SELECT motivo_cierre FROM sesiones WHERE id = ?', [jwt.decode(token).jti]);
    assert.equal(s.motivo_cierre, 'cambio_credenciales');
  });

  test('P30b PUT y PATCH con campos extra dan 400', async () => {
    const u = await crearUsuario(tokenAdmin, 'campos-extra');
    const put = await api('PUT', `/usuarios/${u.id}`, { token: tokenAdmin, cuerpo: { nombre: 'Nombre Valido', estado: 'inactivo' } });
    assert.equal(put.estado, 400);
    assert.equal(put.json.codigo, 'VALIDACION');
    assert.ok(put.json.errores.some((e) => e.campo === 'estado'));
    const patch = await api('PATCH', `/usuarios/${u.id}/estado`, { token: tokenAdmin, cuerpo: { estado: 'inactivo', rol: 'administrador' } });
    assert.equal(patch.estado, 400);
    assert.equal(patch.json.codigo, 'VALIDACION');
    assert.ok(patch.json.errores.some((e) => e.campo === 'rol'));
    const [[fila]] = await bd.query('SELECT nombre, rol, estado FROM usuarios WHERE id = ?', [u.id]);
    assert.equal(fila.estado, 'activo');
    assert.equal(fila.rol, 'repartidor');
    assert.notEqual(fila.nombre, 'Nombre Valido');
  });

  test('P30c un admin que cambia su propia contrasena conserva su sesion y cierra las demas', async () => {
    const otroAdmin = await crearUsuario(tokenAdmin, 'admin-propio', 'administrador');
    const actual = await sesionDe(otroAdmin);
    const otra = await sesionDe(otroAdmin);
    const nueva = 'NuevaClave789';
    const r = await api('PUT', `/usuarios/${otroAdmin.id}`, { token: actual, cuerpo: { contrasena: nueva } });
    assert.equal(r.estado, 200, r.texto);
    assert.equal((await api('GET', '/auth/perfil', { token: actual })).estado, 200);
    const cerrada = await api('GET', '/auth/perfil', { token: otra });
    assert.equal(cerrada.estado, 401);
    assert.equal(cerrada.json.codigo, 'SESION_CERRADA');
    const [[s]] = await bd.query('SELECT motivo_cierre FROM sesiones WHERE id = ?', [jwt.decode(otra).jti]);
    assert.equal(s.motivo_cierre, 'cambio_credenciales');
    const [[a]] = await bd.query('SELECT cerrada_en FROM sesiones WHERE id = ?', [jwt.decode(actual).jti]);
    assert.equal(a.cerrada_en, null);
  });

  test('P30d sesion con expira_en vencido da 401 SESION_EXPIRADA y motivo expirada', async () => {
    const r0 = await login(ADMIN.correo, ADMIN.contrasena, 'web');
    const token = r0.json.data.token;
    const jti = jwt.decode(token).jti;
    assert.equal((await api('GET', '/auth/perfil', { token })).estado, 200);
    await bd.query('UPDATE sesiones SET expira_en = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE id = ?', [jti]);
    const r = await api('GET', '/auth/perfil', { token });
    assert.equal(r.estado, 401);
    assert.equal(r.json.codigo, 'SESION_EXPIRADA');
    const [[s]] = await bd.query('SELECT motivo_cierre FROM sesiones WHERE id = ?', [jti]);
    assert.equal(s.motivo_cierre, 'expirada');
  });

  test('P31logout y reutilizar el token da 401 SESION_CERRADA', async () => {
    const r0 = await login(ADMIN.correo, ADMIN.contrasena, 'web');
    const token = r0.json.data.token;
    const out = await api('POST', '/auth/logout', { token });
    assert.equal(out.estado, 200);
    const r = await api('GET', '/auth/perfil', { token });
    assert.equal(r.estado, 401);
    assert.equal(r.json.codigo, 'SESION_CERRADA');
    const [[s]] = await bd.query('SELECT motivo_cierre FROM sesiones WHERE id = ?', [jwt.decode(token).jti]);
    assert.equal(s.motivo_cierre, 'logout');
  });

  test('P32 y P33 inactividad de 31 minutos expira; actividad normal no', async () => {
    const r0 = await login(ADMIN.correo, ADMIN.contrasena, 'web');
    const token = r0.json.data.token;
    const jti = jwt.decode(token).jti;
    assert.equal((await api('GET', '/auth/perfil', { token })).estado, 200);
    assert.equal((await api('GET', '/auth/perfil', { token })).estado, 200);
    // 29 min de inactividad: sigue vigente (y la actividad se renueva).
    await bd.query('UPDATE sesiones SET ultima_actividad = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 29 MINUTE) WHERE id = ?', [jti]);
    assert.equal((await api('GET', '/auth/perfil', { token })).estado, 200);
    // 31 min de inactividad: expira.
    await bd.query('UPDATE sesiones SET ultima_actividad = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 31 MINUTE) WHERE id = ?', [jti]);
    const r = await api('GET', '/auth/perfil', { token });
    assert.equal(r.estado, 401);
    assert.equal(r.json.codigo, 'SESION_EXPIRADA');
    const [[s]] = await bd.query('SELECT motivo_cierre FROM sesiones WHERE id = ?', [jti]);
    assert.equal(s.motivo_cierre, 'inactividad');
  });

  test('P34 el limite de inactividad es configurable (1 minuto)', async () => {
    await iniciarServidor(PUERTOS.inactividad, { SESION_INACTIVIDAD_MINUTOS: '1' });
    const url = base(PUERTOS.inactividad);
    const r0 = await login(ADMIN.correo, ADMIN.contrasena, 'web', url);
    assert.equal(r0.estado, 200);
    assert.equal(r0.json.data.inactividad_minutos, 1);
    const token = r0.json.data.token;
    assert.equal((await api('GET', '/auth/perfil', { token, url })).estado, 200);
    await bd.query(
      'UPDATE sesiones SET ultima_actividad = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE) WHERE id = ?',
      [jwt.decode(token).jti]
    );
    const r = await api('GET', '/auth/perfil', { token, url });
    assert.equal(r.estado, 401);
    assert.equal(r.json.codigo, 'SESION_EXPIRADA');
  });

  test('P36 inyeccion SQL en login y en buscar no produce bypass ni 500', async () => {
    const cargas = ["' OR '1'='1", "admin' --", "x@y.co'--", "' OR 1=1 --", '"; DROP TABLE usuarios; --'];
    for (const c of cargas) {
      const a = await login(c, c, 'web');
      assert.ok([400, 401].includes(a.estado), `correo ${c} -> ${a.estado}`);
      const b = await login(ADMIN.correo, c, 'web');
      assert.equal(b.estado, 401, `contrasena ${c}`);
      const d = await login(`${c}@distrigo.test`, c, 'web');
      assert.ok([400, 401].includes(d.estado));
    }
    for (const c of ["' OR 1=1 --", "x' UNION SELECT 1,2,3,4,5,6,7,8,9 --", '%', '_']) {
      const r = await api('GET', `/usuarios?buscar=${encodeURIComponent(c)}`, { token: tokenAdmin });
      assert.equal(r.estado, 200, c);
      assert.equal(r.json.data.length, 0, `buscar ${c} no debe devolver filas`);
    }
    const [[{ total }]] = await bd.query('SELECT COUNT(*) AS total FROM usuarios');
    assert.ok(total >= 1);
  });

  test('P37 JSON mal formado da 400 JSON_INVALIDO', async () => {
    const r = await api('POST', '/auth/login', { crudo: '{"correo": ' });
    assert.equal(r.estado, 400);
    assert.equal(r.json.codigo, 'JSON_INVALIDO');
    assert.ok(!r.texto.includes('at '), 'no debe filtrar stack');
  });

  test('P39 .env esta ignorado por git', () => {
    const r = spawnSync('git', ['check-ignore', '-q', '.env'], { cwd: RAIZ });
    assert.equal(r.status, 0);
    const ej = spawnSync('git', ['check-ignore', '-q', '.env.example'], { cwd: RAIZ });
    assert.equal(ej.status, 1, '.env.example no debe estar ignorado');
  });

  test('P35 demasiados logins fallidos dan 429 (instancia con limite 5)', async () => {
    await iniciarServidor(PUERTOS.limite, { LOGIN_MAX_INTENTOS: '5' });
    const url = base(PUERTOS.limite);
    for (let i = 0; i < 5; i++) {
      const r = await login(ADMIN.correo, 'Incorrecta99', 'web', url);
      assert.equal(r.estado, 401);
    }
    const bloqueado = await login(ADMIN.correo, 'Incorrecta99', 'web', url);
    assert.equal(bloqueado.estado, 429);
    assert.equal(bloqueado.json.codigo, 'DEMASIADOS_INTENTOS');
  });

  test('P40 ninguna respuesta incluye hash ni contrasenas', () => {
    assert.ok(respuestas.length > 50);
    const prohibidos = [
      '"contrasena_hash":', '$2a$', '$2b$', '$2y$',
      ADMIN.contrasena, CLAVE_BUENA, 'NuevaClave789',
    ];
    for (const texto of respuestas) {
      for (const p of prohibidos) {
        assert.ok(!texto.includes(p), `La respuesta contiene "${p === ADMIN.contrasena ? '[contrasena admin]' : p}"`);
      }
    }
  });
});
