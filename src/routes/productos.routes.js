'use strict';
const { Router } = require('express');
const ctrl = require('../controllers/productos.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/rol.middleware');

const router = Router();
router.use(verificarToken, permitirRoles('administrador'));

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.get('/:id/lotes', ctrl.listarLotes);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.patch('/:id/estado', ctrl.cambiarEstado);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
