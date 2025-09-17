const User = require('../models/User');
const Todo = require('../models/Todo');

// Admin Dashboard with Enhanced Analytics
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    // Basic counts
    const totalUsers = await User.countDocuments({ isActive: true });
    const totalTodos = await Todo.countDocuments();
    const completedTodos = await Todo.countDocuments({ status: 'completed' });
    const overdueTodos = await Todo.countDocuments({
      dueDate: { $lt: now },
      status: { $ne: 'completed' }
    });

    // Recent activity (last 7 days)
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    const recentTodos = await Todo.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Previous week activity (for comparison)
    const previousWeekTodos = await Todo.countDocuments({
      createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
    });

    // Average tasks per user (last 7 days)
    const avgTasksPerUser = await Todo.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: '$userId',
          taskCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          avgTasks: { $avg: '$taskCount' },
          totalUsers: { $sum: 1 }
        }
      }
    ]);

    // Todo status distribution (for pie chart)
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

    // Daily activity for last 30 days (for line/bar chart)
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

    // Weekly comparison data
    const weeklyComparison = {
      currentWeek: recentTodos,
      previousWeek: previousWeekTodos,
      growth: previousWeekTodos > 0 
        ? Math.round(((recentTodos - previousWeekTodos) / previousWeekTodos) * 100)
        : recentTodos > 0 ? 100 : 0
    };

    // Most active users (with task completion rates)
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
        $match: {
          'user.isActive': true
        }
      },
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

    // Task assignment statistics (tasks assigned by admins)
    const assignmentStats = await Todo.aggregate([
      {
        $match: {
          assignedBy: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedBy',
          assignedCount: { $sum: 1 },
          completedAssignments: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'admin'
        }
      },
      { $unwind: '$admin' },
      {
        $project: {
          adminName: '$admin.username',
          assignedCount: 1,
          completedAssignments: 1,
          assignmentCompletionRate: {
            $round: [
              { $multiply: [{ $divide: ['$completedAssignments', '$assignedCount'] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { assignedCount: -1 } }
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
          completionRate: totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0,
          avgTasksPerUser: avgTasksPerUser[0] ? Math.round(avgTasksPerUser[0].avgTasks * 100) / 100 : 0
        },
        charts: {
          statusStats,
          categoryStats,
          priorityStats,
          dailyActivity,
          activeUsers,
          assignmentStats
        },
        trends: {
          weeklyComparison,
          growthRate: weeklyComparison.growth
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

// Get all users with enhanced filtering
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
              },
              assigned: {
                $sum: { $cond: [{ $ne: ['$assignedBy', null] }, 1, 0] }
              }
            }
          }
        ]);

        return {
          ...user.toObject(),
          stats: todoStats[0] || { 
            total: 0, 
            completed: 0, 
            pending: 0, 
            inProgress: 0, 
            overdue: 0, 
            assigned: 0 
          }
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


exports.addUser = async (req, res) => {
try {
    const { username, email, password, role } = req.body;
    let profileImage = null;

    if (req.file) {
      profileImage = {
        url: req.file.path,
        public_id: req.file.filename
      };
    }

    const newUser = new User({
      username,
      email,
      password,
      role,
      profileImage
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'User added successfully',
      data: newUser
    });
  } catch (error) {
    console.error('Admin add user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add user',
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
      .populate('assignedBy', 'username email')
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
          },
          assigned: {
            $sum: { $cond: [{ $ne: ['$assignedBy', null] }, 1, 0] }
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

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentActivity = await Todo.aggregate([
      { 
        $match: { 
          userId: user._id,
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

    res.json({
      success: true,
      data: {
        user,
        todos,
        stats: stats[0] || { 
          total: 0, 
          completed: 0, 
          pending: 0, 
          inProgress: 0, 
          overdue: 0,
          assigned: 0 
        },
        categoryBreakdown,
        priorityBreakdown,
        recentActivity,
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

// Get all todos (admin view) with enhanced filtering
exports.getAllTodos = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      category, 
      priority, 
      userId, 
      search,
      assignedBy,
      isAssigned
    } = req.query;

    let query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (userId) query.userId = userId;
    if (assignedBy) query.assignedBy = assignedBy;
    if (isAssigned !== undefined) {
      query.assignedBy = isAssigned === 'true' ? { $ne: null } : null;
    }
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
      .populate('userId', 'username email profileImage')
      .populate('assignedBy', 'username email');

    const total = await Todo.countDocuments(query);

    // Get summary stats for current filter
    const filterStats = await Todo.aggregate([
      { $match: query },
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

    res.json({
      success: true,
      data: {
        todos,
        stats: filterStats[0] || { total: 0, completed: 0, pending: 0, inProgress: 0, overdue: 0 },
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

// Generate comprehensive reports
exports.getReports = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));

    // User activity report with enhanced metrics
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
                cond: { $eq: ['$this.status', 'completed'] }
              }
            }
          },
          overdueTodos: {
            $size: {
              $filter: {
                input: '$todos',
                cond: {
                  $and: [
                    { $lt: ['$this.dueDate', new Date()] },
                    { $ne: ['$this.status', 'completed'] }
                  ]
                }
              }
            }
          },
          assignedTodos: {
            $size: {
              $filter: {
                input: '$todos',
                cond: { $ne: ['$this.assignedBy', null] }
              }
            }
          },
          recentActivity: {
            $size: {
              $filter: {
                input: '$todos',
                cond: { $gte: ['$this.createdAt', sevenDaysAgo] }
              }
            }
          },
          completionRate: {
            $round: [
              {
                $multiply: [
                  {
                    $cond: [
                      { $gt: [{ $size: '$todos' }, 0] },
                      {
                        $divide: [
                          {
                            $size: {
                              $filter: {
                                input: '$todos',
                                cond: { $eq: ['$this.status', 'completed'] }
                              }
                            }
                          },
                          { $size: '$todos' }
                        ]
                      },
                      0
                    ]
                  },
                  100
                ]
              },
              2
            ]
          }
        }
      },
      { $sort: { totalTodos: -1 } }
    ]);

    // Productivity trends with weekly comparison
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
      ]),
      avgTasksLast7Days: await Todo.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo }
          }
        },
        {
          $group: {
            _id: '$userId',
            taskCount: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: null,
            avgTasks: { $avg: '$taskCount' },
            totalUsers: { $sum: 1 }
          }
        }
      ])
    };

    // Assignment analytics
    const assignmentAnalytics = await Todo.aggregate([
      {
        $match: {
          assignedBy: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedBy',
          totalAssigned: { $sum: 1 },
          completedAssignments: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'admin'
        }
      },
      { $unwind: '$admin' },
      {
        $project: {
          adminName: '$admin.username',
          totalAssigned: 1,
          completedAssignments: 1,
          assignmentCompletionRate: {
            $round: [
              { $multiply: [{ $divide: ['$completedAssignments', '$totalAssigned'] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { totalAssigned: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        userActivityReport,
        productivityTrends,
        performanceMetrics: {
          ...performanceMetrics,
          completionRate: performanceMetrics.completionRate[0]?.rate || 0,
          avgTodosPerUser: Math.round(performanceMetrics.avgTodosPerUser[0]?.avgTodos || 0),
          avgTasksLast7Days: Math.round((performanceMetrics.avgTasksLast7Days[0]?.avgTasks || 0) * 100) / 100
        },
        assignmentAnalytics,
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

// Admin: Get users for assignment dropdown
exports.getUsersForAssignment = async (req, res) => {
  try {
    const users = await User.find({ isActive: true, role: 'user' })
      .select('_id username email profileImage')
      .sort({ username: 1 });

    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    console.error('Get users for assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

exports.getUsersForAssignment = async (req, res) => {
  try {
    const users = await User.find({
      isActive: true,
      role: { $ne: 'admin' } // Exclude admin users
    })
    .select('username email profileImage role createdAt')
    .sort({ username: 1 });

    res.json({
      success: true,
      data: {
        users: users,
        count: users.length
      }
    });

  } catch (error) {
    console.error('Error fetching users for assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};
          