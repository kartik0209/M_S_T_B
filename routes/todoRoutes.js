const express = require('express');
const {
  getTodos,
  getTodoById,
  getTodosByGroup,
  getTodaysTodos,
  getOverdueTodos,
  getCompletedTodos,
  searchTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  assignTodoToUser
} = require('../controllers/todoController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply authentication to all todo routes
router.use(authenticateToken);

// Todo CRUD routes
router.get('/', getTodos);
router.get('/search', searchTodos);
router.get('/group/:group', getTodosByGroup); // today, all, completed, overdue
router.get('/today', getTodaysTodos);
router.get('/overdue', getOverdueTodos);
router.get('/completed', getCompletedTodos);
router.get('/:id', getTodoById);
router.post('/', createTodo);
router.put('/:id', updateTodo);
router.delete('/:id', deleteTodo);

// Admin only routes for task assignment
router.post('/assign', requireAdmin, assignTodoToUser);

module.exports = router;