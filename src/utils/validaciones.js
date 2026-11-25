'use strict';

const ROLES = ['administrador', 'repartidor'];
const ESTADOS = ['activo', 'inactivo'];
const CLIENTES = ['web', 'movil'];
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validarNombre(valor) {
  if (typeof valor !== 'string') return { error: 'El nombre es obligatorio.' };
  const nombre = valor.trim();
  if (nombre.length < 2 || nombre.length > 100) return { error: 'El nombre debe tener entre 2 y 100 caracteres.' };
  return { valor: nombre };
}

function validarCorreo(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') return { error: 'El correo es obligatorio.' };
  const correo = valor.trim().toLowerCase();
  if (correo.length > 150) return { error: 'El correo no puede superar 150 caracteres.' };
  if (!REGEX_CORREO.test(correo)) return { error: 'El correo no tiene un formato valido.' };
  return { valor: correo };
}

function validarContrasena(valor) {
  if (typeof valor !== 'string' || valor === '') return { error: 'La contrasena es obligatoria.' };
  const bytes = Buffer.byteLength(valor, 'utf8');
  if (bytes < 8 || bytes > 72) return { error: 'La contrasena debe tener entre 8 y 72 bytes (los caracteres con tilde o especiales ocupan mas de uno).' };
  if (!/[A-Za-z]/.test(valor) || !/[0-9]/.test(valor)) {
    return { error: 'La contrasena debe contener al menos una letra y un numero.' };
  }
  return { valor };
}

function validarRol(valor) {
  if (typeof valor !== 'string' || !ROLES.includes(valor)) {
    return { error: `El rol debe ser uno de: ${ROLES.join(', ')}.` };
  }
  return { valor };
}

function validarEstado(valor) {
  if (typeof valor !== 'string' || !ESTADOS.includes(valor)) {
    return { error: `El estado debe ser uno de: ${ESTADOS.join(', ')}.` };
  }
  return { valor };
}

function validarCliente(valor) {
  if (typeof valor !== 'string' || !CLIENTES.includes(valor)) {
    return { error: `El cliente debe ser uno de: ${CLIENTES.join(', ')}.` };
  }
  return { valor };
}

/** Devuelve el id como numero o null si no es un entero positivo valido. */
function parsearId(texto) {
  if (typeof texto !== 'string' || !/^[1-9]\d{0,9}$/.test(texto)) return null;
  const n = Number(texto);
  return n <= 4294967295 ? n : null;
}

const VALIDADORES = {
  nombre: validarNombre,
  correo: validarCorreo,
  contrasena: validarContrasena,
  rol: validarRol,
};

/**
 * Valida los campos de usuario. Solo se aceptan nombre, correo, contrasena y rol.
 * parcial=true: todos opcionales (PUT), pero debe venir al menos uno.
 * Devuelve { datos, errores }.
 */
function validarCamposUsuario(cuerpo, { parcial }) {
  const errores = [];
  const datos = {};
  for (const campo of Object.keys(cuerpo)) {
    if (!VALIDADORES[campo]) errores.push({ campo, mensaje: 'Campo no permitido.' });
  }
  for (const [campo, validar] of Object.entries(VALIDADORES)) {
    if (parcial && cuerpo[campo] === undefined) continue;
    const r = validar(cuerpo[campo]);
    if (r.error) errores.push({ campo, mensaje: r.error });
    else datos[campo] = r.valor;
  }
  if (parcial && errores.length === 0 && Object.keys(datos).length === 0) {
    errores.push({ campo: 'cuerpo', mensaje: 'Debe enviar al menos un campo a modificar.' });
  }
  return { datos, errores };
}

module.exports = {
  ROLES, ESTADOS, CLIENTES, esObjeto,
  validarNombre, validarCorreo, validarContrasena, validarRol, validarEstado, validarCliente,
  parsearId, validarCamposUsuario,
};
