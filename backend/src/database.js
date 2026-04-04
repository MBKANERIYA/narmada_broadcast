import mysql from 'mysql2/promise';
import config from './config.js';

let pool = null;
let initialized = false;

// Initialize database connection pool
const initDatabase = async () => {
  // Skip if already initialized
  if (initialized && pool) {
    return pool;
  }

  try {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true, // Prevents 500 errors from timezone parsing issues
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    });

    console.log('MySQL connection pool created');

    // Run migrations
    await migrate();

    initialized = true;
    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// Run migrations
const migrate = async () => {
  const migrations = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'agent',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Sources table
    `CREATE TABLE IF NOT EXISTS sources (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'online'
    )`,

    // Leads table
    `CREATE TABLE IF NOT EXISTS leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      budget_min DECIMAL(15,2),
      budget_max DECIMAL(15,2),
      location VARCHAR(255),
      interest VARCHAR(255),
      motive_to_buy VARCHAR(255),
      contact_person VARCHAR(255),
      source VARCHAR(255),
      source_id INT,
      status VARCHAR(50) NOT NULL DEFAULT 'new',
      escalated TINYINT NOT NULL DEFAULT 0,
      assigned_to INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_status (status),
      INDEX idx_assigned (assigned_to),
      INDEX idx_escalated (escalated)
    )`,

    // Follow-ups table
    `CREATE TABLE IF NOT EXISTS follow_ups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      user_id INT NOT NULL,
      scheduled_at DATETIME NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'call',
      notes TEXT,
      completed TINYINT NOT NULL DEFAULT 0,
      completed_at DATETIME,
      outcome VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_scheduled (scheduled_at)
    )`,

    // Clients table
    `CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      location VARCHAR(255),
      source VARCHAR(255),
      lead_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    )`,

    // Site Visits table
    `CREATE TABLE IF NOT EXISTS site_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      scheduled_at DATETIME NOT NULL,
      location VARCHAR(255),
      notes TEXT,
      status VARCHAR(50) DEFAULT 'scheduled',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_scheduled (scheduled_at)
    )`,

    // Status updates (audit trail)
    `CREATE TABLE IF NOT EXISTS status_updates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      user_id INT NOT NULL,
      old_status VARCHAR(50),
      new_status VARCHAR(50) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Tasks table
    `CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      assigned_to INT,
      lead_id INT,
      due_date DATETIME,
      priority VARCHAR(50) NOT NULL DEFAULT 'medium',
      completed TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    )`,
  ];

  for (const sql of migrations) {
    try {
      await pool.execute(sql);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('Migration error:', error.message);
      }
    }
  }

  // Add source column if it doesn't exist (for existing databases)
  try {
    await pool.execute('ALTER TABLE leads ADD COLUMN source VARCHAR(255) AFTER contact_person');
  } catch (error) {
    // Column already exists, ignore
  }

  // Add escalated column to leads (for existing databases)
  try {
    await pool.execute('ALTER TABLE leads ADD COLUMN escalated TINYINT NOT NULL DEFAULT 0 AFTER status');
  } catch (error) {
    // Column already exists, ignore
  }

  // Add outcome column to follow_ups (for existing databases)
  try {
    await pool.execute('ALTER TABLE follow_ups ADD COLUMN outcome VARCHAR(50) AFTER completed_at');
  } catch (error) {
    // Column already exists, ignore
  }

  // Create clients table if it doesn't exist (migrations for existing dbs)
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      location VARCHAR(255),
      source VARCHAR(255),
      lead_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    )`);
  } catch (error) {
    console.error('Migration error (clients):', error.message);
  }

  // Add new client fields for deal tracking
  const clientColumns = [
    ['deal_date', 'DATE'],
    ['price', 'DECIMAL(15,2)'],
    ['property_details', 'TEXT'],
    ['documents_link', 'VARCHAR(500)'],
    ['alternate_phone', 'VARCHAR(50)']
  ];

  for (const [column, type] of clientColumns) {
    try {
      await pool.execute(`ALTER TABLE clients ADD COLUMN ${column} ${type}`);
    } catch (error) {
      // Column already exists, ignore
    }
  }

  // Create inventory table for properties available for sale/rent
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      photo_link VARCHAR(500),
      location VARCHAR(255),
      size VARCHAR(100),
      demand VARCHAR(100),
      property_type VARCHAR(100),
      listing_type ENUM('sale', 'rent') DEFAULT 'sale',
      status ENUM('available', 'engaged', 'sold') DEFAULT 'available',
      is_hot BOOLEAN DEFAULT FALSE,
      price DECIMAL(15,2),
      other_details TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`);
  } catch (error) {
    console.error('Migration error (inventory):', error.message);
  }

  // Add new inventory columns if they don't exist (migration for existing tables)
  const inventoryColumns = [
    ['property_type', 'VARCHAR(100)'],
    ['listing_type', "ENUM('sale', 'rent') DEFAULT 'sale'"],
    ['status', "ENUM('available', 'engaged', 'sold') DEFAULT 'available'"],
    ['is_hot', 'BOOLEAN DEFAULT FALSE']
  ];
  for (const [column, type] of inventoryColumns) {
    try {
      await pool.execute(`ALTER TABLE inventory ADD COLUMN ${column} ${type}`);
    } catch (error) {
      // Column already exists, ignore
    }
  }

  // Create cold_reminders table for "remind me later" functionality
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS cold_reminders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      user_id INT NOT NULL,
      remind_at DATETIME NOT NULL,
      notes TEXT,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  } catch (error) {
    console.error('Migration error (cold_reminders):', error.message);
  }

  // Create projects table for buildings/complexes with multiple units
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      location VARCHAR(255),
      builder VARCHAR(255),
      total_units INT DEFAULT 0,
      unit_types JSON,
      description TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`);
  } catch (error) {
    console.error('Migration error (projects):', error.message);
  }

  // Add project_id to inventory if not exists
  try {
    await pool.execute('ALTER TABLE inventory ADD COLUMN project_id INT');
    await pool.execute('ALTER TABLE inventory ADD FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL');
  } catch (error) {
    // Column already exists, ignore
  }

  // WhatsApp campaign history table
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      campaign_name VARCHAR(255) NOT NULL,
      recipient_type ENUM('all_clients', 'all_leads', 'leads_by_status', 'custom') NOT NULL,
      recipient_filter JSON,
      total_recipients INT NOT NULL DEFAULT 0,
      successful_count INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      status ENUM('draft', 'processing', 'completed', 'failed') DEFAULT 'draft',
      sent_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      error_log TEXT,
      FOREIGN KEY (sent_by) REFERENCES users(id)
    )`);
  } catch (error) {
    console.error('Migration error (whatsapp_campaigns):', error.message);
  }

  // WhatsApp individual message log
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      campaign_id INT,
      phone VARCHAR(20) NOT NULL,
      recipient_name VARCHAR(255),
      recipient_type ENUM('lead', 'client') NOT NULL,
      recipient_id INT,
      status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
      provider_message_id VARCHAR(255),
      error_message TEXT,
      sent_at DATETIME,
      delivered_at DATETIME,
      read_at DATETIME,
      FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL
    )`);
  } catch (error) {
    console.error('Migration error (whatsapp_messages):', error.message);
  }

  // WhatsApp templates table (local record of templates created via API)
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meta_template_id VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(50) DEFAULT 'MARKETING',
      language VARCHAR(10) DEFAULT 'en',
      body_text TEXT NOT NULL,
      has_header_image BOOLEAN DEFAULT FALSE,
      footer_text VARCHAR(60),
      call_button_text VARCHAR(25),
      call_button_phone VARCHAR(20),
      status VARCHAR(50) DEFAULT 'PENDING',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`);
  } catch (error) {
    console.error('Migration error (whatsapp_templates):', error.message);
  }

  // Add WhatsApp consent to leads and clients
  try {
    await pool.execute('ALTER TABLE leads ADD COLUMN whatsapp_consent BOOLEAN DEFAULT FALSE');
  } catch (error) { /* Column already exists */ }
  try {
    await pool.execute('ALTER TABLE clients ADD COLUMN whatsapp_consent BOOLEAN DEFAULT FALSE');
  } catch (error) { /* Column already exists */ }

  // Seed sources
  const sources = [
    ['Facebook', 'social'],
    ['Instagram', 'social'],
    ['WhatsApp', 'direct'],
    ['Google Ads', 'ads'],
    ['Walk-in', 'offline'],
    ['Referral', 'offline'],
    ['MagicBricks', 'portal'],
    ['99acres', 'portal'],
    ['Housing.com', 'portal'],
    ['NoBroker', 'portal'],
  ];

  for (const [name, type] of sources) {
    try {
      await pool.execute('INSERT IGNORE INTO sources (name, type) VALUES (?, ?)', [name, type]);
    } catch (error) {
      // Ignore duplicate errors
    }
  }

  // Seed default admin user if no users exist
  try {
    const [users] = await pool.execute('SELECT COUNT(*) as count FROM users');
    if (users[0].count === 0) {
      const bcrypt = await import('bcryptjs');
      const passwordHash = bcrypt.default.hashSync('admin123', 10);
      await pool.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['Admin', 'admin@mahalaxmi.com', passwordHash, 'admin']
      );
      console.log('Default admin user created: admin@mahalaxmi.com / admin123');
    }
  } catch (error) {
    console.log('Admin seed error (may already exist):', error.message);
  }

  console.log('Database migrations completed');
};

// Query helper
export const query = async (sql, params = []) => {
  if (!pool) {
    await initDatabase();
  }
  const [rows] = await pool.execute(sql, params);
  return rows;
};

// Execute helper (for INSERT, UPDATE, DELETE)
export const run = async (sql, params = []) => {
  if (!pool) {
    await initDatabase();
  }
  const [result] = await pool.execute(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
};

// Get single row helper
export const get = async (sql, params = []) => {
  if (!pool) {
    await initDatabase();
  }
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
};

export { initDatabase };
export default { query, run, get, initDatabase };
