const express = require('express');
const { updateProfile, uploadProfileImage, getUserStats } = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

const router = express.Router();

// Apply authentication to all user routes
router.use(authenticateToken);

// User profile routes
router.put('/profile', updateProfile);
router.post('/profile/image', upload.single('profileImage'), uploadProfileImage);
router.get('/stats', getUserStats);

module.exports = router;