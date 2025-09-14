const express = require('express');
const moment = require('moment');
const Todo = require('../models/Todo');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { 
  validateObjectId,
  validateAdminUserUpdate,
  validateCreateTodo 
} = require('../middleware/validation');

const router = express.Router();

// Apply authentication and admin authorization to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard data
 * @access  Admin
 */
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));

    // Total counts
    const totalTasks = await Todo.countDocuments();
    const totalUsers = await User.countDocuments({ isActive: true });

    // Tasks added in last 7 days (including today)
    const tasksLast7Days = await Todo.countDocuments({
      createdAt: { $gte: sevenDaysAgo, $lte: now }
    });

    // Tasks added in previous 7 days (8-14 days ago)
    const tasksPrevious7Days = await Todo.countDocuments({
      createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
    });

    // Average tasks per user in last 7 days
    const avgTasksPerUser = totalUsers > 0 ? (tasksLast7Days / totalUsers).toFixed(2) : 0;

    // Task distribution by status
    const statusDistribution = await Todo.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Task distribution by category
    const categoryDistribution = await Todo.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Task distribution by priority
    const priorityDistribution = await Todo.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          priority: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Daily task creation for last 7 days
    const dailyStats = await Todo.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    // Top active users
    const topUsers = await User.aggregate([
      {
        $lookup: {
          from: 'todos',
          localField: '_id',
          foreignField: 'userId',
          as: 'todos'
        }
      },
      {
        $project: {
          username: 1,
          email: 1,
          todoCount: { $size: '$todos' },
          createdAt: 1
        }
      },
      {
        $sort: { todoCount: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Overdue tasks count
    const overdueTasks = await Todo.countDocuments({
      dueDate: { $lt: now },
      status: { $nin: ['Completed', 'Cancelled'] }
    });

    // Completed tasks today
    const completedToday = await Todo.countDocuments({
      status: 'Completed',
      completedAt: {
        $gte: new Date(now.setHours(0, 0, 0, 0)),
        $lte: new Date(now.setHours(23, 59, 59, 999))
      }
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalTasks,
          totalUsers,
          tasksLast7Days,
          tasksPrevious7Days,
          avgTasksPerUser: parseFloat(avgTasksPerUser),
          overdueTasks,
          completedToday
        },
        distributions: {
          status: statusDistribution,
          category: categoryDistribution,
          priority: priorityDistribution
        },
        dailyStats,
        topUsers
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with pagination
 * @access  Admin
 */
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add todo counts for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const todoCount = await Todo.countDocuments({ userId: user._id });
        const completedTodos = await Todo.countDocuments({ 
          userId: user._id, 
          status: 'Completed' 
        });
        const overdueTodos = await Todo.countDocuments({
          userId: user._id,
          dueDate: { $lt: new Date() },
          status: { $nin: ['Completed', 'Cancelled'] }
        });

        return {
          ...user.toObject(),
          stats: {
            totalTodos: todoCount,
            completedTodos,
            overdueTodos
          }
        };
      })
    );

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get specific user details with todos
 * @access  Admin
 */
router.get('/users/:id', validateObjectId, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's todos with pagination
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const todos = await Todo.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignedByUser', 'username email');

    const totalTodos = await Todo.countDocuments({ userId: req.params.id });
    const totalPages = Math.ceil(totalTodos / parseInt(limit));

    // Get user statistics
    const stats = await Todo.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$dueDate', new Date()] },
                    { $nin: ['$status', ['Completed', 'Cancelled']] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        user,
        todos,
        stats: stats[0] || { total: 0, completed: 0, pending: 0, overdue: 0 },
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total: totalTodos,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user details (admin only)
 * @access  Admin
 */
router.put('/users/:id', [validateObjectId, validateAdminUserUpdate], async (req, res) => {
  try {
    const { role, isActive } = req.body;
    const userId = req.params.id;

    // Prevent admin from deactivating themselves
    if (userId === req.user._id.toString() && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    // Prevent removing admin role from the last admin
    if (role === 'user') {
      const user = await User.findById(userId);
      if (user && user.role === 'admin') {
        const adminCount = await User.countDocuments({ 
          role: 'admin', 
          isActive: true,
          _id: { $ne: userId }
        });
        if (adminCount < 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot remove admin role from the last active admin'
          });
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   GET /api/admin/todos
 * @desc    Get all todos from all users
 * @access  Admin
 */
router.get('/todos', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      status, 
      category, 
      priority, 
      userId 
    } = req.query;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (userId) query.userId = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const todos = await Todo.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'username email')
      .populate('assignedByUser', 'username email');

    const total = await Todo.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: {
        todos,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Admin get todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch todos',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   POST /api/admin/todos
 * @desc    Create todo for any user (admin only)
 * @access  Admin
 */
router.post('/todos', validateCreateTodo, async (req, res) => {
  try {
    const { title, description, dueDate, category, priority, userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required for admin todo creation'
      });
    }

    // Verify target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found'
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

    // Populate user details
    await todo.populate('userId', 'username email');
    await todo.populate('assignedByUser', 'username email');

    res.status(201).json({
      success: true,
      message: 'Todo created successfully',
      data: { todo }
    });
  } catch (error) {
    console.error('Admin create todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create todo',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   DELETE /api/admin/todos/:id
 * @desc    Delete any todo (admin only)
 * @access  Admin
 */
router.delete('/todos/:id', validateObjectId, async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    await Todo.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Todo deleted successfully'
    });
  } catch (error) {
    console.error('Admin delete todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete todo',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   GET /api/admin/reports
 * @desc    Get detailed reports and analytics
 * @access  Admin
 */
router.get('/reports', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    // User activity report
    const userActivity = await User.aggregate([
      {
        $lookup: {
          from: 'todos',
          localField: '_id',
          foreignField: 'userId',
          as: 'todos'
        }
      },
      {
        $lookup: {
          from: 'todos',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
                createdAt: { $gte: sevenDaysAgo }
              }
            }
          ],
          as: 'recentTodos'
        }
      },
      {
        $project: {
          username: 1,
          email: 1,
          role: 1,
          isActive: 1,
          lastLogin: 1,
          createdAt: 1,
          totalTodos: { $size: '$todos' },
          recentTodos: { $size: '$recentTodos' },
          completedTodos: {
            $size: {
              $filter: {
                input: '$todos',
                cond: { $eq: ['$$this.status', 'Completed'] }
              }
            }
          }
        }
      },
      {
        $sort: { totalTodos: -1 }
      }
    ]);

    // Task completion trends
    const completionTrends = await Todo.aggregate([
      {
        $match: {
          completedAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$completedAt'
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    // Category performance
    const categoryPerformance = await Todo.aggregate([
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          },
          avgCompletionTime: {
            $avg: {
              $cond: [
                { $ne: ['$completedAt', null] },
                { $subtract: ['$completedAt', '$createdAt'] },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          category: '$_id',
          total: 1,
          completed: 1,
          completionRate: {
            $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 2]
          },
          avgCompletionDays: {
            $round: [{ $divide: ['$avgCompletionTime', 86400000] }, 2]
          },
          _id: 0
        }
      },
      {
        $sort: { completionRate: -1 }
      }
    ]);

    // System health metrics
    const systemHealth = {
      totalUsers: await User.countDocuments({ isActive: true }),
      totalTodos: await Todo.countDocuments(),
      overduePercentage: await Todo.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lt: ['$dueDate', now] },
                      { $nin: ['$status', ['Completed', 'Cancelled']] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            percentage: {
              $round: [{ $multiply: [{ $divide: ['$overdue', '$total'] }, 100] }, 2]
            }
          }
        }
      ]),
      activeUsersLast7Days: await User.countDocuments({
        lastLogin: { $gte: sevenDaysAgo }
      })
    };

    res.json({
      success: true,
      data: {
        userActivity,
        completionTrends,
        categoryPerformance,
        systemHealth: {
          ...systemHealth,
          overduePercentage: systemHealth.overduePercentage[0]?.percentage || 0
        },
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate reports',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;