'use strict';

const aCentavos = (n) => Math.round(Number(n) * 100);

/**
 * Unica formula de credito (D2). Se calcula en centavos enteros.
 * credito_disponible = max(limite - saldo, 0); credito_excedido = saldo > limite.
 */
function calcularCredito(limite, saldo) {
  const l = aCentavos(limite);
  const s = aCentavos(saldo);
  return {
    saldo_pendiente: s / 100,
    credito_disponible: Math.max(l - s, 0) / 100,
    credito_excedido: s > l,
  };
}

module.exports = { calcularCredito, aCentavos };
