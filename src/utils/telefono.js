'use strict';
// Telefono ecuatoriano: celular 09XXXXXXXX o fijo 0[2-7]XXXXXXX. Acepta +593 / 593.
const REGEX_TELEFONO = /^0(9\d{8}|[2-7]\d{7})$/;

/** Normaliza el telefono. Devuelve { valor } o { error }. */
function normalizarTelefono(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') return { error: 'El telefono es obligatorio.' };
  let t = texto.trim();
  if (!/^[+\d\s().-]+$/.test(t)) return { error: 'El telefono solo puede contener digitos, espacios, guiones, puntos, parentesis y el signo +.' };
  const tieneMas = t.startsWith('+');
  t = t.replace(/[\s().-]/g, '');
  if (tieneMas) t = t.slice(1);
  if (t.includes('+')) return { error: 'El telefono no tiene un formato valido.' };
  if (tieneMas && !t.startsWith('593')) return { error: 'El telefono debe ser ecuatoriano (+593).' };
  if (t.startsWith('593')) t = `0${t.slice(3)}`;
  if (!REGEX_TELEFONO.test(t)) {
    return { error: 'El telefono debe ser un celular (09XXXXXXXX) o un fijo (0[2-7]XXXXXXX) de Ecuador.' };
  }
  return { valor: t };
}

module.exports = { normalizarTelefono };
