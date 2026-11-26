'use strict';
// Validadores puros del Modulo 3 (sin acceso a BD).
const I = require('./validacionesInventario');
const { normalizarTelefono } = require('./telefono');
const { validarCampos } = I;
// validarCampos ya existe en validacionesInventario (se reutiliza).
const MAX_LIMITE = 99999999.99;

function validarLimite(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return { error: 'El limite de credito debe ser un numero.' };
  if (valor < 0) return { error: 'El limite de credito no puede ser negativo.' };
  if (valor > MAX_LIMITE) return { error: 'El limite de credito no puede superar 99999999.99.' };
  if (Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-6) return { error: 'El limite de credito admite como maximo 2 decimales.' };
  return { valor };
}

/** ruta_id: entero positivo o null. */
function validarRutaId(valor) {
  if (valor === null) return { valor: null };
  return I.validarIdFK(valor, 'La ruta');
}

const validarNombreRuta = (v) => I.texto(v, { min: 2, max: 80, etiqueta: 'El nombre de la ruta' });
const validarDescripcion = (v) => I.textoOpcional(v, { max: 255, etiqueta: 'La descripcion' });

const validarCamposRuta = (cuerpo, { parcial }) => validarCampos(cuerpo, {
  nombre: validarNombreRuta, descripcion: validarDescripcion,
}, { parcial, requeridos: ['nombre'] });

const validarCamposCliente = (cuerpo, { parcial }) => validarCampos(cuerpo, {
  nombre: (v) => I.texto(v, { min: 2, max: 120, etiqueta: 'El nombre de la tienda' }),
  contacto: (v) => I.texto(v, { min: 2, max: 100, etiqueta: 'El contacto' }),
  telefono: normalizarTelefono,
  direccion: (v) => I.texto(v, { min: 5, max: 255, etiqueta: 'La direccion' }),
  ruta_id: validarRutaId,
  limite_credito: validarLimite,
}, { parcial, requeridos: ['nombre', 'contacto', 'telefono', 'direccion', 'limite_credito'] });

function filtrosRutas(q) {
  const errores = []; const f = {};
  I.filtroEstado(q.estado, errores, f); I.filtroBuscar(q.buscar, errores, f);
  return { filtros: f, errores };
}

function filtrosClientes(q) {
  const errores = []; const f = {};
  I.filtroEstado(q.estado, errores, f); I.filtroBuscar(q.buscar, errores, f);
  I.filtroId(q.ruta_id, 'ruta_id', errores, f);
  I.filtroBooleano(q.sin_ruta, 'sin_ruta', errores, f);
  if (f.ruta_id !== undefined && f.sin_ruta === true) {
    errores.push({ campo: 'sin_ruta', mensaje: 'No se pueden combinar ruta_id y sin_ruta.' });
  }
  return { filtros: f, errores };
}

function filtrosCompras(q) {
  const errores = []; const f = {};
  I.filtroFecha(q.desde, 'desde', errores, f);
  I.filtroFecha(q.hasta, 'hasta', errores, f);
  if (f.desde && f.hasta && f.desde > f.hasta) errores.push({ campo: 'desde', mensaje: 'desde no puede ser posterior a hasta.' });
  I.filtroEntero(q.pagina, 'pagina', { min: 1, max: 1000000 }, errores, f);
  I.filtroEntero(q.limite, 'limite', { min: 1, max: 100 }, errores, f);
  return { filtros: f, errores };
}

module.exports = { validarCamposRuta, validarCamposCliente, filtrosRutas, filtrosClientes, filtrosCompras, validarLimite };
