const { Sequelize } = require('sequelize');
const config = require('../config/database');

const sequelize = new Sequelize({
  dialect: config.dialect,
  storage: config.storage,
  logging: config.logging,
  pool: config.pool
});

const db = {
  sequelize,
  Sequelize,
  User: require('./User')(sequelize, Sequelize),
  Customer: require('./Customer')(sequelize, Sequelize),
  Payment: require('./Payment')(sequelize, Sequelize),
  Document: require('./Document')(sequelize, Sequelize),
};

// Define relationships
db.Customer.hasMany(db.Payment, { foreignKey: 'customerId', as: 'Payments' });
db.Payment.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'Customer' });

db.Customer.hasMany(db.Document, { foreignKey: 'customerId', as: 'Documents' });
db.Document.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'Customer' });

module.exports = db; 