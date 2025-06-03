const { Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');

// Import models
const defineUserModel = require('../models/User');
const defineCustomerModel = require('../models/Customer');
const definePaymentModel = require('../models/Payment');

// Database setup
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

// Initialize models
const models = [
  defineUserModel,
  defineCustomerModel,
  definePaymentModel
];

models.forEach(defineModel => defineModel(sequelize));

// Set up associations
Object.values(sequelize.models).forEach(model => {
  if (model.associate) {
    model.associate(sequelize.models);
  }
});

// Create initial user
async function initializeDatabase() {
  try {
    await sequelize.sync({ force: true }); // This will drop existing tables
    
    await sequelize.models.User.create({
      username: 'admin',
      password: 'admin123',
      name: 'System Administrator'
    });

    console.log('✅ Database initialized successfully');
    console.log('✅ Default user created:');
    console.log('Username: admin');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
}

initializeDatabase(); 