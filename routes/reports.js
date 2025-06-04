const express = require('express');
const { Customer, Payment, sequelize } = require('../models');
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

// Token-based auth middleware
const checkToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify the token (implementation depends on your auth system)
    // This is a simplified version; you might need to verify using JWT or another method
    if (!token) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    // If using JWT, you'd verify and decode the token here
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // req.userId = decoded.userId;
    
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// @route   GET /api/reports/summary
// @desc    Get financial summary
// @access  Private
router.get('/summary', checkToken, async (req, res) => {
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
router.get('/monthly', checkToken, async (req, res) => {
  try {
    // Use raw query instead of Sequelize to ensure SQLite compatibility
    const query = `
      SELECT 
        strftime('%Y-%m', "dueDate") as period,
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as collected_amount,
        SUM(CASE WHEN status = 'pending' AND "dueDate" <= date('now') THEN amount ELSE 0 END) as overdue_amount,
        COUNT(CASE WHEN status = 'pending' AND "dueDate" <= date('now') THEN 1 END) as overdue_payments,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as completed_payments
      FROM "Payments"
      GROUP BY strftime('%Y-%m', "dueDate")
      ORDER BY period DESC
    `;
    
    const payments = await sequelize.query(query, { 
      type: Sequelize.QueryTypes.SELECT 
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
router.get('/customers', checkToken, async (req, res) => {
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
router.get('/car-brands', checkToken, async (req, res) => {
  try {
    // Use raw query instead of Sequelize ORM for better SQLite compatibility
    const query = `
      SELECT 
        "carBrand" as "carBrand",
        COUNT(*) as total_cars,
        SUM("leasingAmount") as total_leasing_amount,
        AVG("monthlyInstallment") as avg_monthly_installment
      FROM "Customers"
      WHERE "carBrand" IS NOT NULL
      GROUP BY "carBrand"
      ORDER BY COUNT(*) DESC
    `;
    
    const carBrands = await sequelize.query(query, { 
      type: Sequelize.QueryTypes.SELECT 
    });
    
    res.json(carBrands);
  } catch (error) {
    console.error('Error in get car brands route:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get filtered reports
router.get('/filtered', checkToken, async (req, res) => {
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
router.get('/customer/:customerId/history', checkToken, async (req, res) => {
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
// @desc    Get dashboard stats
// @access  Private
router.get('/dashboard', checkToken, async (req, res) => {
  try {
    // Get total customers
    const totalCustomers = await Customer.count();
    
    // Get active leases (customers with pending payments)
    const activeLeases = await Customer.count({
      include: [{
        model: Payment,
        as: 'Payments',
        where: { status: 'pending' },
        required: true
      }]
    });
    
    // Get fully paid customers
    const fullyPaidCustomers = await Customer.count({
      include: [{
        model: Payment,
        as: 'Payments',
        where: { status: 'pending' },
        required: false
      }],
      having: Sequelize.literal('COUNT(CASE WHEN `Payments`.`status` = "pending" THEN 1 END) = 0'),
      group: ['Customer.id']
    });

    // Get monthly payments sum
    const monthlyPayments = await Customer.sum('monthlyInstallment');
    
    // Get total invested
    const totalInvested = await Customer.sum('leasingAmount');
    
    // Get total collected
    const totalCollected = await Payment.sum('amount', {
      where: { status: 'paid' }
    });
    
    // Get total unpaid
    const totalUnpaid = await Payment.sum('amount', {
      where: { status: 'pending' }
    });
    
    // Get overdue payments count
    const today = new Date();
    const overduePayments = await Payment.count({
      where: {
        status: 'pending',
        dueDate: { [Op.lt]: today }
      }
    });
    
    // Calculate total profit - replace problematic Sequelize.literal approach
    let totalProfit = 0;
    try {
      // Get all customers
      const customers = await Customer.findAll({
        attributes: ['monthlyInstallment', 'leaseDuration', 'leasingAmount']
      });
      
      // Calculate profit for each customer and sum up
      totalProfit = customers.reduce((sum, customer) => {
        const monthlyPayment = parseFloat(customer.monthlyInstallment) || 0;
        const leaseDuration = parseInt(customer.leaseDuration) || 0;
        const leasingAmount = parseFloat(customer.leasingAmount) || 0;
        
        const customerProfit = (monthlyPayment * leaseDuration) - leasingAmount;
        return sum + customerProfit;
      }, 0);
    } catch (err) {
      console.error('Error calculating profit:', err);
      totalProfit = 0;
    }

    const stats = {
      totalCustomers: totalCustomers || 0,
      activeLeases: activeLeases || 0,
      fullyPaidCustomers: fullyPaidCustomers || 0,
      monthlyPayments: monthlyPayments || 0,
      totalInvested: totalInvested || 0,
      totalCollected: totalCollected || 0,
      totalUnpaid: totalUnpaid || 0,
      overduePayments: overduePayments || 0,
      totalProfit: totalProfit || 0
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error in get dashboard stats route:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/reports/update-profit
// @desc    Update profit calculation
// @access  Private
router.post('/update-profit', checkToken, async (req, res) => {
  try {
    const { totalProfit } = req.body;
    
    // Store the corrected profit value in database or session
    // This is a simplified implementation - you might want to store this in a settings table
    if (req.session) {
      req.session.correctedProfit = totalProfit;
    }
    
    res.json({ success: true, totalProfit });
  } catch (error) {
    console.error('Error updating profit calculation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/export/customers/excel
// @desc    Export customers to Excel
// @access  Private
router.get('/export/customers/excel', checkToken, async (req, res) => {
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
router.get('/export/payments/pdf', checkToken, async (req, res) => {
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