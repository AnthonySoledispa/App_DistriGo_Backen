'use strict';
const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { limiteLogin } = require('../middlewares/limiteLogin.middleware');

const router = Router();
router.post('/login', limiteLogin, ctrl.login);
router.post('/logout', verificarToken, ctrl.logout);
router.get('/perfil', verificarToken, ctrl.perfil);

module.exports = router;
