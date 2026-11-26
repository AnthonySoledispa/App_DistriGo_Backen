'use strict';
// Validadores puros del Modulo 2 (sin acceso a BD). Cada uno devuelve { valor } o { error }.
const { ESTADOS } = require('./validaciones');
const { validarFechaISO, hoyNegocio } = require('./fechas');

const MAX_CANTIDAD = 999999999.999;
const MAX_PRECIO = 99999999.99;
const REGEX_SKU = /^[A-Za-z0-9._-]{1,50}$/;
const MOTIVOS_DISMINUCION = ['danio', 'perdida', 'merma', 'caducidad', 'correccion', 'otro'];
const MOTIVOS_AUMENTO = ['correccion', 'otro'];
const MOTIVOS_AJUSTE = MOTIVOS_DISMINUCION;
const TIPOS_AJUSTE = ['disminucion', 'aumento'];
const TIPOS_MOVIMIENTO = ['entrada', 'salida', 'ajuste'];
const MOTIVOS_MOVIMIENTO = ['stock_inicial', 'danio', 'perdida', 'merma', 'caducidad', 'correccion', 'otro', 'despacho'];

const decimalesOk = (n, factor) => Math.abs(n * factor - Math.round(n * factor)) < 1e-6;

function texto(valor, { min, max, etiqueta }) {
  if (typeof valor !== 'string') return { error: `${etiqueta} es obligatorio.` };
  const t = valor.trim();
  if (t.length < min || t.length > max) {
    return { error: `${etiqueta} debe tener entre ${min} y ${max} caracteres.` };
  }
  return { valor: t };
}

/** Texto opcional: vacio o null -> null. */
function textoOpcional(valor, { max, etiqueta }) {
  if (valor === null || valor === undefined) return { valor: null };
  if (typeof valor !== 'string') return { error: `${etiqueta} debe ser texto.` };
  const t = valor.trim();
  if (t === '') return { valor: null };
  if (t.length > max) return { error: `${etiqueta} no puede superar ${max} caracteres.` };
  return { valor: t };
}

function booleano(valor, etiqueta) {
  if (typeof valor !== 'boolean') return { error: `${etiqueta} debe ser verdadero o falso (true/false).` };
  return { valor };
}

const validarNombreUnidad = (v) => texto(v, { min: 2, max: 50, etiqueta: 'El nombre de la unidad' });
const validarAbreviatura = (v) => texto(v, { min: 1, max: 10, etiqueta: 'La abreviatura' });
const validarNombreCategoria = (v) => texto(v, { min: 2, max: 80, etiqueta: 'El nombre de la categoria' });
const validarNombreProducto = (v) => texto(v, { min: 2, max: 120, etiqueta: 'El nombre del producto' });
const validarDescripcion = (v) => textoOpcional(v, { max: 255, etiqueta: 'La descripcion' });
const validarObservacion = (v) => textoOpcional(v, { max: 255, etiqueta: 'La observacion' });
const validarPermiteDecimales = (v) => booleano(v, 'permite_decimales');
const validarControlaLotes = (v) => booleano(v, 'controla_lotes');
const validarCodigoLote = (v) => texto(v, { min: 1, max: 50, etiqueta: 'El codigo de lote' });

function validarEstadoInv(valor) {
  if (typeof valor !== 'string' || !ESTADOS.includes(valor)) {
    return { error: `El estado debe ser uno de: ${ESTADOS.join(', ')}.` };
  }
  return { valor };
}

function validarSku(valor) {
  if (valor === null || valor === undefined) return { valor: null };
  if (typeof valor !== 'string') return { error: 'El SKU debe ser texto.' };
  const t = valor.trim();
  if (t === '') return { valor: null };
  if (!REGEX_SKU.test(t)) {
    return { error: 'El SKU debe tener entre 1 y 50 caracteres: letras, digitos, guion, guion bajo o punto (sin espacios).' };
  }
  return { valor: t };
}

/** Id de FK: entero positivo como numero JSON o texto numerico. */
function validarIdFK(valor, etiqueta = 'El id') {
  let n;
  if (typeof valor === 'number') n = valor;
  else if (typeof valor === 'string' && /^[1-9]\d{0,9}$/.test(valor)) n = Number(valor);
  else return { error: `${etiqueta} debe ser un entero positivo.` };
  if (!Number.isInteger(n) || n < 1 || n > 4294967295) return { error: `${etiqueta} debe ser un entero positivo.` };
  return { valor: n };
}

/** Cantidad: numero JSON finito, max 3 decimales, <= MAX_CANTIDAD. permitirCero para stock minimo. */
function validarCantidad(valor, { permitirCero = false, etiqueta = 'La cantidad' } = {}) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return { error: `${etiqueta} debe ser un numero.` };
  if (permitirCero ? valor < 0 : valor <= 0) {
    return { error: permitirCero ? `${etiqueta} no puede ser negativa.` : `${etiqueta} debe ser mayor que cero.` };
  }
  if (valor > MAX_CANTIDAD) return { error: `${etiqueta} no puede superar 999999999.999.` };
  if (!decimalesOk(valor, 1000)) return { error: `${etiqueta} admite como maximo 3 decimales.` };
  return { valor };
}

/** Comprueba la cantidad contra la unidad (permite_decimales). Devuelve mensaje de error o null. */
function errorPorUnidad(cantidad, unidad) {
  if (!unidad.permite_decimales && !Number.isInteger(cantidad)) {
    return `La unidad ${unidad.nombre} solo admite cantidades enteras.`;
  }
  return null;
}

function validarPrecio(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return { error: 'El precio de venta debe ser un numero.' };
  if (valor <= 0) return { error: 'El precio de venta debe ser mayor que cero.' };
  if (valor > MAX_PRECIO) return { error: 'El precio de venta no puede superar 99999999.99.' };
  if (!decimalesOk(valor, 100)) return { error: 'El precio de venta admite como maximo 2 decimales.' };
  return { valor };
}

/** Fecha de un movimiento: real y no futura. */
function validarFechaMovimiento(valor) {
  const r = validarFechaISO(valor);
  if (r.error) return r;
  if (valor > hoyNegocio()) return { error: 'La fecha no puede ser futura.' };
  return r;
}

/** Fecha de caducidad: real y no anterior a hoy. */
function validarFechaCaducidad(valor) {
  const r = validarFechaISO(valor);
  if (r.error) return r;
  if (valor < hoyNegocio()) return { error: 'La fecha de caducidad no puede ser anterior a hoy.' };
  return r;
}

function validarEnumerado(valor, lista, etiqueta) {
  if (typeof valor !== 'string' || !lista.includes(valor)) {
    return { error: `${etiqueta} debe ser uno de: ${lista.join(', ')}.` };
  }
  return { valor };
}

/**
 * Motor generico: especificaciones { campo: validador }.
 * requeridos: campos obligatorios al crear. parcial: PUT (al menos uno).
 */
function validarCampos(cuerpo, specs, { parcial = false, requeridos = [] } = {}) {
  const errores = [];
  const datos = {};
  for (const campo of Object.keys(cuerpo)) {
    if (!Object.prototype.hasOwnProperty.call(specs, campo)) errores.push({ campo, mensaje: 'Campo no permitido.' });
  }
  for (const [campo, validar] of Object.entries(specs)) {
    if (cuerpo[campo] === undefined) {
      if (!parcial && requeridos.includes(campo)) errores.push({ campo, mensaje: 'Es obligatorio.' });
      continue;
    }
    const r = validar(cuerpo[campo]);
    if (r.error) errores.push({ campo, mensaje: r.error });
    else datos[campo] = r.valor;
  }
  if (parcial && errores.length === 0 && Object.keys(datos).length === 0) {
    errores.push({ campo: 'cuerpo', mensaje: 'Debe enviar al menos un campo a modificar.' });
  }
  return { datos, errores };
}

const validarCamposUnidad = (cuerpo, { parcial }) => validarCampos(cuerpo, {
  nombre: validarNombreUnidad, abreviatura: validarAbreviatura, permite_decimales: validarPermiteDecimales,
}, { parcial, requeridos: ['nombre', 'abreviatura'] });

const validarCamposCategoria = (cuerpo, { parcial }) => validarCampos(cuerpo, {
  nombre: validarNombreCategoria, descripcion: validarDescripcion, controla_lotes: validarControlaLotes,
}, { parcial, requeridos: ['nombre'] });

const validarCamposProducto = (cuerpo, { parcial }) => {
  const specs = {
    nombre: validarNombreProducto,
    sku: validarSku,
    descripcion: validarDescripcion,
    categoria_id: (v) => validarIdFK(v, 'La categoria'),
    unidad_id: (v) => validarIdFK(v, 'La unidad'),
    precio_venta: validarPrecio,
    stock_minimo: (v) => validarCantidad(v, { permitirCero: true, etiqueta: 'El stock minimo' }),
  };
  if (!parcial) {
    specs.stock_inicial = (v) => validarCantidad(v, { permitirCero: true, etiqueta: 'El stock inicial' });
    specs.fecha = validarFechaMovimiento;
    specs.codigo_lote = validarCodigoLote;
    specs.fecha_caducidad = validarFechaCaducidad;
  }
  return validarCampos(cuerpo, specs, {
    parcial, requeridos: ['nombre', 'categoria_id', 'unidad_id', 'precio_venta', 'stock_minimo'],
  });
};

const validarCamposEntrada = (cuerpo) => validarCampos(cuerpo, {
  producto_id: (v) => validarIdFK(v, 'El producto'),
  cantidad: (v) => validarCantidad(v),
  fecha: validarFechaMovimiento,
  codigo_lote: validarCodigoLote,
  fecha_caducidad: validarFechaCaducidad,
  observacion: validarObservacion,
}, { requeridos: ['producto_id', 'cantidad'] });

function validarCamposAjuste(cuerpo) {
  const { datos, errores } = validarCampos(cuerpo, {
    producto_id: (v) => validarIdFK(v, 'El producto'),
    tipo_ajuste: (v) => validarEnumerado(v, TIPOS_AJUSTE, 'El tipo de ajuste'),
    cantidad: (v) => validarCantidad(v),
    motivo: (v) => validarEnumerado(v, MOTIVOS_AJUSTE, 'El motivo'),
    observacion: validarObservacion,
    lote_id: (v) => validarIdFK(v, 'El lote'),
    fecha: validarFechaMovimiento,
  }, { requeridos: ['producto_id', 'tipo_ajuste', 'cantidad', 'motivo'] });
  const conError = (c) => errores.some((e) => e.campo === c);
  if (!conError('motivo') && !conError('tipo_ajuste') && datos.motivo && datos.tipo_ajuste
    && datos.tipo_ajuste === 'aumento' && !MOTIVOS_AUMENTO.includes(datos.motivo)) {
    errores.push({ campo: 'motivo', mensaje: 'Este motivo solo permite disminuir el stock.' });
  }
  if (!conError('motivo') && !conError('observacion') && datos.motivo
    && ['otro', 'correccion'].includes(datos.motivo) && !datos.observacion) {
    errores.push({ campo: 'observacion', mensaje: 'La observacion es obligatoria cuando el motivo es otro o correccion.' });
  }
  return { datos, errores };
}

const validarCuerpoEstado = (cuerpo) => validarCampos(cuerpo, { estado: validarEstadoInv }, { requeridos: ['estado'] });

// ---------- Filtros (query string) ----------
function filtroBooleano(valor, campo, errores, destino) {
  if (valor === undefined) return;
  if (valor === 'true') destino[campo] = true;
  else if (valor === 'false') destino[campo] = false;
  else errores.push({ campo, mensaje: `${campo} debe ser true o false.` });
}

function filtroBuscar(valor, errores, destino) {
  if (valor === undefined) return;
  if (typeof valor !== 'string' || valor.length > 100) {
    errores.push({ campo: 'buscar', mensaje: 'El texto de busqueda debe tener maximo 100 caracteres.' });
  } else if (valor.trim() !== '') destino.buscar = valor.trim();
}

function filtroEstado(valor, errores, destino) {
  if (valor === undefined) return;
  const r = validarEstadoInv(valor);
  if (r.error) errores.push({ campo: 'estado', mensaje: r.error }); else destino.estado = r.valor;
}

function filtroId(valor, campo, errores, destino) {
  if (valor === undefined) return;
  const r = validarIdFK(valor, campo);
  if (r.error) errores.push({ campo, mensaje: r.error }); else destino[campo] = r.valor;
}

function filtroEntero(valor, campo, { min, max }, errores, destino) {
  if (valor === undefined) return;
  if (typeof valor !== 'string' || !/^\d{1,7}$/.test(valor) || Number(valor) < min || Number(valor) > max) {
    errores.push({ campo, mensaje: `${campo} debe ser un entero entre ${min} y ${max}.` });
  } else destino[campo] = Number(valor);
}

function filtroFecha(valor, campo, errores, destino) {
  if (valor === undefined) return;
  const r = validarFechaISO(valor);
  if (r.error) errores.push({ campo, mensaje: r.error }); else destino[campo] = r.valor;
}

function filtrosUnidades(q) {
  const errores = []; const f = {};
  filtroEstado(q.estado, errores, f); filtroBuscar(q.buscar, errores, f);
  return { filtros: f, errores };
}

function filtrosCategorias(q) {
  const errores = []; const f = {};
  filtroEstado(q.estado, errores, f); filtroBuscar(q.buscar, errores, f);
  filtroBooleano(q.controla_lotes, 'controla_lotes', errores, f);
  return { filtros: f, errores };
}

function filtrosProductos(q) {
  const errores = []; const f = {};
  filtroEstado(q.estado, errores, f); filtroBuscar(q.buscar, errores, f);
  filtroId(q.categoria_id, 'categoria_id', errores, f);
  filtroId(q.unidad_id, 'unidad_id', errores, f);
  filtroBooleano(q.stock_bajo, 'stock_bajo', errores, f);
  return { filtros: f, errores };
}

function filtrosLotes(q) {
  const errores = []; const f = {};
  filtroBooleano(q.con_stock, 'con_stock', errores, f);
  return { filtros: f, errores };
}

function filtrosMovimientos(q) {
  const errores = []; const f = {};
  filtroId(q.producto_id, 'producto_id', errores, f);
  filtroId(q.usuario_id, 'usuario_id', errores, f);
  if (q.tipo !== undefined) {
    const r = validarEnumerado(q.tipo, TIPOS_MOVIMIENTO, 'tipo');
    if (r.error) errores.push({ campo: 'tipo', mensaje: r.error }); else f.tipo = r.valor;
  }
  if (q.motivo !== undefined) {
    const r = validarEnumerado(q.motivo, MOTIVOS_MOVIMIENTO, 'motivo');
    if (r.error) errores.push({ campo: 'motivo', mensaje: r.error }); else f.motivo = r.valor;
  }
  filtroFecha(q.desde, 'desde', errores, f);
  filtroFecha(q.hasta, 'hasta', errores, f);
  if (f.desde && f.hasta && f.desde > f.hasta) errores.push({ campo: 'desde', mensaje: 'desde no puede ser posterior a hasta.' });
  filtroEntero(q.pagina, 'pagina', { min: 1, max: 1000000 }, errores, f);
  filtroEntero(q.limite, 'limite', { min: 1, max: 200 }, errores, f);
  return { filtros: f, errores };
}

function filtrosAlertas(q) {
  const errores = []; const f = {};
  filtroEntero(q.dias, 'dias', { min: 1, max: 365 }, errores, f);
  return { filtros: f, errores };
}

module.exports = {
  texto, textoOpcional, validarEnumerado,
  filtroBuscar, filtroEstado, filtroId, filtroEntero, filtroFecha, filtroBooleano,
  MOTIVOS_AJUSTE, MOTIVOS_AUMENTO, MOTIVOS_DISMINUCION, TIPOS_AJUSTE,
  validarCantidad, validarPrecio, validarSku, validarIdFK, errorPorUnidad, validarCampos,
  validarCamposUnidad, validarCamposCategoria, validarCamposProducto,
  validarCamposEntrada, validarCamposAjuste, validarCuerpoEstado,
  filtrosUnidades, filtrosCategorias, filtrosProductos, filtrosLotes, filtrosMovimientos, filtrosAlertas,
};
