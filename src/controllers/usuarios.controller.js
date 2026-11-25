'use strict';
const HttpError = require('../utils/HttpError');
const { hashear } = require('../utils/password');
const V = require('../utils/validaciones');
const Usuario = require('../models/usuario.model');
const Sesion = require('../models/sesion.model');

function cuerpoObjeto(req) {
  const cuerpo = req.body ?? {};
  if (!V.esObjeto(cuerpo)) throw new HttpError(400, 'VALIDACION', 'El cuerpo debe ser un objeto JSON.');
  return cuerpo;
}

function idDeRuta(req) {
  const id = V.parsearId(req.params.id);
  if (id === null) {
    throw new HttpError(400, 'VALIDACION', 'El id debe ser un entero positivo.', [
      { campo: 'id', mensaje: 'El id debe ser un entero positivo.' },
    ]);
  }
  return id;
}

const esDuplicado = (err) => err && err.code === 'ER_DUP_ENTRY';
const correoDuplicado = () => new HttpError(409, 'CORREO_DUPLICADO', 'Ya existe un usuario con ese correo.');

async function obtenerOFallar(id) {
  const usuario = await Usuario.buscarPorId(id);
  if (!usuario) throw new HttpError(404, 'USUARIO_NO_ENCONTRADO', 'Usuario no encontrado.');
  return usuario;
}

async function listar(req, res) {
  const errores = [];
  const filtros = {};
  const { rol, estado, buscar } = req.query;
  if (rol !== undefined) {
    const r = V.validarRol(rol);
    if (r.error) errores.push({ campo: 'rol', mensaje: r.error }); else filtros.rol = r.valor;
  }
  if (estado !== undefined) {
    const r = V.validarEstado(estado);
    if (r.error) errores.push({ campo: 'estado', mensaje: r.error }); else filtros.estado = r.valor;
  }
  if (buscar !== undefined) {
    if (typeof buscar !== 'string' || buscar.length > 100) {
      errores.push({ campo: 'buscar', mensaje: 'El texto de busqueda debe tener maximo 100 caracteres.' });
    } else if (buscar.trim() !== '') {
      filtros.buscar = buscar.trim();
    }
  }
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  res.json({ ok: true, data: await Usuario.listar(filtros) });
}

async function obtener(req, res) {
  res.json({ ok: true, data: await obtenerOFallar(idDeRuta(req)) });
}

async function crear(req, res) {
  const { datos, errores } = V.validarCamposUsuario(cuerpoObjeto(req), { parcial: false });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de usuario invalidos.', errores);

  let id;
  try {
    id = await Usuario.crear({
      nombre: datos.nombre,
      correo: datos.correo,
      contrasenaHash: await hashear(datos.contrasena),
      rol: datos.rol,
      creadoPor: req.usuario.id,
    });
  } catch (err) {
    if (esDuplicado(err)) throw correoDuplicado();
    throw err;
  }
  res.status(201).json({ ok: true, data: await Usuario.buscarPorId(id) });
}

async function actualizar(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCamposUsuario(cuerpoObjeto(req), { parcial: true });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de usuario invalidos.', errores);

  const actual = await obtenerOFallar(id);
  const esUnoMismo = id === req.usuario.id;
  const cambiaRol = datos.rol !== undefined && datos.rol !== actual.rol;
  if (esUnoMismo && cambiaRol) {
    throw new HttpError(409, 'OPERACION_NO_PERMITIDA', 'Un administrador no puede cambiar su propio rol.');
  }

  try {
    await Usuario.actualizar(id, {
      nombre: datos.nombre,
      correo: datos.correo,
      rol: datos.rol,
      contrasenaHash: datos.contrasena !== undefined ? await hashear(datos.contrasena) : undefined,
    });
  } catch (err) {
    if (esDuplicado(err)) throw correoDuplicado();
    throw err;
  }

  if (esUnoMismo) {
    // Cambio de la propia contrasena: se cierran las demas sesiones y la actual sigue valida.
    if (datos.contrasena !== undefined) await Sesion.cerrarTodasDeUsuario(id, 'cambio_credenciales', req.sesion.id);
  } else if (cambiaRol || datos.contrasena !== undefined) {
    await Sesion.cerrarTodasDeUsuario(id, 'cambio_credenciales');
  }
  res.json({ ok: true, data: await Usuario.buscarPorId(id) });
}

async function cambiarEstado(req, res) {
  const id = idDeRuta(req);
  const cuerpo = cuerpoObjeto(req);
  const extra = Object.keys(cuerpo).filter((c) => c !== 'estado').map((c) => ({ campo: c, mensaje: 'Campo no permitido.' }));
  const r = V.validarEstado(cuerpo.estado);
  const errores = [...extra];
  if (r.error) errores.push({ campo: 'estado', mensaje: r.error });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos invalidos.', errores);

  await obtenerOFallar(id);
  if (id === req.usuario.id && r.valor === 'inactivo') {
    throw new HttpError(409, 'OPERACION_NO_PERMITIDA', 'No puede desactivar su propia cuenta.');
  }
  await Usuario.cambiarEstado(id, r.valor);
  if (r.valor === 'inactivo') await Sesion.cerrarTodasDeUsuario(id, 'desactivado');
  res.json({ ok: true, data: await Usuario.buscarPorId(id) });
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
