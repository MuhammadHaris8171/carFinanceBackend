const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Customers',
        key: 'id'
      }
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'overdue'),
      defaultValue: 'pending'
    },
    paymentDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    proofOfPaymentPath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isEarlyCloseout: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  });

  Payment.associate = (models) => {
    Payment.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'Customer'
    });
  };

  // Instance methods
  Payment.prototype.isOverdue = function() {
    return this.status === 'pending' && new Date(this.dueDate) < new Date();
  };

  Payment.prototype.markAsPaid = async function(paymentMethod = null, transactionId = null, notes = null) {
    return this.update({
      status: 'paid',
      paymentDate: new Date(),
      proofOfPaymentPath: paymentMethod || this.proofOfPaymentPath,
      notes: notes || this.notes
    });
  };

  return Payment;
}; 