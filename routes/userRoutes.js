const express = require('express');
const { getUserProfile, updateUserRole } = require('../controllers/userController');
const { authMiddleware, roleMiddleware } = require('../middleware');

const router = express.Router();

router.get('/profile', authMiddleware, getUserProfile);
router.put('/role/:id', authMiddleware, roleMiddleware('admin'), updateUserRole);

module.exports = router;