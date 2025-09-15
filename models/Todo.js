const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Todo title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Work', 'Personal', 'Health', 'Education', 'Shopping', 'Home', 'Office', 'Other'],
    default: 'Personal'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for performance
todoSchema.index({ userId: 1 });
todoSchema.index({ status: 1 });
todoSchema.index({ dueDate: 1 });
todoSchema.index({ category: 1 });
todoSchema.index({ priority: 1 });
todoSchema.index({ assignedBy: 1 });

// Text search index for title and description
todoSchema.index({ 
  title: 'text', 
  description: 'text' 
}, {
  weights: { title: 10, description: 1 },
  name: 'text_search_index'
});

// Virtual for checking if todo is overdue
todoSchema.virtual('isOverdue').get(function() {
  if (this.status === 'completed') return false;
  return new Date() > this.dueDate;
});

// Virtual for checking if todo is assigned by admin
todoSchema.virtual('isAssigned').get(function() {
  return this.assignedBy !== null;
});

// Virtual for days until due
todoSchema.virtual('daysUntilDue').get(function() {
  if (this.status === 'completed') return null;
  const now = new Date();
  const diffTime = this.dueDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware
todoSchema.pre('save', function(next) {
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (this.status !== 'completed') {
    this.completedAt = null;
  }
  next();
});

// Static methods
todoSchema.statics.findByUser = function(userId, options = {}) {
  const query = { userId };
  return this.find(query).sort(options.sort || { createdAt: -1 });
};

todoSchema.statics.findOverdue = function(userId = null) {
  const query = {
    dueDate: { $lt: new Date() },
    status: { $ne: 'completed' }
  };
  if (userId) query.userId = userId;
  return this.find(query).sort({ dueDate: 1 });
};

todoSchema.statics.findByStatus = function(status, userId = null) {
  const query = { status };
  if (userId) query.userId = userId;
  return this.find(query).sort({ createdAt: -1 });
};

todoSchema.statics.findTodaysTodos = function(userId = null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const query = {
    dueDate: { $gte: today, $lt: tomorrow },
    status: { $ne: 'completed' }
  };
  if (userId) query.userId = userId;
  return this.find(query).sort({ dueDate: 1 });
};

todoSchema.statics.findAssignedTodos = function(assignedByUserId) {
  return this.find({ assignedBy: assignedByUserId })
    .populate('userId', 'username email profileImage')
    .sort({ createdAt: -1 });
};

// Search todos by text
todoSchema.statics.searchTodos = function(searchQuery, userId = null) {
  const query = {
    $text: { $search: searchQuery }
  };
  if (userId) query.userId = userId;
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

// Get analytics data
todoSchema.statics.getAnalytics = async function(userId = null, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const matchQuery = userId ? { userId } : {};
  
  const pipeline = [
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
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
        recentTodos: {
          $sum: { $cond: [{ $gte: ['$createdAt', startDate] }, 1, 0] }
        }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

module.exports = mongoose.model('Todo', todoSchema);