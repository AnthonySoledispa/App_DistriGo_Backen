'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const rutas = require('./routes');
const { noEncontrado, manejarErrores } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigenes }));
app.use(express.json({ limit: '10kb' }));

app.use('/api', rutas);
app.use(noEncontrado);
app.use(manejarErrores);

module.exports = app;
