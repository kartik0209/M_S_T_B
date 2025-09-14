const Todo = require('../models/Todo');
const User = require('../models/User');

const todoController = {
    async getTodos(req, res) {
        try {
            const userId = req.user._id;
            const {
                q: searchQuery,
                category,
                status,
                priority,
                page = 1,
                limit = 20,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = req.query;

            let query = { userId };
            if (category) query.category = category;
            if (status) query.status = status;
            if (priority) query.priority = priority;
            if (searchQuery) {
                query.$or = [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } }
                ];
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const sortOptions = {};
            sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const todos = await Todo.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
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
            console.error('Get todos error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch todos',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async getTodaysTodos(req, res) {
        try {
            const userId = req.user._id;
            const todaysTodos = await Todo.findTodaysTodos(userId)
                .populate('assignedByUser', 'username email');
            res.json({ success: true, data: { todos: todaysTodos } });
        } catch (error) {
            console.error('Get today\'s todos error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch today\'s todos',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async getOverdueTodos(req, res) {
        try {
            const userId = req.user._id;
            const overdueTodos = await Todo.findOverdue(userId)
                .populate('assignedByUser', 'username email');
            res.json({ success: true, data: { todos: overdueTodos } });
        } catch (error) {
            console.error('Get overdue todos error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch overdue todos',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async getCompletedTodos(req, res) {
        try {
            const userId = req.user._id;
            const { page = 1, limit = 20 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const completedTodos = await Todo.findCompleted(userId)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('assignedByUser', 'username email');

            const total = await Todo.countDocuments({ userId, status: 'Completed' });
            const totalPages = Math.ceil(total / parseInt(limit));

            res.json({
                success: true,
                data: {
                    todos: completedTodos,
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
            console.error('Get completed todos error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch completed todos',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async getAllTodos(req, res) {
        try {
            const userId = req.user._id;
            const { page = 1, limit = 20 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const todos = await Todo.find({ userId, status: { $ne: 'Completed' } })
                .sort({ dueDate: 1, priority: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('assignedByUser', 'username email');

            const total = await Todo.countDocuments({ userId, status: { $ne: 'Completed' } });
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
            console.error('Get all todos error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch all todos',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async searchTodos(req, res) {
        try {
            const userId = req.user._id;
            const { q: searchQuery, page = 1, limit = 20 } = req.query;

            if (!searchQuery) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query is required'
                });
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);

            const todos = await Todo.searchTodos(searchQuery, userId)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('assignedByUser', 'username email');

            const totalQuery = await Todo.searchTodos(searchQuery, userId);
            const total = totalQuery.length;
            const totalPages = Math.ceil(total / parseInt(limit));

            res.json({
                success: true,
                data: {
                    todos,
                    searchQuery,
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
            console.error('Search todos error:', error);
            res.status(500).json({
                success: false,
                message: 'Search failed',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async getTodoById(req, res) {
        try {
            const todo = await Todo.findById(req.params.id)
                .populate('userId', 'username email')
                .populate('assignedByUser', 'username email');

            if (!todo) {
                return res.status(404).json({
                    success: false,
                    message: 'Todo not found'
                });
            }

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
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async createTodo(req, res) {
        try {
            const { title, description, dueDate, category, priority, userId: targetUserId } = req.body;
            let actualUserId = req.user._id;
            let assignedBy = null;

            if (targetUserId && req.user.role === 'admin') {
                const targetUser = await User.findById(targetUserId);
                if (!targetUser) {
                    return res.status(404).json({
                        success: false,
                        message: 'Target user not found'
                    });
                }
                actualUserId = targetUserId;
                assignedBy = req.user._id;
            } else if (targetUserId && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can create todos for other users'
                });
            }

            const todo = new Todo({
                title,
                description,
                dueDate: new Date(dueDate),
                category,
                priority: priority || 'Medium',
                userId: actualUserId,
                assignedBy
            });

            await todo.save();
            await todo.populate('userId', 'username email');
            await todo.populate('assignedByUser', 'username email');

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
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async updateTodo(req, res) {
        try {
            const todo = await Todo.findById(req.params.id);

            if (!todo) {
                return res.status(404).json({
                    success: false,
                    message: 'Todo not found'
                });
            }

            if (!todo.isOwnedBy(req.user._id) && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            const { title, description, dueDate, category, priority, status } = req.body;
            if (title !== undefined) todo.title = title;
            if (description !== undefined) todo.description = description;
            if (dueDate !== undefined) todo.dueDate = new Date(dueDate);
            if (category !== undefined) todo.category = category;
            if (priority !== undefined) todo.priority = priority;
            if (status !== undefined) todo.status = status;

            await todo.save();
            await todo.populate('userId', 'username email');
            await todo.populate('assignedByUser', 'username email');

            res.json({
                success: true,
                message: 'Todo updated successfully',
                data: { todo }
            });
        } catch (error) {
            console.error('Update todo error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update todo',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async completeTodo(req, res) {
        try {
            const todo = await Todo.findById(req.params.id);

            if (!todo) {
                return res.status(404).json({
                    success: false,
                    message: 'Todo not found'
                });
            }

            if (!todo.isOwnedBy(req.user._id) && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            await todo.markCompleted();

            res.json({
                success: true,
                message: 'Todo marked as completed',
                data: { todo }
            });
        } catch (error) {
            console.error('Complete todo error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to complete todo',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async deleteTodo(req, res) {
        try {
            const todo = await Todo.findById(req.params.id);

            if (!todo) {
                return res.status(404).json({
                    success: false,
                    message: 'Todo not found'
                });
            }

            if (!todo.isOwnedBy(req.user._id) && req.user.role !== 'admin') {
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
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    },

    async getStatsSummary(req, res) {
        try {
            const userId = req.user._id;

            const stats = await Todo.aggregate([
                { $match: { userId: userId } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        pending: {
                            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
                        },
                        inProgress: {
                            $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] }
                        },
                        completed: {
                            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
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

            const categoryStats = await Todo.aggregate([
                { $match: { userId: userId } },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            const priorityStats = await Todo.aggregate([
                { $match: { userId: userId } },
                {
                    $group: {
                        _id: '$priority',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            res.json({
                success: true,
                data: {
                    summary: stats[0] || {
                        total: 0,
                        pending: 0,
                        inProgress: 0,
                        completed: 0,
                        overdue: 0
                    },
                    categoryStats,
                    priorityStats
                }
            });
        } catch (error) {
            console.error('Get todo stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch todo statistics',
                error: process.env.NODE_ENV === 'development' ? error.message : {}
            });
        }
    }
};

module.exports = todoController;
