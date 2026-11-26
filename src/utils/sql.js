'use strict';

/** Patron para LIKE '%texto%' escapando la barra invertida, % y _ (se buscan como texto literal). */
function patronLike(texto) {
  return `%${String(texto).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

module.exports = { patronLike };
