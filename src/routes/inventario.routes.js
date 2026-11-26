'use strict';
const { Router } = require('express');
const ctrl = require('../controllers/inventario.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/rol.middleware');

const router = Router();
router.use(verificarToken, permitirRoles('administrador'));

router.post('/entradas', ctrl.registrarEntrada);
router.post('/ajustes', ctrl.registrarAjuste);
router.get('/movimientos', ctrl.listarMovimientos);
router.get('/alertas', ctrl.alertas);

module.exports = router;
