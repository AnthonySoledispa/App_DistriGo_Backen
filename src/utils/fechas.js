'use strict';
const env = require('../config/env');

const REGEX_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Devuelve true si el texto es una fecha real 'YYYY-MM-DD'. */
function esFechaISO(texto) {
  if (typeof texto !== 'string') return false;
  const m = REGEX_ISO.exec(texto);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anio < 1900 || anio > 2999) return false;
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
}

/** Valida una fecha 'YYYY-MM-DD'. Devuelve { valor } o { error }. */
function validarFechaISO(texto) {
  if (!esFechaISO(texto)) return { error: 'La fecha debe tener el formato AAAA-MM-DD y ser una fecha real.' };
  return { valor: texto };
}

/** Fecha de hoy en la zona horaria del negocio, 'YYYY-MM-DD'. */
function hoyNegocio() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.zonaHorariaNegocio, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => partes.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Suma n dias (puede ser negativo) a una fecha ISO. */
function sumarDias(iso, n) {
  const m = REGEX_ISO.exec(iso);
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return f.toISOString().slice(0, 10);
}

/** Diferencia en dias enteros (b - a) entre dos fechas ISO. */
function diasEntre(a, b) {
  const t = (iso) => { const m = REGEX_ISO.exec(iso); return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])); };
  return Math.round((t(b) - t(a)) / 86400000);
}

module.exports = { esFechaISO, validarFechaISO, hoyNegocio, sumarDias, diasEntre };
