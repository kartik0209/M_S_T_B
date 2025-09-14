const Todo = require('../models/Todo');

// Get all todos for user
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
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = { userId };
    if (status) query.status = status;
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
      .populate('userId', 'username email profileImage');

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
        }
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
      .populate('userId', 'username email profileImage');

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    // Check if user owns this todo
    if (todo.userId.toString() !== req.user._id.toString()) {
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
      dueDate: {
        $gte: today,
        $lt: tomorrow
      }
    }).populate('userId', 'username email profileImage');

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
    }).populate('userId', 'username email profileImage');

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


// Create new todo
exports.createTodo = async (req, res) => {
  try {
    const { title, description, dueDate, category, priority } = req.body;

    const todo = new Todo({
      title,
      description,
      dueDate: new Date(dueDate),
      category,
      priority: priority || 'Medium',
      userId: req.user._id
    });

    await todo.save();
    await todo.populate('userId', 'username email profileImage');

    res.status(201).json({
      success: true,
      message: 'Todo created successfully',
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

// Update todo
exports.updateTodo = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    // Check if user owns this todo
    if (todo.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { title, description, dueDate, category, priority, status } = req.body;
    
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (category !== undefined) updateData.category = category;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;

    const updatedTodo = await Todo.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('userId', 'username email profileImage');

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

// Delete todo
exports.deleteTodo = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    // Check if user owns this todo
    if (todo.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await todo.remove();

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
