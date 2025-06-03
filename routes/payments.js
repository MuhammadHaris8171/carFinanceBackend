const express = require('express');
const { Payment, Customer } = require('../models');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Sequelize } = require('sequelize');

const router = express.Router();

// Check session middleware
const checkSession = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

// Configure multer for payment proof uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `payment_${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const uploadMulter = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Get all payments
router.get('/', checkSession, async (req, res) => {
  try {
    const { status, startDate, endDate, customerId } = req.query;
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (startDate || endDate) {
      where.dueDate = {};
      if (startDate) {
        where.dueDate[Sequelize.Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.dueDate[Sequelize.Op.lte] = new Date(endDate);
      }
    }

    if (customerId) {
      where.customerId = customerId;
    }

    const payments = await Payment.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'Customer',
          attributes: ['fullName', 'phoneNumber']
        }
      ],
      order: [['dueDate', 'ASC']]
    });

    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get customer payments
router.get('/customer/:customerId', checkSession, async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: { customerId: req.params.customerId },
      order: [['dueDate', 'ASC']]
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching customer payments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark payment as paid
router.post('/:id/pay', checkSession, uploadMulter.single('proof'), [
  body('paymentDate').optional().isISO8601().withMessage('Invalid payment date'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payment = await Payment.findByPk(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const updateData = {
      status: 'paid',
      paymentDate: req.body.paymentDate || new Date(),
      notes: req.body.notes
    };

    if (req.file) {
      updateData.proofOfPaymentPath = '/uploads/' + path.basename(req.file.path);
    }

    await payment.update(updateData);

    // Update customer total paid amount
    const customer = await Customer.findByPk(payment.customerId);
    if (customer) {
      await customer.update({
        totalPaid: parseFloat(customer.totalPaid) + parseFloat(payment.amount),
        lastPaymentDate: new Date()
      });

      // Check if all payments are completed
      const pendingPayments = await Payment.count({
        where: { 
          customerId: payment.customerId,
          status: 'pending'
        }
      });

      if (pendingPayments === 0) {
        await customer.update({ status: 'completed' });
      }
    }

    res.json({
      message: 'Payment marked as paid',
      payment
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Early close-out
router.post('/customer/:customerId/closeout', checkSession, uploadMulter.single('proof'), async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const unpaidPayments = await Payment.findAll({
      where: {
        customerId: customer.id,
        status: 'pending',
      },
    });

    const totalRemaining = unpaidPayments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    
    let proofOfPaymentPath = null;
    if (req.file) {
      proofOfPaymentPath = '/uploads/' + path.basename(req.file.path);
    }

    // Create a single payment for the remaining amount
    await Payment.create({
      customerId: customer.id,
      amount: totalRemaining,
      dueDate: new Date(),
      status: 'paid',
      paymentDate: new Date(),
      proofOfPaymentPath,
      notes: 'Early close-out payment',
      isEarlyCloseout: true
    });

    // Mark all remaining payments as paid
    await Payment.update(
      { 
        status: 'paid', 
        paymentDate: new Date(),
        isEarlyCloseout: true,
        notes: 'Part of early close-out'
      },
      {
        where: {
          customerId: customer.id,
          status: 'pending',
        },
      }
    );

    // Update customer status and total paid
    await customer.update({ 
      status: 'completed',
      totalPaid: parseFloat(customer.totalPaid) + totalRemaining,
      lastPaymentDate: new Date()
    });

    res.json({ 
      message: 'Early close-out completed',
      amount: totalRemaining
    });
  } catch (error) {
    console.error('Early close-out error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get overdue payments
router.get('/overdue', checkSession, async (req, res) => {
  try {
    const today = new Date();
    
    const overduePayments = await Payment.findAll({
      where: {
        status: 'pending',
        dueDate: {
          [Sequelize.Op.lt]: today
        }
      },
      include: [
        {
          model: Customer,
          as: 'Customer',
          attributes: ['fullName', 'phoneNumber']
        }
      ],
      order: [['dueDate', 'ASC']]
    });
    
    res.json(overduePayments);
  } catch (error) {
    console.error('Error fetching overdue payments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update payment status to overdue for late payments
router.post('/update-overdue', checkSession, async (req, res) => {
  try {
    const today = new Date();
    
    const latePayments = await Payment.findAll({
      where: {
        status: 'pending',
        dueDate: {
          [Sequelize.Op.lt]: today
        }
      }
    });

    // Update payments to overdue
    for (const payment of latePayments) {
      await payment.update({ status: 'overdue' });
      
      // Also update customer status if they have overdue payments
      await Customer.update(
        { status: 'overdue' },
        { where: { id: payment.customerId } }
      );
    }

    res.json({ 
      message: `${latePayments.length} payments marked as overdue`
    });
  } catch (error) {
    console.error('Error updating overdue payments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get payment summary for a customer
router.get('/summary/:customerId', checkSession, async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    const payments = await Payment.findAll({
      where: { customerId: customer.id }
    });
    
    const totalPayments = payments.length;
    const paidPayments = payments.filter(p => p.status === 'paid').length;
    const pendingPayments = payments.filter(p => p.status === 'pending').length;
    const overduePayments = payments.filter(p => p.status === 'overdue').length;
    
    const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const paidAmount = payments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    const nextPayment = payments
      .filter(p => p.status === 'pending')
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    
    res.json({
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        leasingAmount: customer.leasingAmount,
        totalPaid: customer.totalPaid,
        status: customer.status
      },
      payments: {
        total: totalPayments,
        paid: paidPayments,
        pending: pendingPayments,
        overdue: overduePayments
      },
      financial: {
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount,
        profit: customer.calculateProfit()
      },
      nextPayment: nextPayment || null
    });
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Revert payment status (toggle between paid and pending)
router.post('/:id/revert', checkSession, [
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payment = await Payment.findByPk(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Get current status
    const currentStatus = payment.status;
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    
    // Prepare update data
    const updateData = {
      status: newStatus,
      notes: req.body.notes ? `${payment.notes || ''} [${new Date().toISOString()}] ${req.body.notes}` : payment.notes
    };
    
    // If changing to paid, set payment date
    if (newStatus === 'paid') {
      updateData.paymentDate = new Date();
    } else {
      // If changing to pending, clear payment date
      updateData.paymentDate = null;
    }

    // Update the payment
    await payment.update(updateData);

    // Update customer total paid amount
    const customer = await Customer.findByPk(payment.customerId);
    if (customer) {
      if (newStatus === 'paid') {
        // Add payment amount to customer total paid
        await customer.update({
          totalPaid: parseFloat(customer.totalPaid) + parseFloat(payment.amount),
          lastPaymentDate: new Date()
        });
      } else {
        // Subtract payment amount from customer total paid
        await customer.update({
          totalPaid: Math.max(0, parseFloat(customer.totalPaid) - parseFloat(payment.amount))
        });
      }

      // Check if all payments are completed
      const pendingPayments = await Payment.count({
        where: { 
          customerId: payment.customerId,
          status: 'pending'
        }
      });

      // Update customer status based on pending payments
      if (pendingPayments === 0) {
        await customer.update({ status: 'completed' });
      } else {
        await customer.update({ status: 'active' });
      }
    }

    res.json({
      message: `Payment ${newStatus === 'paid' ? 'marked as paid' : 'reverted to pending'}`,
      payment
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 