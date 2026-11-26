'use strict';
const HttpError = require('../utils/HttpError');
const { cuerpoObjeto, idDeRuta, esDuplicado } = require('../utils/peticion');
const V = require('../utils/validacionesClientes');
const { validarCuerpoEstado } = require('../utils/validacionesInventario');
const Cliente = require('../models/cliente.model');
const Ruta = require('../models/ruta.model');
const servicio = require('../services/clientes.service');

const duplicado = () => new HttpError(409, 'CLIENTE_DUPLICADO', 'Ya existe una tienda con ese nombre.');

async function obtenerOFallar(id) {
  const c = await Cliente.buscarPorId(id);
  if (!c) throw new HttpError(404, 'CLIENTE_NO_ENCONTRADO', 'Tienda no encontrada.');
  return c;
}

async function comprobarRuta(rutaId) {
  const ruta = await Ruta.buscarPorId(rutaId);
  if (!ruta) throw new HttpError(404, 'RUTA_NO_ENCONTRADA', 'Ruta no encontrada.');
  if (ruta.estado !== 'activo') throw new HttpError(409, 'RUTA_INACTIVA', 'La ruta esta inactiva y no se puede asignar.');
}

const respuesta = async (id) => servicio.adjuntarCredito(await obtenerOFallar(id));

async function listar(req, res) {
  const { filtros, errores } = V.filtrosClientes(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  res.json({ ok: true, data: await servicio.adjuntarCredito(await Cliente.listar(filtros)) });
}

async function obtener(req, res) {
  res.json({ ok: true, data: await respuesta(idDeRuta(req)) });
}

async function crear(req, res) {
  const { datos, errores } = V.validarCamposCliente(cuerpoObjeto(req), { parcial: false });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de tienda invalidos.', errores);
  if (datos.ruta_id !== undefined && datos.ruta_id !== null) await comprobarRuta(datos.ruta_id);
  if (await Cliente.buscarDuplicado(datos.nombre)) throw duplicado();
  let id;
  try {
    id = await Cliente.crear({
      nombre: datos.nombre,
      contacto: datos.contacto,
      telefono: datos.telefono,
      direccion: datos.direccion,
      rutaId: datos.ruta_id ?? null,
      limiteCredito: datos.limite_credito,
      creadoPor: req.usuario.id,
    });
  } catch (err) {
    if (esDuplicado(err)) throw duplicado();
    throw err;
  }
  res.status(201).json({ ok: true, data: await respuesta(id) });
}

async function actualizar(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = V.validarCamposCliente(cuerpoObjeto(req), { parcial: true });
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de tienda invalidos.', errores);
  const actual = await obtenerOFallar(id);
  // Una ruta ya inactiva no bloquea otros cambios: solo se valida si la ruta cambia.
  if (datos.ruta_id !== undefined && datos.ruta_id !== null && datos.ruta_id !== actual.ruta_id) {
    await comprobarRuta(datos.ruta_id);
  }
  if (datos.nombre !== undefined && (await Cliente.buscarDuplicado(datos.nombre, id))) throw duplicado();
  try {
    await Cliente.actualizar(id, datos);
  } catch (err) {
    if (esDuplicado(err)) throw duplicado();
    throw err;
  }
  res.json({ ok: true, data: await respuesta(id) });
}

async function cambiarEstado(req, res) {
  const id = idDeRuta(req);
  const { datos, errores } = validarCuerpoEstado(cuerpoObjeto(req));
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos invalidos.', errores);
  await obtenerOFallar(id);
  await Cliente.cambiarEstado(id, datos.estado);
  res.json({ ok: true, data: await respuesta(id) });
}

async function compras(req, res) {
  const id = idDeRuta(req);
  const { filtros, errores } = V.filtrosCompras(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  await obtenerOFallar(id);
  res.json({ ok: true, data: await servicio.historialCompras(null, id, filtros) });
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, compras };
