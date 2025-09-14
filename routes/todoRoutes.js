const express = require('express');
const { createTodo, getTodos, updateTodo, deleteTodo } = require('../controllers/todoController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, createTodo);
router.get('/', authMiddleware, getTodos);
router.put('/:id', authMiddleware, updateTodo);
router.delete('/:id', authMiddleware, deleteTodo);

module.exports = router;