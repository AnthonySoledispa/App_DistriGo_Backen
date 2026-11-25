'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const env = require('../config/env');

// Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe.
const HASH_FICTICIO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), env.bcryptRounds);

const hashear = (contrasena) => bcrypt.hash(contrasena, env.bcryptRounds);
const comparar = (contrasena, hash) => bcrypt.compare(contrasena, hash);

module.exports = { hashear, comparar, HASH_FICTICIO };
