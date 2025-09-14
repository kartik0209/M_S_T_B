const express = require('express');
const { login, register, verifyToken } = require('../controllers/authController');
const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/verify', verifyToken);

module.exports = router;