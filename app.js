const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const { Sequelize } = require('sequelize');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const scheduler = require('./services/scheduler');
require('dotenv').config();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Create express app
const app = express();

// Database setup
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false,
});

// Load models
const modelDefiners = [
  require('./models/User'),
  require('./models/Customer'),
  require('./models/Payment')
];

// Initialize models
modelDefiners.forEach(modelDefiner => modelDefiner(sequelize));

// Set up associations
Object.values(sequelize.models).forEach(model => {
  if (model.associate) {
    model.associate(sequelize.models);
  }
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Session configuration
app.use(session({
  secret: 'car-financing-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Make multer available in routes
app.use((req, res, next) => {
  req.upload = upload;
  next();
});

// Make database connection available in routes
app.use((req, res, next) => {
  req.db = sequelize;
  next();
});

// Enhanced authentication middleware - checks both session and token
app.use((req, res, next) => {
  // Check if already authenticated via session
  if (req.session && req.session.userId) {
    return next();
  }

  // Check for Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    try {
      // Simple token validation (in a production app, use JWT or a more secure mechanism)
      if (token) {
        // For now, just extract the user ID from the token (first part before colon)
        const tokenParts = Buffer.from(token, 'base64').toString().split(':');
        if (tokenParts.length >= 2) {
          const userId = parseInt(tokenParts[0], 10);
          const username = tokenParts[1];
          
          // Store user info in session
          req.session.userId = userId;
          req.session.username = username;
          console.log(`User authenticated via token: ${username} (${userId})`);
        }
      }
    } catch (error) {
      console.error('Token validation error:', error);
    }
  }
  
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reports', require('./routes/reports'));

// Simple auth check middleware
const checkSession = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};

// Add an endpoint to check if user is authenticated
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ 
      authenticated: true, 
      user: { 
        id: req.session.userId,
        username: req.session.username,
        name: req.session.name
      } 
    });
  }
  res.json({ authenticated: false });
});

// Telegram Bot integration
let botInstance = null;

// Function to start the bot
function startBot() {
  try {
    // Only import and start the bot if it's not already running
    if (!botInstance) {
      console.log('Starting Telegram bot...');
      botInstance = require('./bot');
      console.log('Telegram bot started successfully');
    }
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
  }
}

// Add a route to check bot status
app.get('/api/bot/status', checkSession, (req, res) => {
  res.json({
    running: !!botInstance,
    botUsername: botInstance ? 'car_nihat_bot' : null
  });
});

// Add a route to start/stop the bot
app.post('/api/bot/toggle', checkSession, (req, res) => {
  if (botInstance) {
    // Stop the bot
    botInstance.stop('SIGINT');
    botInstance = null;
    res.json({ status: 'stopped', message: 'Bot has been stopped' });
  } else {
    // Start the bot
    startBot();
    res.json({ status: 'started', message: 'Bot has been started' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

// Start the server after syncing DB
const PORT = process.env.PORT || 5000;

// Regular sync after schema is updated
sequelize.sync()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log('📦 Connected to SQLite database');
      
      // Start the Telegram bot automatically when server starts
      startBot();
    });
    
    // Initialize payment reminder scheduler
    scheduler.initScheduler();
  })
  .catch(err => {
    console.error('❌ Unable to connect to the database:', err);
  });

module.exports = app;
