'use strict';
const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');

const servidor = app.listen(env.puerto, env.host, () => {
  console.log(`DistriGO API escuchando en http://${env.host}:${servidor.address().port}`);
});

function apagar() {
  servidor.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
