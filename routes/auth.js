const express = require('express');
const { User } = require('../models');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Login validation middleware
const validateLogin = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').trim().notEmpty().withMessage('Password is required')
];

// @route   POST /api/auth/login
// @desc    Login user and create session
// @access  Public
router.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find the user
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.name = user.name;

    // Store token in localStorage as well
    const token = Buffer.from(`${user.id}:${user.username}:${Date.now()}`).toString('base64');

    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        token: token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/logout
// @desc    Logout user and destroy session
// @access  Public
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to logout' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// @route   POST /api/auth/logout
// @desc    Logout user and destroy session (POST version)
// @access  Public
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to logout' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  res.json({
    id: req.session.userId,
    username: req.session.username,
    name: req.session.name
  });
});

module.exports = router; 