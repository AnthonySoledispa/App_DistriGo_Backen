'use strict';
const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

// Cuenta solo los intentos fallidos (respuestas >= 400), por IP.
const limiteLogin = rateLimit({
  windowMs: env.login.ventanaMinutos * 60 * 1000,
  limit: env.login.maxIntentos,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      codigo: 'DEMASIADOS_INTENTOS',
      mensaje: `Demasiados intentos fallidos. Intente de nuevo en ${env.login.ventanaMinutos} minutos.`,
    });
  },
});

module.exports = { limiteLogin };
