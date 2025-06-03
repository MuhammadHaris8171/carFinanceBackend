-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    car_brand TEXT NOT NULL,
    car_model TEXT NOT NULL,
    car_year INTEGER NOT NULL,
    purchase_cost DECIMAL(10,2) NOT NULL,
    leasing_amount DECIMAL(10,2) NOT NULL,
    monthly_installment DECIMAL(10,2) NOT NULL,
    lease_duration INTEGER NOT NULL,
    lease_start_date DATE NOT NULL,
    total_profit DECIMAL(10,2) NOT NULL,
    driver_id_path TEXT,
    passport_id_path TEXT,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'late')),
    payment_date DATE,
    payment_proof_path TEXT,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('driver_license', 'passport', 'payment_proof', 'other')),
    file_path TEXT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    changes TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

-- Insert default admin user (password: admin123)
INSERT OR IGNORE INTO users (username, password_hash, full_name, role)
VALUES ('admin', '$2b$10$rR3U9.RvBjIXzj.XG4ZQpOVJ.U5F3ZHqzQX5fZ5Z5Z5Z5Z5Z5Z', 'System Admin', 'admin'); 