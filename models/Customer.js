const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Customer = sequelize.define('Customer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: false
    },
    driverIdPath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    passportPhotoPath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    photoUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    creationDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    // Car Details
    carBrand: {
      type: DataTypes.STRING,
      allowNull: false
    },
    carModel: {
      type: DataTypes.STRING,
      allowNull: false
    },
    carYear: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Financial Details
    carPurchaseCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    },
    leasingAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    monthlyInstallment: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    leaseDuration: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    leaseStartDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    totalPaid: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    lastPaymentDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'completed', 'overdue'),
      defaultValue: 'active'
    }
  });

  // Calculate profit
  Customer.prototype.calculateProfit = function() {
    return (this.monthlyInstallment * this.leaseDuration) - this.leasingAmount;
  };

  // Calculate remaining balance
  Customer.prototype.calculateRemainingBalance = function() {
    return (this.monthlyInstallment * this.leaseDuration) - this.totalPaid;
  };

  Customer.associate = (models) => {
    Customer.hasMany(models.Payment, {
      foreignKey: 'customerId',
      as: 'Payments'
    });
  };

  return Customer;
}; 