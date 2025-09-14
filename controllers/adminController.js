const User = require('../models/User');
const Todo = require('../models/Todo');

// Admin Dashboard
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    // Basic counts
    const totalUsers = await User.countDocuments({ isActive: true });
    const totalTodos = await Todo.countDocuments();
    const completedTodos = await Todo.countDocuments({ status: 'completed' });
    const overdueTodos = await Todo.countDocuments({
      dueDate: { $lt: now },
      status: { $ne: 'completed' }
    });

    // Recent activity
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    const recentTodos = await Todo.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Todo status distribution
    const statusStats = await Todo.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Category distribution
    const categoryStats = await Todo.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Priority distribution
    const priorityStats = await Todo.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Daily activity for last 30 days
    const dailyActivity = await Todo.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
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
      { $sort: { '_id.date': 1 } }
    ]);

    // Most active users
    const activeUsers = await Todo.aggregate([
      {
        $group: {
          _id: '$userId',
          todoCount: { $sum: 1 },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          username: '$user.username',
          email: '$user.email',
          profileImage: '$user.profileImage',
          todoCount: 1,
          completedCount: 1,
          completionRate: {
            $round: [
              { $multiply: [{ $divide: ['$completedCount', '$todoCount'] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { todoCount: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          totalTodos,
          completedTodos,
          overdueTodos,
          recentUsers,
          recentTodos,
          completionRate: totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0
        },
        charts: {
          statusStats,
          categoryStats,
          priorityStats,
          dailyActivity,
          activeUsers
        }
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;

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

    // Add todo stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const todoStats = await Todo.aggregate([
          { $match: { userId: user._id } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
              },
              pending: {
                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
              },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $lt: ['$dueDate', new Date()] },
                        { $ne: ['$status', 'completed'] }
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

        return {
          ...user.toObject(),
          stats: todoStats[0] || { total: 0, completed: 0, pending: 0, overdue: 0 }
        };
      })
    );

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users: usersWithStats,
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
    console.error('Admin get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

// Get user details with todos
exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get user's todos
    const todos = await Todo.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalTodos = await Todo.countDocuments({ userId });

    // Get user stats
    const stats = await Todo.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$dueDate', new Date()] },
                    { $ne: ['$status', 'completed'] }
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

    // Category and priority breakdown
    const categoryBreakdown = await Todo.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const priorityBreakdown = await Todo.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        user,
        todos,
        stats: stats[0] || { total: 0, completed: 0, pending: 0, inProgress: 0, overdue: 0 },
        categoryBreakdown,
        priorityBreakdown,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTodos / parseInt(limit)),
          total: totalTodos,
          hasNextPage: page < Math.ceil(totalTodos / parseInt(limit)),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Admin get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: error.message
    });
  }
};

// Update user (admin only)
exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { role, isActive } = req.body;

    // Prevent admin from deactivating themselves
    if (userId === req.user._id.toString() && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

// Get all todos (admin view)
exports.getAllTodos = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, priority, userId, search } = req.query;

    let query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (userId) query.userId = userId;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const todos = await Todo.find(query)
      .sort({ createdAt: -1 })
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
    console.error('Admin get todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch todos',
      error: error.message
    });
  }
};

// Generate reports
exports.getReports = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    // User activity report
    const userActivityReport = await User.aggregate([
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
          createdAt: 1,
          lastLogin: 1,
          isActive: 1,
          totalTodos: { $size: '$todos' },
          completedTodos: {
            $size: {
              $filter: {
                input: '$todos',
                cond: { $eq: ['$$this.status', 'completed'] }
              }
            }
          },
          recentActivity: {
            $size: {
              $filter: {
                input: '$todos',
                cond: { $gte: ['$$this.createdAt', sevenDaysAgo] }
              }
            }
          }
        }
      },
      { $sort: { totalTodos: -1 } }
    ]);

    // Productivity trends
    const productivityTrends = await Todo.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
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
            },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count'
            }
          },
          totalTodos: { $sum: '$count' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // System performance metrics
    const performanceMetrics = {
      totalUsers: await User.countDocuments(),
      activeUsers: await User.countDocuments({ isActive: true }),
      totalTodos: await Todo.countDocuments(),
      completionRate: await Todo.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            rate: {
              $round: [
                { $multiply: [{ $divide: ['$completed', '$total'] }, 100] },
                2
              ]
            }
          }
        }
      ]),
      avgTodosPerUser: await Todo.aggregate([
        {
          $group: {
            _id: '$userId',
            todoCount: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: null,
            avgTodos: { $avg: '$todoCount' }
          }
        }
      ])
    };

    res.json({
      success: true,
      data: {
        userActivityReport,
        productivityTrends,
        performanceMetrics: {
          ...performanceMetrics,
          completionRate: performanceMetrics.completionRate[0]?.rate || 0,
          avgTodosPerUser: Math.round(performanceMetrics.avgTodosPerUser[0]?.avgTodos || 0)
        },
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate reports',
      error: error.message
    });
  }
};