'use strict';
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../utils/HttpError');
const { comparar, HASH_FICTICIO } = require('../utils/password');
const { esObjeto, validarCorreo, validarCliente } = require('../utils/validaciones');
const Usuario = require('../models/usuario.model');
const Sesion = require('../models/sesion.model');

const ROL_POR_CLIENTE = { web: 'administrador', movil: 'repartidor' };

async function login(req, res) {
  const cuerpo = req.body ?? {};
  if (!esObjeto(cuerpo)) throw new HttpError(400, 'VALIDACION', 'El cuerpo debe ser un objeto JSON.');

  const errores = [];
  const rCorreo = validarCorreo(cuerpo.correo);
  if (rCorreo.error) errores.push({ campo: 'correo', mensaje: rCorreo.error });
  if (typeof cuerpo.contrasena !== 'string' || cuerpo.contrasena === '') {
    errores.push({ campo: 'contrasena', mensaje: 'La contrasena es obligatoria.' });
  } else if (cuerpo.contrasena.length > 1000) {
    errores.push({ campo: 'contrasena', mensaje: 'La contrasena es demasiado larga.' });
  }
  const rCliente = validarCliente(cuerpo.cliente);
  if (rCliente.error) errores.push({ campo: 'cliente', mensaje: rCliente.error });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de inicio de sesion invalidos.', errores);

  const usuario = await Usuario.buscarPorCorreoConHash(rCorreo.valor);
  // Siempre se compara (contra un hash ficticio si no existe) para no revelar si el correo existe.
  const coincide = await comparar(cuerpo.contrasena, usuario ? usuario.contrasena_hash : HASH_FICTICIO);
  if (!usuario || !coincide) {
    throw new HttpError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contrasena incorrectos');
  }
  if (usuario.estado !== 'activo') {
    throw new HttpError(403, 'USUARIO_INACTIVO', 'Usuario desactivado. Contacte al administrador.');
  }
  if (ROL_POR_CLIENTE[rCliente.valor] !== usuario.rol) {
    const donde = usuario.rol === 'administrador' ? 'el panel web' : 'la aplicacion movil';
    throw new HttpError(403, 'CLIENTE_NO_PERMITIDO', `Su rol solo puede ingresar desde ${donde}.`);
  }

  const jti = crypto.randomUUID();
  await Sesion.crear({
    id: jti,
    usuarioId: usuario.id,
    cliente: rCliente.valor,
    expiraSegundos: env.jwt.expiraSegundos,
    ip: req.ip,
  });
  const token = jwt.sign(
    { rol: usuario.rol, cli: rCliente.valor },
    env.jwt.secreto,
    { algorithm: 'HS256', subject: String(usuario.id), jwtid: jti, expiresIn: env.jwt.expiraSegundos }
  );
  await Usuario.registrarAcceso(usuario.id);

  res.json({
    ok: true,
    data: {
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
      inactividad_minutos: env.sesionInactividadMinutos,
    },
  });
}

async function logout(req, res) {
  await Sesion.cerrar(req.sesion.id, 'logout');
  res.json({ ok: true, data: { mensaje: 'Sesion cerrada correctamente.' } });
}

async function perfil(req, res) {
  const usuario = await Usuario.buscarPorId(req.usuario.id);
  res.json({ ok: true, data: usuario });
}

module.exports = { login, logout, perfil };
