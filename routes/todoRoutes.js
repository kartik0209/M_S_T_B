const express = require('express');
const {
  getTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodaysTodos,
  getOverdueTodos
} = require('../controllers/todoController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply authentication to all todo routes
router.use(authenticateToken);

// Todo CRUD routes
router.get('/', getTodos);
router.get('/today', getTodaysTodos);
router.get('/overdue', getOverdueTodos);
router.get('/:id', getTodoById);
router.post('/', createTodo);
router.put('/:id', updateTodo);
router.delete('/:id', deleteTodo);

module.exports = router;