const { Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');
const path = require('path');

// Database setup
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
  logging: false,
});

// Define User model
const User = sequelize.define('User', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: Sequelize.STRING,
    allowNull: false
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  }
});

async function createAdminUser() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    // Create admin user
    const [user, created] = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        name: 'Administrator',
        password: hashedPassword
      }
    });

    if (created) {
      console.log('Admin user created successfully!');
      console.log('Username: admin');
      console.log('Password: admin123');
    } else {
      console.log('Admin user already exists.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser(); 