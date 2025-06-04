const express = require('express');
const { Customer, Payment, Document } = require('../models');
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

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
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

// Validation middleware
const validateCustomer = [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('phoneNumber').matches(/^\+?[\d\s-]+$/).withMessage('Valid phone number is required'),
    body('carBrand').trim().notEmpty().withMessage('Car brand is required'),
    body('carModel').trim().notEmpty().withMessage('Car model is required'),
    body('carYear').isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Valid car year is required'),
    body('carPurchaseCost').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Purchase cost must be a positive number'),
    body('leasingAmount').isFloat({ min: 0 }).withMessage('Valid leasing amount is required'),
    body('monthlyInstallment').isFloat({ min: 0 }).withMessage('Valid monthly installment is required'),
    body('leaseDuration').isInt({ min: 1 }).withMessage('Valid lease duration is required'),
    body('leaseStartDate').isISO8601().withMessage('Valid lease start date is required')
];

// Get all customers with search
router.get('/', checkSession, async (req, res) => {
    try {
        const { search } = req.query;
        let where = {};
        
        if (search) {
            where = {
                [Sequelize.Op.or]: [
                    { fullName: { [Sequelize.Op.like]: `%${search}%` } },
                    { phoneNumber: { [Sequelize.Op.like]: `%${search}%` } },
                    { carBrand: { [Sequelize.Op.like]: `%${search}%` } },
                    { carModel: { [Sequelize.Op.like]: `%${search}%` } }
                ]
            };
        }
        
        const customers = await Customer.findAll({
            where,
            order: [['creationDate', 'DESC']]
        });
        res.json(customers);
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get single customer with details
router.get('/:id', checkSession, async (req, res) => {
    try {
        const customer = await Customer.findByPk(req.params.id, {
            include: [
                { model: Payment, as: 'Payments' }
            ]
        });
        
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json(customer);
    } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create customer
router.post('/', checkSession, uploadMulter.fields([
    { name: 'driverId', maxCount: 1 },
    { name: 'passport', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
]), validateCustomer, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Get file paths if uploaded
        let driverIdPath = null;
        let passportPhotoPath = null;
        let photoPath = null;

        if (req.files) {
            if (req.files.driverId) {
                driverIdPath = `/uploads/${req.files.driverId[0].filename}`;
            }
            if (req.files.passport) {
                passportPhotoPath = `/uploads/${req.files.passport[0].filename}`;
            }
            if (req.files.photo) {
                photoPath = `/uploads/${req.files.photo[0].filename}`;
            }
        }

        // Create customer
        const customer = await Customer.create({
            fullName: req.body.fullName,
            phoneNumber: req.body.phoneNumber,
            carBrand: req.body.carBrand,
            carModel: req.body.carModel,
            carYear: req.body.carYear,
            carPurchaseCost: req.body.carPurchaseCost || 0,
            leasingAmount: req.body.leasingAmount,
            monthlyInstallment: req.body.monthlyInstallment,
            leaseDuration: req.body.leaseDuration,
            leaseStartDate: req.body.leaseStartDate,
            driverIdPath,
            passportPhotoPath,
            photoUrl: photoPath,
            status: 'active',
            totalPaid: 0
        });

        // Generate payment schedule
        const startDate = new Date(req.body.leaseStartDate);
        const payments = [];

        for (let i = 0; i < req.body.leaseDuration; i++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(startDate.getMonth() + i);
            
            payments.push({
                customerId: customer.id,
                dueDate,
                amount: req.body.monthlyInstallment,
                status: 'pending'
            });
        }

        await Payment.bulkCreate(payments);

        res.status(201).json({
            message: 'Customer created successfully',
            customer
        });
    } catch (error) {
        console.error('Create customer error:', error);
        if (error.stack) console.error(error.stack);
        res.status(500).json({ message: 'Server error', error: error.message, stack: error.stack });
    }
});

// Update customer
router.put('/:id', checkSession, uploadMulter.fields([
    { name: 'driverId', maxCount: 1 },
    { name: 'passport', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
]), validateCustomer, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const customer = await Customer.findByPk(req.params.id);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Get file paths if uploaded
        const updates = { ...req.body };
        
        if (req.files) {
            if (req.files.driverId) {
                updates.driverIdPath = `/uploads/${req.files.driverId[0].filename}`;
            }
            if (req.files.passport) {
                updates.passportPhotoPath = `/uploads/${req.files.passport[0].filename}`;
            }
            if (req.files.photo) {
                updates.photoUrl = `/uploads/${req.files.photo[0].filename}`;
            }
        }

        await customer.update(updates);

        res.json({
            message: 'Customer updated successfully',
            customer
        });
    } catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete customer
router.delete('/:id', checkSession, async (req, res) => {
    try {
        const customer = await Customer.findByPk(req.params.id);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Delete associated payments
        await Payment.destroy({ where: { customerId: req.params.id } });
        
        await customer.destroy();

        res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Upload document
router.post('/:id/documents', checkSession, async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const document = await Document.create({
      customerId: customer.id,
      type: req.body.type,
      fileUrl: req.file.path,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

    res.status(201).json(document);
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get payment schedule
router.get('/:id/payments', checkSession, async (req, res) => {
    try {
        const customer = await Customer.findByPk(req.params.id);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        const payments = await Payment.findAll({
            where: { customerId: customer.id },
            order: [['dueDate', 'ASC']]
        });

        res.json(payments);
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Record payment
router.post('/:id/payments', checkSession, async (req, res) => {
    try {
        const customer = await Customer.findByPk(req.params.id);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        const payment = await Payment.create({
            customerId: customer.id,
            amount: req.body.amount,
            dueDate: req.body.dueDate,
            status: 'paid',
            paymentDate: new Date(),
            notes: req.body.notes
        });

        res.status(201).json(payment);
    } catch (error) {
        console.error('Create payment error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 