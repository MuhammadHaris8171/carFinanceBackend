const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create a new database connection
const db = new sqlite3.Database(
    path.join(__dirname, 'data', 'car_financing.db'),
    sqlite3.OPEN_READWRITE,
    (err) => {
        if (err) {
            console.error('Error connecting to database:', err);
            process.exit(1);
        }
        console.log('Connected to SQLite database');
    }
);

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Add promise wrapper for db.all
db.allAsync = function (sql, params) {
    return new Promise((resolve, reject) => {
        this.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(rows);
        });
    });
};

// Add promise wrapper for db.get
db.getAsync = function (sql, params) {
    return new Promise((resolve, reject) => {
        this.get(sql, params, (error, row) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(row);
        });
    });
};

// Add promise wrapper for db.run
db.runAsync = function (sql, params) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function (error) {
            if (error) {
                reject(error);
                return;
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

// Add promise wrapper for db.exec
db.execAsync = function (sql) {
    return new Promise((resolve, reject) => {
        this.exec(sql, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
};

// Add transaction helpers
db.beginTransaction = async function () {
    await this.runAsync('BEGIN TRANSACTION');
};

db.commit = async function () {
    await this.runAsync('COMMIT');
};

db.rollback = async function () {
    await this.runAsync('ROLLBACK');
};

// Export the database connection
module.exports = db; 