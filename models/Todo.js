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
    enum: ['Work', 'Personal', 'Health', 'Education', 'Shopping', 'Other'],
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

// Virtual for checking if todo is overdue
todoSchema.virtual('isOverdue').get(function() {
  if (this.status === 'completed') return false;
  return new Date() > this.dueDate;
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
todoSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
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

module.exports = mongoose.model('Todo', todoSchema);