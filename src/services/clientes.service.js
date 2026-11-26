'use strict';
// Servicio de clientes: unica fuente de la formula de saldo y credito (D2) y contrato de credito
// para el Modulo 4 (RB-02, CA-04). Los Modulos 4 y 6 sustituyen SOLO el cuerpo de saldosPendientes.
const HttpError = require('../utils/HttpError');
const { calcularCredito, aCentavos } = require('../utils/credito');
const Cliente = require('../models/cliente.model');

/**
 * Saldo pendiente por cliente: Map<id, number>.
 * Hoy devuelve 0 para todos (no existen pedidos ni pagos). Debe seguir resolviendo todos los ids en una sola consulta.
 */
async function saldosPendientes(_conexion, clienteIds) {
  const mapa = new Map();
  for (const id of clienteIds) mapa.set(id, 0);
  return mapa;
}

/** Agrega saldo_pendiente, credito_disponible y credito_excedido a un cliente o a una lista (una sola llamada a saldosPendientes). */
async function adjuntarCredito(entrada, conexion) {
  const lista = Array.isArray(entrada) ? entrada : [entrada];
  if (lista.length === 0) return Array.isArray(entrada) ? [] : entrada;
  const saldos = await saldosPendientes(conexion, lista.map((c) => c.id));
  const resultado = lista.map((c) => {
    const { saldo_pendiente: saldo, credito_disponible: disponible, credito_excedido: excedido } =
      calcularCredito(c.limite_credito, saldos.get(c.id) ?? 0);
    const { limite_credito: limite, estado, creado_por: creadoPor, creado_en: creadoEn, actualizado_en: actualizadoEn, ...cabecera } = c;
    // Se reconstruye en el orden del contrato de la API.
    return {
      ...cabecera, limite_credito: limite, saldo_pendiente: saldo, credito_disponible: disponible, credito_excedido: excedido,
      estado, creado_por: creadoPor, creado_en: creadoEn, actualizado_en: actualizadoEn,
    };
  });
  return Array.isArray(entrada) ? resultado : resultado[0];
}

/** Estado de credito de un cliente o null si no existe. Con bloquear usa FOR UPDATE (dentro de una transaccion). */
async function obtenerEstadoCredito(conexion, clienteId, { bloquear = false } = {}) {
  const c = await Cliente.buscarParaCredito(clienteId, { bloquear }, conexion);
  if (!c) return null;
  const saldos = await saldosPendientes(conexion, [c.id]);
  return {
    cliente_id: c.id,
    estado: c.estado,
    limite_credito: c.limite_credito,
    ...calcularCredito(c.limite_credito, saldos.get(c.id) ?? 0),
  };
}

/**
 * RB-02: valida que un pedido a credito de `monto` quepa en el credito disponible. Devuelve el estado de credito.
 * El Modulo 4 debe llamarla dentro de conTransaccion y antes de insertar el pedido: con conexion bloquea
 * la fila del cliente (FOR UPDATE) y serializa pedidos simultaneos de la misma tienda.
 */
async function validarCreditoParaPedido(conexion, clienteId, monto) {
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    throw new HttpError(400, 'VALIDACION', 'El monto del pedido debe ser un numero mayor que 0.');
  }
  const e = await obtenerEstadoCredito(conexion, clienteId, { bloquear: Boolean(conexion) });
  if (!e) throw new HttpError(404, 'CLIENTE_NO_ENCONTRADO', 'Tienda no encontrada.');
  if (e.estado !== 'activo') throw new HttpError(409, 'CLIENTE_INACTIVO', 'La tienda esta inactiva y no puede recibir pedidos.');
  if (aCentavos(monto) > aCentavos(e.credito_disponible)) {
    throw new HttpError(409, 'CREDITO_INSUFICIENTE', 'El monto supera el credito disponible de la tienda.', undefined, {
      cliente_id: e.cliente_id,
      limite_credito: e.limite_credito,
      saldo_pendiente: e.saldo_pendiente,
      credito_disponible: e.credito_disponible,
      monto,
    });
  }
  return e;
}

/**
 * Historial de compras de una tienda (RF-24). Contrato de cada item:
 * { pedido_id, numero, fecha, estado, tipo_pago: 'contado'|'credito', total, saldo }, orden fecha DESC, pedido_id DESC.
 * Hasta el Modulo 4 no hay pedidos: devuelve lista vacia.
 */
async function historialCompras(_conexion, _clienteId, { pagina = 1, limite = 20 } = {}) {
  return { items: [], total: 0, pagina, limite };
}

module.exports = { saldosPendientes, adjuntarCredito, obtenerEstadoCredito, validarCreditoParaPedido, historialCompras };
