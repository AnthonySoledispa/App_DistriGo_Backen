'use strict';
const HttpError = require('../utils/HttpError');
const env = require('../config/env');
const { cuerpoObjeto } = require('../utils/peticion');
const { hoyNegocio } = require('../utils/fechas');
const V = require('../utils/validacionesInventario');
const Producto = require('../models/producto.model');
const Lote = require('../models/lote.model');
const Movimiento = require('../models/movimiento.model');
const Inventario = require('../services/inventario.service');

async function registrarEntrada(req, res) {
  const { datos, errores } = V.validarCamposEntrada(cuerpoObjeto(req));
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de entrada invalidos.', errores);
  const data = await Inventario.registrarEntrada(req.usuario.id, datos);
  res.status(201).json({ ok: true, data });
}

async function registrarAjuste(req, res) {
  const { datos, errores } = V.validarCamposAjuste(cuerpoObjeto(req));
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Datos de ajuste invalidos.', errores);
  const data = await Inventario.registrarAjuste(req.usuario.id, datos);
  res.status(201).json({ ok: true, data });
}

async function listarMovimientos(req, res) {
  const { filtros, errores } = V.filtrosMovimientos(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  res.json({ ok: true, data: await Movimiento.listar(filtros) });
}

async function alertas(req, res) {
  const { filtros, errores } = V.filtrosAlertas(req.query);
  if (errores.length) throw new HttpError(400, 'VALIDACION', 'Filtros invalidos.', errores);
  const dias = filtros.dias ?? env.alertaCaducidadDias;
  const hoy = hoyNegocio();

  const stockBajo = await Producto.listar({ estado: 'activo', stock_bajo: true }, undefined, { orden: 'holgura' });
  const porVencer = await Lote.listarParaAlertas('por_vencer', { hoy, dias });
  const vencidos = await Lote.listarParaAlertas('vencidos', { hoy, dias });
  res.json({
    ok: true,
    data: {
      dias, hoy,
      stock_bajo: stockBajo,
      por_vencer: porVencer,
      vencidos,
      totales: { stock_bajo: stockBajo.length, por_vencer: porVencer.length, vencidos: vencidos.length },
    },
  });
}

module.exports = { registrarEntrada, registrarAjuste, listarMovimientos, alertas };
