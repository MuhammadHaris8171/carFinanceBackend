const express = require('express');
const { Customer, Payment } = require('../models');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Sequelize } = require('sequelize');

const router = express.Router();

// Session-based auth middleware
const checkSession = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

// @route   GET /api/reports/summary
// @desc    Get financial summary
// @access  Private
router.get('/summary', async (req, res) => {
  try {
        req.db.get(`
            SELECT 
                COUNT(DISTINCT c.id) as total_customers,
                SUM(c.leasing_amount) as total_invested,
                SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END) as total_collected,
                SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END) as total_pending,
                COUNT(DISTINCT CASE WHEN EXISTS (
                    SELECT 1 FROM payments p2 
                    WHERE p2.customer_id = c.id 
                    AND p2.status = 'pending' 
                    AND p2.due_date < date('now')
                ) THEN c.id END) as overdue_customers,
                COUNT(DISTINCT CASE WHEN NOT EXISTS (
                    SELECT 1 FROM payments p2 
                    WHERE p2.customer_id = c.id 
                    AND p2.status = 'pending'
                ) THEN c.id END) as completed_customers
            FROM customers c
            LEFT JOIN payments p ON c.id = p.customer_id
        `, [], (err, summary) => {
            if (err) {
                console.error('Error fetching financial summary:', err);
                return res.status(500).json({ message: 'Error fetching financial summary' });
            }

            // Calculate total profit
            const totalProfit = (summary.total_collected || 0) - (summary.total_invested || 0);
            summary.total_profit = totalProfit;

            res.json(summary);
        });
    } catch (err) {
        console.error('Error in get financial summary route:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/reports/monthly
// @desc    Get monthly report
// @access  Private
router.get('/monthly', checkSession, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    // Get all payments with their customers
    const payments = await Payment.findAll({
      include: [{ model: Customer, as: 'Customer' }],
      attributes: [
        [Sequelize.fn('strftime', '%Y-%m', Sequelize.col('dueDate')), 'period'],
        [Sequelize.fn('COUNT', Sequelize.col('Payment.id')), 'total_payments'],
        [Sequelize.fn('SUM', 
          Sequelize.literal("CASE WHEN Payment.status = 'paid' THEN Payment.amount ELSE 0 END")), 
          'collected_amount'
        ],
        [Sequelize.fn('SUM', 
          Sequelize.literal("CASE WHEN Payment.status = 'pending' AND Payment.dueDate <= date('now') THEN Payment.amount ELSE 0 END")), 
          'overdue_amount'
        ],
        [Sequelize.fn('COUNT', 
          Sequelize.literal("CASE WHEN Payment.status = 'pending' AND Payment.dueDate <= date('now') THEN 1 END")), 
          'overdue_payments'
        ],
        [Sequelize.fn('COUNT', 
          Sequelize.literal("CASE WHEN Payment.status = 'paid' THEN 1 END")), 
          'completed_payments'
        ]
      ],
      group: [Sequelize.fn('strftime', '%Y-%m', Sequelize.col('dueDate'))],
      order: [[Sequelize.literal('period'), 'DESC']]
    });
    
    res.json(payments);
  } catch (error) {
    console.error('Error in get monthly report route:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/customers
// @desc    Get customer report with filters
// @access  Private
router.get('/customers', async (req, res) => {
    const { status, search, car_brand } = req.query;
    
    try {
        let conditions = ['1=1'];
        let params = [];

        if (status) {
            if (status === 'overdue') {
                conditions.push(`EXISTS (
                    SELECT 1 FROM payments p2 
                    WHERE p2.customer_id = c.id 
                    AND p2.status = 'pending' 
                    AND p2.due_date < date('now')
                )`);
            } else if (status === 'completed') {
                conditions.push(`NOT EXISTS (
                    SELECT 1 FROM payments p2 
                    WHERE p2.customer_id = c.id 
                    AND p2.status = 'pending'
                )`);
            }
        }

        if (search) {
            conditions.push('(c.full_name LIKE ? OR c.phone_number LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
      }

        if (car_brand) {
            conditions.push('c.car_brand = ?');
            params.push(car_brand);
        }

        const query = `
            SELECT 
                c.*,
                COUNT(p.id) as total_payments,
                COUNT(CASE WHEN p.status = 'paid' THEN 1 END) as payments_made,
                SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END) as total_paid,
                SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END) as remaining_amount,
                MAX(CASE WHEN p.status = 'paid' THEN p.payment_date END) as last_payment_date,
                MIN(CASE WHEN p.status = 'pending' THEN p.due_date END) as next_due_date
            FROM customers c
            LEFT JOIN payments p ON c.id = p.customer_id
            WHERE ${conditions.join(' AND ')}
            GROUP BY c.id
            ORDER BY c.creation_date DESC
        `;

        req.db.all(query, params, (err, customers) => {
            if (err) {
                console.error('Error fetching customer report:', err);
                return res.status(500).json({ message: 'Error fetching customer report' });
            }
            res.json(customers);
        });
    } catch (err) {
        console.error('Error in get customer report route:', err);
        res.status(500).json({ message: 'Server error' });
      }
    });

// @route   GET /api/reports/car-brands
// @desc    Get report grouped by car brands
// @access  Private
router.get('/car-brands', checkSession, async (req, res) => {
  try {
    const carBrands = await Customer.findAll({
      attributes: [
        'carBrand',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_cars'],
        [Sequelize.fn('SUM', Sequelize.col('leasingAmount')), 'total_leasing_amount'],
        [Sequelize.fn('AVG', Sequelize.col('monthlyInstallment')), 'avg_monthly_installment']
      ],
      group: ['carBrand'],
      order: [[Sequelize.literal('total_cars'), 'DESC']]
    });
    
    res.json(carBrands);
  } catch (error) {
    console.error('Error in get car brands report route:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get filtered reports
router.get('/filtered', checkSession, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      customerName,
      carBrand,
      paymentStatus,
    } = req.query;

    const whereClause = {};
    const customerWhereClause = {};

    if (startDate && endDate) {
      whereClause.dueDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    if (customerName) {
      customerWhereClause.name = {
        [Op.iLike]: `%${customerName}%`,
      };
    }

    if (carBrand) {
      customerWhereClause.carBrand = {
        [Op.iLike]: `%${carBrand}%`,
      };
    }

    if (paymentStatus) {
      whereClause.status = paymentStatus;
    }

    const payments = await Payment.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          where: customerWhereClause,
          attributes: ['name', 'phone', 'carBrand', 'carModel'],
        },
      ],
      order: [['dueDate', 'ASC']],
    });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get customer payment history
router.get('/customer/:customerId/history', checkSession, async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: { customerId: req.params.customerId },
      order: [['dueDate', 'ASC']],
    });

    const history = {
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      paidAmount: payments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0),
      remainingAmount: payments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + p.amount, 0),
      payments,
    };

    res.json(history);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/dashboard', checkSession, async (req, res) => {
  try {
    // Add proper error handling with defaults for each operation
    const totalCustomers = await Customer.count() || 0;
    const activeLeases = await Customer.count({ where: { status: 'active' } }) || 0;
    
    let monthlyPayments = 0;
    try {
      monthlyPayments = await Customer.sum('monthlyInstallment', { where: { status: 'active' } }) || 0;
    } catch (error) {
      console.error('Error calculating monthly payments:', error);
    }
    
    const overduePayments = await Payment.count({ where: { status: 'overdue' } }) || 0;
    
    let totalInvested = 0;
    try {
      totalInvested = await Customer.sum('leasingAmount') || 0;
    } catch (error) {
      console.error('Error calculating total invested:', error);
    }
    
    let totalCollected = 0;
    try {
      totalCollected = await Customer.sum('totalPaid') || 0;
    } catch (error) {
      console.error('Error calculating total collected:', error);
    }
    
    const totalProfit = totalCollected - totalInvested;
    const fullyPaidCustomers = await Customer.count({ where: { status: 'completed' } }) || 0;

    // Calculate total unpaid with better error handling
    let totalUnpaid = 0;
    try {
      const customers = await Customer.findAll({ where: { status: ['active', 'overdue'] } });
      
      for (const customer of customers) {
        if (customer && typeof customer.calculateRemainingBalance === 'function') {
          const remainingBalance = customer.calculateRemainingBalance();
          if (!isNaN(remainingBalance)) {
            totalUnpaid += remainingBalance;
          }
        } else {
          // fallback: calculate from payments
          const payments = await Payment.findAll({ 
            where: { 
              customerId: customer.id, 
              status: { [Op.in]: ['pending', 'overdue'] } 
            } 
          });
          
          payments.forEach(payment => {
            if (payment && payment.amount) {
              const amount = parseFloat(payment.amount);
              if (!isNaN(amount)) {
                totalUnpaid += amount;
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('Error calculating total unpaid:', error);
    }

    const statsData = {
      totalCustomers,
      activeLeases,
      monthlyPayments,
      overduePayments,
      totalInvested,
      totalCollected,
      totalProfit,
      totalUnpaid,
      fullyPaidCustomers
    };

    // Ensure all values are valid numbers
    Object.keys(statsData).forEach(key => {
      if (isNaN(statsData[key])) {
        statsData[key] = 0;
      }
    });

    res.json(statsData);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    // Return default values in case of error
    res.json({
      totalCustomers: 0,
      activeLeases: 0,
      monthlyPayments: 0,
      overduePayments: 0,
      totalInvested: 0,
      totalCollected: 0,
      totalProfit: 0,
      totalUnpaid: 0,
      fullyPaidCustomers: 0
    });
  }
});

// @route   GET /api/reports/export/customers/excel
// @desc    Export customers to Excel
// @access  Private
router.get('/export/customers/excel', checkSession, async (req, res) => {
  try {
    const customers = await Customer.findAll({
      include: [{ model: Payment, as: 'Payments' }],
      order: [['creationDate', 'DESC']]
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customers');
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 5 },
      { header: 'Full Name', key: 'fullName', width: 20 },
      { header: 'Phone Number', key: 'phoneNumber', width: 15 },
      { header: 'Car Details', key: 'carDetails', width: 25 },
      { header: 'Purchase Cost', key: 'carPurchaseCost', width: 15 },
      { header: 'Leasing Amount', key: 'leasingAmount', width: 15 },
      { header: 'Monthly Payment', key: 'monthlyInstallment', width: 15 },
      { header: 'Lease Duration', key: 'leaseDuration', width: 15 },
      { header: 'Start Date', key: 'leaseStartDate', width: 15 },
      { header: 'Total Paid', key: 'totalPaid', width: 15 },
      { header: 'Profit', key: 'profit', width: 15 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    customers.forEach(customer => {
      worksheet.addRow({
        id: customer.id,
        fullName: customer.fullName,
        phoneNumber: customer.phoneNumber,
        carDetails: `${customer.carBrand} ${customer.carModel} (${customer.carYear})`,
        carPurchaseCost: customer.carPurchaseCost,
        leasingAmount: customer.leasingAmount,
        monthlyInstallment: customer.monthlyInstallment,
        leaseDuration: customer.leaseDuration,
        leaseStartDate: new Date(customer.leaseStartDate).toLocaleDateString(),
        totalPaid: customer.totalPaid,
        profit: (typeof customer.calculateProfit === 'function') ? customer.calculateProfit() : '',
        status: customer.status
      });
    });
    worksheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Export customers to Excel error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
});

// @route   GET /api/reports/export/payments/pdf
// @desc    Export payments to PDF
// @access  Private
router.get('/export/payments/pdf', checkSession, async (req, res) => {
  try {
    const payments = await Payment.findAll({
      include: [
        { model: Customer, as: 'Customer', attributes: ['fullName'] }
      ],
      order: [['dueDate', 'ASC']]
    });
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=payment_report.pdf');
    doc.pipe(res);
    doc.fontSize(18).text('Payment Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Customer', 50, doc.y, { width: 150 });
    doc.text('Due Date', 200, doc.y - doc.currentLineHeight(), { width: 100 });
    doc.text('Amount', 300, doc.y - doc.currentLineHeight(), { width: 100 });
    doc.text('Status', 400, doc.y - doc.currentLineHeight(), { width: 100 });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    doc.font('Helvetica');
    payments.forEach(payment => {
      const customerName = payment.Customer ? payment.Customer.fullName : 'Unknown Customer';
      doc.text(customerName, 50, doc.y, { width: 150 });
      doc.text(new Date(payment.dueDate).toLocaleDateString(), 200, doc.y - doc.currentLineHeight(), { width: 100 });
      doc.text(`₼${payment.amount}`, 300, doc.y - doc.currentLineHeight(), { width: 100 });
      doc.text(payment.status, 400, doc.y - doc.currentLineHeight(), { width: 100 });
      doc.moveDown();
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text('Customer', 50, doc.y, { width: 150 });
        doc.text('Due Date', 200, doc.y - doc.currentLineHeight(), { width: 100 });
        doc.text('Amount', 300, doc.y - doc.currentLineHeight(), { width: 100 });
        doc.text('Status', 400, doc.y - doc.currentLineHeight(), { width: 100 });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();
        doc.font('Helvetica');
      }
    });
    doc.moveDown(2);
    doc.font('Helvetica-Bold').text('Summary', { underline: true });
    doc.moveDown();
    const totalPayments = payments.length;
    const paidPayments = payments.filter(p => p.status === 'paid').length;
    const overduePayments = payments.filter(p => p.status === 'overdue').length;
    const pendingPayments = payments.filter(p => p.status === 'pending').length;
    const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const paidAmount = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.amount), 0);
    doc.font('Helvetica');
    doc.text(`Total Payments: ${totalPayments}`);
    doc.text(`Paid Payments: ${paidPayments}`);
    doc.text(`Overdue Payments: ${overduePayments}`);
    doc.text(`Pending Payments: ${pendingPayments}`);
    doc.moveDown();
    doc.text(`Total Amount: ₼${totalAmount.toFixed(2)}`);
    doc.text(`Paid Amount: ₼${paidAmount.toFixed(2)}`);
    doc.text(`Remaining Amount: ₼${(totalAmount - paidAmount).toFixed(2)}`);
    doc.end();
  } catch (error) {
    console.error('Export payments to PDF error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
});

module.exports = router; 