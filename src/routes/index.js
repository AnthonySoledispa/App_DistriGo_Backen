'use strict';
const { Router } = require('express');
const { query } = require('../config/db');
const HttpError = require('../utils/HttpError');

const router = Router();

router.get('/salud', async (_req, res) => {
  try {
    await query('SELECT 1 AS ok');
  } catch {
    throw new HttpError(503, 'BD_NO_DISPONIBLE', 'Base de datos no disponible');
  }
  res.json({ ok: true, data: { api: 'ok', bd: 'ok' } });
});

router.use('/auth', require('./auth.routes'));
router.use('/usuarios', require('./usuarios.routes'));

module.exports = router;
