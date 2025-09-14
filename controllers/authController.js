const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken, authenticateToken, rateLimit } = require('../middleware/auth');
const { 
  validateUserRegistration, 
  validateUserLogin,
  validateUserUpdate 
} = require('../middleware/validation');

const router = express.Router();

exports.register = async (req, res) => {
    try {
        const { username, email, password, role = 'user' } = req.body;
        const existingUser = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: existingUser.email === email 
                    ? 'User with this email already exists'
                    : 'Username already taken'
            });
        }

        const user = new User({ username, email, password, role });
        await user.save();
        const token = generateToken(user._id, user.role);
        await user.updateLastLogin();

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    createdAt: user.createdAt
                }
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: process.env.NODE_ENV === 'development' ? error.message : {}
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated. Please contact administrator.'
            });
        }

        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = generateToken(user._id, user.role);
        await user.updateLastLogin();

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    lastLogin: user.lastLogin
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: process.env.NODE_ENV === 'development' ? error.message : {}
        });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .populate('todos', 'title status dueDate category priority');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: { user }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : {}
        });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { username, email, currentPassword, newPassword } = req.body;
        const userId = req.user._id;
        const user = await User.findById(userId).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (username || email) {
            const existingUser = await User.findOne({
                _id: { $ne: userId },
                $or: [
                    ...(username ? [{ username }] : []),
                    ...(email ? [{ email }] : [])
                ]
            });

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: existingUser.username === username
                        ? 'Username already taken'
                        : 'Email already in use'
                });
            }
        }

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is required'
                });
            }

            const isCurrentPasswordValid = await user.comparePassword(currentPassword);
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            user.password = newPassword;
        }

        if (username) user.username = username;
        if (email) user.email = email;

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    updatedAt: user.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: process.env.NODE_ENV === 'development' ? error.message : {}
        });
    }
};

exports.logout = (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Logout successful. Please remove the token from client storage.'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
};

exports.validateToken = (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Token is valid',
            data: {
                user: {
                    id: req.user._id,
                    username: req.user.username,
                    email: req.user.email,
                    role: req.user.role
                }
            }
        });
    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Token validation failed'
        });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id;

        if (req.user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete the last admin account'
                });
            }
        }

        await User.findByIdAndUpdate(userId, { 
            isActive: false,
            updatedAt: new Date()
        });

        res.json({
            success: true,
            message: 'Account deactivated successfully'
        });
    } catch (error) {
        console.error('Account deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete account',
            error: process.env.NODE_ENV === 'development' ? error.message : {}
        });
    }
};