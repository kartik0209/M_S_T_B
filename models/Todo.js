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
    enum: ['Home', 'Personal', 'Office', 'Health', 'Education', 'Shopping', 'Other'],
    default: 'Personal'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // Will be set if assigned by admin
  },
  completedAt: {
    type: Date,
    default: null
  },
  isOverdue: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
todoSchema.index({ userId: 1 });
todoSchema.index({ status: 1 });
todoSchema.index({ dueDate: 1 });
todoSchema.index({ category: 1 });
todoSchema.index({ priority: 1 });
todoSchema.index({ createdAt: -1 });
todoSchema.index({ userId: 1, status: 1 });
todoSchema.index({ userId: 1, dueDate: 1 });

// Virtual for checking if todo is overdue
todoSchema.virtual('isOverdueVirtual').get(function() {
  if (this.status === 'Completed' || this.status === 'Cancelled') {
    return false;
  }
  return new Date() > this.dueDate;
});

// Virtual for user details
todoSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for assigned by user details
todoSchema.virtual('assignedByUser', {
  ref: 'User',
  localField: 'assignedBy',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to update updatedAt and handle completion
todoSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Set completedAt when status changes to Completed
  if (this.status === 'Completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  // Clear completedAt if status changes from Completed
  if (this.status !== 'Completed' && this.completedAt) {
    this.completedAt = null;
  }
  
  // Update isOverdue field
  if (this.status !== 'Completed' && this.status !== 'Cancelled') {
    this.isOverdue = new Date() > this.dueDate;
  } else {
    this.isOverdue = false;
  }
  
  next();
});

// Static method to find todos by user
todoSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

// Static method to find overdue todos
todoSchema.statics.findOverdue = function(userId = null) {
  const query = {
    dueDate: { $lt: new Date() },
    status: { $nin: ['Completed', 'Cancelled'] }
  };
  
  if (userId) {
    query.userId = userId;
  }
  
  return this.find(query).sort({ dueDate: 1 });
};

// Static method to find today's todos
todoSchema.statics.findTodaysTodos = function(userId = null) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  
  const query = {
    dueDate: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  };
  
  if (userId) {
    query.userId = userId;
  }
  
  return this.find(query).sort({ dueDate: 1 });
};

// Static method to find completed todos
todoSchema.statics.findCompleted = function(userId = null) {
  const query = { status: 'Completed' };
  
  if (userId) {
    query.userId = userId;
  }
  
  return this.find(query).sort({ completedAt: -1 });
};

// Static method to find todos by date range
todoSchema.statics.findByDateRange = function(startDate, endDate, userId = null) {
  const query = {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  if (userId) {
    query.userId = userId;
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

// Static method for search
todoSchema.statics.searchTodos = function(searchTerm, userId = null) {
  const query = {
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { category: { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  if (userId) {
    query.userId = userId;
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

// Instance method to mark as completed
todoSchema.methods.markCompleted = async function() {
  this.status = 'Completed';
  this.completedAt = new Date();
  this.isOverdue = false;
  return await this.save();
};

// Instance method to check if user owns this todo
todoSchema.methods.isOwnedBy = function(userId) {
  return this.userId.toString() === userId.toString();
};

module.exports = mongoose.model('Todo', todoSchema);