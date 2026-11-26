'use strict';
const { Router } = require('express');
const ctrl = require('../controllers/rutas.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/rol.middleware');

const router = Router();
router.use(verificarToken, permitirRoles('administrador'));

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.patch('/:id/estado', ctrl.cambiarEstado);

module.exports = router;
