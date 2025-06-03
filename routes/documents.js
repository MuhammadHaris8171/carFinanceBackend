const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Configure multer for document uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `doc_${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
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

// @route   POST /api/documents/upload/:customerId
// @desc    Upload a document for a customer
// @access  Private
router.post('/upload/:customerId', upload.single('document'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const { customerId } = req.params;
    const { type } = req.body;

    if (!type) {
        return res.status(400).json({ message: 'Document type is required' });
    }

    try {
        req.db.run(`
            INSERT INTO documents (customer_id, type, file_path)
            VALUES (?, ?, ?)
        `, [customerId, type, req.file.filename], function(err) {
            if (err) {
                req.logger.error('Error uploading document:', err);
                return res.status(500).json({ message: 'Error uploading document' });
            }

            res.status(201).json({
                message: 'Document uploaded successfully',
                documentId: this.lastID,
                filePath: req.file.filename
            });
        });
    } catch (err) {
        req.logger.error('Error in upload document route:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/documents/customer/:customerId
// @desc    Get all documents for a customer
// @access  Private
router.get('/customer/:customerId', async (req, res) => {
    try {
        req.db.all(`
            SELECT id, type, file_path, upload_date
            FROM documents
            WHERE customer_id = ?
            ORDER BY upload_date DESC
        `, [req.params.customerId], (err, documents) => {
            if (err) {
                req.logger.error('Error fetching documents:', err);
                return res.status(500).json({ message: 'Error fetching documents' });
            }
            res.json(documents);
        });
    } catch (err) {
        req.logger.error('Error in get documents route:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE /api/documents/:id
// @desc    Delete a document
// @access  Private
router.delete('/:id', async (req, res) => {
    try {
        // First get the document to find the file path
        req.db.get('SELECT file_path FROM documents WHERE id = ?', [req.params.id], (err, document) => {
            if (err) {
                req.logger.error('Error finding document:', err);
                return res.status(500).json({ message: 'Error finding document' });
            }

            if (!document) {
                return res.status(404).json({ message: 'Document not found' });
            }

            // Delete the file from the filesystem
            const filePath = path.join(__dirname, '../uploads', document.file_path);
            fs.unlink(filePath, (err) => {
                if (err && err.code !== 'ENOENT') {
                    req.logger.error('Error deleting file:', err);
                    return res.status(500).json({ message: 'Error deleting file' });
                }

                // Delete the document record from the database
                req.db.run('DELETE FROM documents WHERE id = ?', [req.params.id], function(err) {
                    if (err) {
                        req.logger.error('Error deleting document record:', err);
                        return res.status(500).json({ message: 'Error deleting document record' });
                    }

                    res.json({ message: 'Document deleted successfully' });
                });
            });
        });
    } catch (err) {
        req.logger.error('Error in delete document route:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/documents/:id
// @desc    Get a single document
// @access  Private
router.get('/:id', async (req, res) => {
    try {
        req.db.get(`
            SELECT d.*, c.full_name as customer_name
            FROM documents d
            JOIN customers c ON d.customer_id = c.id
            WHERE d.id = ?
        `, [req.params.id], (err, document) => {
            if (err) {
                req.logger.error('Error fetching document:', err);
                return res.status(500).json({ message: 'Error fetching document' });
            }

            if (!document) {
                return res.status(404).json({ message: 'Document not found' });
            }

            res.json(document);
        });
    } catch (err) {
        req.logger.error('Error in get document route:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 