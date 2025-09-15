const Todo = require('../models/Todo');
const User = require('../models/User');

// Get all todos for user with enhanced filtering and grouping
exports.getTodos = async (req, res) => {
  try {
    const userId = req.user._id;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      category, 
      priority, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      group // 'today', 'all', 'completed', 'overdue'
    } = req.query;

    // Build query
    let query = { userId };
    
    // Apply grouping filters
    if (group === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      query.dueDate = { $gte: today, $lt: tomorrow };
      query.status = { $ne: 'completed' };
    } else if (group === 'completed') {
      query.status = 'completed';
    } else if (group === 'overdue') {
      query.dueDate = { $lt: new Date() };
      query.status = { $ne: 'completed' };
    } else if (group === 'all') {
      query.status = { $ne: 'completed' };
    }

    // Apply additional filters
    if (status && !group) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const todos = await Todo.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'username email profileImage')
      .populate('assignedBy', 'username email');

    const total = await Todo.countDocuments(query);

    res.json({
      success: true,
      data: {
        todos,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          total,
          hasNextPage: page < Math.ceil(total / parseInt(limit)),
          hasPrevPage: page > 1
        },
        group: group || 'all'
      }
    });
  } catch (error) {
    console.error('Get todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch todos',
      error: error.message
    });
  }
};

// Get single todo
exports.getTodoById = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id)
      .populate('userId', 'username email profileImage')
      .populate('assignedBy', 'username email');

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    // Check if user owns this todo or is admin
    if (todo.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { todo }
    });
  } catch (error) {
    console.error('Get todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch todo',
      error: error.message
    });
  }
};

// Get todos by group (Today's, All, Completed, Overdue)
exports.getTodosByGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { group } = req.params; // 'today', 'all', 'completed', 'overdue'
    
    let query = { userId };
    let title = '';

    switch (group) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        query.dueDate = { $gte: today, $lt: tomorrow };
        query.status = { $ne: 'completed' };
        title = "Today's To-Dos";
        break;
      case 'all':
        query.status = { $ne: 'completed' };
        title = "All To-Dos";
        break;
      case 'completed':
        query.status = 'completed';
        title = "Completed (Archive)";
        break;
      case 'overdue':
        query.dueDate = { $lt: new Date() };
        query.status = { $ne: 'completed' };
        title = "Overdue";
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid group. Use: today, all, completed, or overdue'
        });
    }

    const todos = await Todo.find(query)
      .sort({ dueDate: 1, createdAt: -1 })
      .populate('userId', 'username email profileImage')
      .populate('assignedBy', 'username email');

    res.json({
      success: true,
      data: { 
        todos, 
        group, 
        title,
        count: todos.length 
      }
    });
  } catch (error) {
    console.error('Get todos by group error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch todos',
      error: error.message
    });
  }
};

// Get today's todos
exports.getTodaysTodos = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todos = await Todo.find({
      userId,
      dueDate: { $gte: today, $lt: tomorrow },
      status: { $ne: 'completed' }
    })
    .populate('userId', 'username email profileImage')
    .populate('assignedBy', 'username email')
    .sort({ dueDate: 1 });

    res.json({
      success: true,
      data: { todos }
    });
  } catch (error) {
    console.error('Get today\'s todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s todos',
      error: error.message
    });
  }
};

// Get overdue todos
exports.getOverdueTodos = async (req, res) => {
  try {
    const userId = req.user._id;
    const todos = await Todo.find({
      userId,
      dueDate: { $lt: new Date() },
      status: { $ne: 'completed' }
    })
    .populate('userId', 'username email profileImage')
    .populate('assignedBy', 'username email')
    .sort({ dueDate: 1 });

    res.json({
      success: true,
      data: { todos }
    });
  } catch (error) {
    console.error('Get overdue todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch overdue todos',
      error: error.message
    });
  }
};

// Get completed todos (Archive)
exports.getCompletedTodos = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const todos = await Todo.find({
      userId,
      status: 'completed'
    })
    .populate('userId', 'username email profileImage')
    .populate('assignedBy', 'username email')
    .sort({ completedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Todo.countDocuments({ userId, status: 'completed' });

    res.json({
      success: true,
      data: {
        todos,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          total,
          hasNextPage: page < Math.ceil(total / parseInt(limit)),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get completed todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch completed todos',
      error: error.message
    });
  }
};

// Search todos
exports.searchTodos = async (req, res) => {
  try {
    const userId = req.user._id;
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const todos = await Todo.find({
      userId,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ]
    })
    .populate('userId', 'username email profileImage')
    .populate('assignedBy', 'username email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Todo.countDocuments({
      userId,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ]
    });

    res.json({
      success: true,
      data: {
        todos,
        searchQuery: q,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          total,
          hasNextPage: page < Math.ceil(total / parseInt(limit)),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Search todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search todos',
      error: error.message
    });
  }
};

// Create new todo (Enhanced with assignment functionality)
exports.createTodo = async (req, res) => {
  try {
    const { title, description, dueDate, category, priority, assignToUserId } = req.body;

    let userId = req.user._id;
    let assignedBy = null;

    // If admin is assigning to another user
    if (assignToUserId && req.user.role === 'admin') {
      const assignToUser = await User.findById(assignToUserId);
      if (!assignToUser) {
        return res.status(404).json({
          success: false,
          message: 'User to assign to not found'
        });
      }
      userId = assignToUserId;
      assignedBy = req.user._id;
    }

    const todo = new Todo({
      title,
      description,
      dueDate: new Date(dueDate),
      category,
      priority: priority || 'Medium',
      userId,
      assignedBy
    });

    await todo.save();
    await todo.populate([
      { path: 'userId', select: 'username email profileImage' },
      { path: 'assignedBy', select: 'username email' }
    ]);

    res.status(201).json({
      success: true,
      message: assignedBy ? 'Todo assigned successfully' : 'Todo created successfully',
      data: { todo }
    });
  } catch (error) {
    console.error('Create todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create todo',
      error: error.message
    });
  }
};

// Update todo (Enhanced with admin capabilities)
exports.updateTodo = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    // Check if user owns this todo or is admin
    if (todo.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { title, description, dueDate, category, priority, status, assignToUserId } = req.body;
    
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (category !== undefined) updateData.category = category;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'completed' && !todo.completedAt) {
        updateData.completedAt = new Date();
      } else if (status !== 'completed') {
        updateData.completedAt = null;
      }
    }

    // Admin can reassign tasks
    if (assignToUserId && req.user.role === 'admin') {
      const assignToUser = await User.findById(assignToUserId);
      if (!assignToUser) {
        return res.status(404).json({
          success: false,
          message: 'User to assign to not found'
        });
      }
      updateData.userId = assignToUserId;
      updateData.assignedBy = req.user._id;
    }

    const updatedTodo = await Todo.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate([
      { path: 'userId', select: 'username email profileImage' },
      { path: 'assignedBy', select: 'username email' }
    ]);

    res.json({
      success: true,
      message: 'Todo updated successfully',
      data: { todo: updatedTodo }
    });
  } catch (error) {
    console.error('Update todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update todo',
      error: error.message
    });
  }
};

// Delete todo (Enhanced with admin capabilities)
exports.deleteTodo = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    // Check if user owns this todo or is admin
    if (todo.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await Todo.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Todo deleted successfully'
    });
  } catch (error) {
    console.error('Delete todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete todo',
      error: error.message
    });
  }
};

// Admin: Assign task to user
exports.assignTodoToUser = async (req, res) => {
  console.log('Assigning todo to user:', req.body);
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { userId, title, description, dueDate, category, priority } = req.body;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const todo = new Todo({
      title,
      description,
      dueDate: new Date(dueDate),
      category,
      priority: priority || 'Medium',
      userId,
      assignedBy: req.user._id
    });

    await todo.save();
    await todo.populate([
      { path: 'userId', select: 'username email profileImage' },
      { path: 'assignedBy', select: 'username email' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Task assigned to user successfully',
      data: { todo }
    });
  } catch (error) {
    console.error('Assign todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign task',
      error: error.message
    });
  }
};

