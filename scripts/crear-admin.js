'use strict';
// Crea el primer administrador. Interactivo, o no interactivo con ADMIN_NOMBRE, ADMIN_CORREO y ADMIN_CONTRASENA.
// Se niega si ya existe algun administrador. Nunca imprime la contrasena ni el hash.
const readline = require('node:readline');
const env = require('../src/config/env');
const { pool } = require('../src/config/db');
const { hashear } = require('../src/utils/password');
const V = require('../src/utils/validaciones');
const Usuario = require('../src/models/usuario.model');

function preguntar(texto, oculto = false) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(s); };
    }
    rl.question(texto, (r) => {
      rl.close();
      if (oculto) process.stdout.write('\n');
      resolver(r);
    });
  });
}

async function obtenerDatos() {
  const { ADMIN_NOMBRE, ADMIN_CORREO, ADMIN_CONTRASENA } = process.env;
  if (ADMIN_NOMBRE && ADMIN_CORREO && ADMIN_CONTRASENA) {
    return { nombre: ADMIN_NOMBRE, correo: ADMIN_CORREO, contrasena: ADMIN_CONTRASENA };
  }
  if (!process.stdin.isTTY) {
    throw new Error('Sin terminal interactiva: defina ADMIN_NOMBRE, ADMIN_CORREO y ADMIN_CONTRASENA.');
  }
  const nombre = await preguntar('Nombre: ');
  const correo = await preguntar('Correo: ');
  const contrasena = await preguntar('Contrasena: ', true);
  const repetida = await preguntar('Repita la contrasena: ', true);
  if (contrasena !== repetida) throw new Error('Las contrasenas no coinciden.');
  return { nombre, correo, contrasena };
}

async function main() {
  if ((await Usuario.contarAdministradores()) > 0) {
    throw new Error('Ya existe un administrador. Los demas se crean desde la API (POST /api/usuarios).');
  }
  const entrada = await obtenerDatos();
  const nombre = V.validarNombre(entrada.nombre);
  const correo = V.validarCorreo(entrada.correo);
  const contrasena = V.validarContrasena(entrada.contrasena);
  const errores = [nombre, correo, contrasena].filter((r) => r.error).map((r) => r.error);
  if (errores.length) throw new Error(errores.join(' '));

  const id = await Usuario.crear({
    nombre: nombre.valor,
    correo: correo.valor,
    contrasenaHash: await hashear(contrasena.valor),
    rol: 'administrador',
    creadoPor: null,
  });
  console.log(`Administrador creado (id ${id}, correo ${correo.valor}) en la BD "${env.db.nombre}".`);
}

main()
  .catch((err) => {
    const mensaje = err && err.code === 'ER_DUP_ENTRY' ? 'Ya existe un usuario con ese correo.' : (err.message || err.code);
    console.error(`Error: ${mensaje}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
