const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user by ID from token
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization failed'
    });
  }
};

// User authorization middleware (admin or own resource)
const requireOwnershipOrAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    // For regular users, check if they're accessing their own resources
    const userId = req.params.userId || req.body.userId;
    
    if (userId && userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - can only access own resources'
      });
    }

    next();
  } catch (error) {
    console.error('Ownership middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization failed'
    });
  }
};

// Generate JWT token
const generateToken = (userId, role = 'user') => {
  return jwt.sign(
    { 
      userId: userId,
      role: role,
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: '7d', // Token expires in 7 days
      issuer: 'todoapp',
      audience: 'todoapp-users'
    }
  );
};

// Verify token utility
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Optional authentication (for public routes that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next(); // Continue regardless of token validity
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};

// Rate limiting helper (basic implementation)
const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const currentTime = Date.now();
    
    if (!requests.has(clientId)) {
      requests.set(clientId, []);
    }
    
    const clientRequests = requests.get(clientId);
    
    // Remove old requests outside the window
    const validRequests = clientRequests.filter(
      requestTime => currentTime - requestTime < windowMs
    );
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later'
      });
    }
    
    validRequests.push(currentTime);
    requests.set(clientId, validRequests);
    
    next();
  };
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireOwnershipOrAdmin,
  generateToken,
  verifyToken,
  optionalAuth,
  rateLimit
};