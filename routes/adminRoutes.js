const express = require('express');
const {
  getDashboard,
  getUsers,
  getUserDetails,
  updateUser,
  getAllTodos,
  getReports,
  addUser
} = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { UploadStream } = require('cloudinary');
const { upload } = require('../config/cloudinary');

const router = express.Router();

// Apply authentication and admin authorization to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// Admin dashboard and analytics
router.get('/dashboard', getDashboard);
router.get('/reports', getReports);

// User management
router.get('/users', getUsers);
router.post('/users', upload.single('image'), addUser);
router.get('/users/:userId', getUserDetails);
router.put('/users/:userId', updateUser);

// Todo management
router.get('/todos', getAllTodos);

module.exports = router;