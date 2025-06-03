const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Create database directory if it doesn't exist
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Database connection
const db = new sqlite3.Database(path.join(dbDir, 'car_financing.db'), (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

// Read and execute schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Execute schema
db.exec(schema, async (err) => {
    if (err) {
        console.error('Error creating schema:', err);
        process.exit(1);
    }
    console.log('Schema created successfully');

    // Create default admin user if not exists
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(`
        INSERT OR IGNORE INTO users (username, password_hash, full_name, role)
        VALUES (?, ?, ?, ?)
    `, ['admin', hashedPassword, 'System Admin', 'admin'], (err) => {
        if (err) {
            console.error('Error creating default admin user:', err);
        } else {
            console.log('Default admin user created successfully');
        }

        // Close database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
                process.exit(1);
            }
            console.log('Database initialization completed');
        });
    });
}); 