import mysql from 'mysql2/promise';
import config from './config.js';

let pool = null;
let initialized = false;

// In-memory tenant cache (slug -> tenant object, refreshed every 60s)
const tenantCache = new Map();
let tenantCacheTime = 0;
const TENANT_CACHE_TTL = 60000;

const initDatabase = async () => {
  if (initialized && pool) return pool;

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
      dateStrings: true,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    });

    console.log('MySQL connection pool created');
    await migrate();
    initialized = true;
    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// ============================================================
// MIGRATIONS
// ============================================================
const migrate = async () => {

  // --------------------------------------------------------
  // Tenants table
  // --------------------------------------------------------
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS tenants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      logo_url VARCHAR(500),
      primary_color VARCHAR(7) DEFAULT '#6366f1',
      subscription_plan ENUM('trial','basic','pro','enterprise','paid') DEFAULT 'trial',
      subscription_status ENUM('active','trial','expired','cancelled') DEFAULT 'trial',
      trial_ends_at DATETIME,
      whatsapp_access_token TEXT,
      whatsapp_phone_number_id VARCHAR(50),
      whatsapp_business_account_id VARCHAR(50),
      whatsapp_catalog_id VARCHAR(50),
      whatsapp_configured BOOLEAN DEFAULT FALSE,
      max_users INT DEFAULT 5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_slug (slug),
      INDEX idx_status (subscription_status)
    )`);
  } catch (error) {
    if (!error.message.includes('already exists')) console.error('Migration error (tenants):', error.message);
  }

  // --------------------------------------------------------
  // Subscription plans
  // --------------------------------------------------------
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS subscription_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      price_monthly INT NOT NULL,
      max_users INT NOT NULL DEFAULT 5,
      whatsapp_enabled BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (error) {
    if (!error.message.includes('already exists')) console.error('Migration error (subscription_plans):', error.message);
  }

  // --------------------------------------------------------
  // Core tables
  // --------------------------------------------------------
  const coreMigrations = [
    // Users
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'agent',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE KEY uk_tenant_email (tenant_id, email),
      INDEX idx_tenant (tenant_id)
    )`,

    // Knowledge Base (Semantic Search / Auto-Replies)
    `CREATE TABLE IF NOT EXISTS whatsapp_knowledge_base (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      question_vector JSON,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      INDEX idx_tenant (tenant_id)
    )`,

    // Contacts (unified — replaces leads + clients)
    `CREATE TABLE IF NOT EXISTS contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      location VARCHAR(255),
      ticket_size DECIMAL(15,2),
      tags JSON,
      notes TEXT,
      source VARCHAR(100),
      whatsapp_consent BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      INDEX idx_tenant (tenant_id),
      INDEX idx_phone (phone),
      INDEX idx_location (location)
    )`,

    // WhatsApp campaign history
    `CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      campaign_name VARCHAR(255) NOT NULL,
      recipient_type ENUM('all','tagged','custom') NOT NULL DEFAULT 'all',
      recipient_filter JSON,
      total_recipients INT NOT NULL DEFAULT 0,
      successful_count INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      status ENUM('draft','processing','completed','failed') DEFAULT 'draft',
      sent_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      error_log TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (sent_by) REFERENCES users(id),
      INDEX idx_tenant (tenant_id)
    )`,

    // WhatsApp individual message log (broadcast)
    `CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      campaign_id INT,
      phone VARCHAR(20) NOT NULL,
      recipient_name VARCHAR(255),
      recipient_id INT,
      status ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending',
      provider_message_id VARCHAR(255),
      error_message TEXT,
      sent_at DATETIME,
      delivered_at DATETIME,
      read_at DATETIME,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
      INDEX idx_tenant (tenant_id),
      INDEX idx_provider_msg (provider_message_id)
    )`,

    // WhatsApp templates (local mirror)
    `CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      meta_template_id VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(50) DEFAULT 'MARKETING',
      language VARCHAR(10) DEFAULT 'en',
      body_text TEXT NOT NULL,
      has_header_image BOOLEAN DEFAULT FALSE,
      footer_text VARCHAR(60),
      buttons_json TEXT,
      call_button_text VARCHAR(25),
      call_button_phone VARCHAR(20),
      status VARCHAR(50) DEFAULT 'PENDING',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_tenant (tenant_id)
    )`,

    // WhatsApp conversations (chat inbox)
    `CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      phone VARCHAR(20) NOT NULL,
      contact_name VARCHAR(255),
      contact_id INT,
      last_message_text TEXT,
      last_message_at DATETIME,
      last_customer_message_at DATETIME,
      window_expires_at DATETIME,
      unread_count INT DEFAULT 0,
      is_archived BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
      UNIQUE KEY uk_tenant_phone (tenant_id, phone),
      INDEX idx_tenant_updated (tenant_id, last_message_at DESC)
    )`,

    // WhatsApp chat messages (individual messages in conversations)
    `CREATE TABLE IF NOT EXISTS whatsapp_chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      conversation_id INT NOT NULL,
      direction ENUM('inbound','outbound') NOT NULL,
      message_type VARCHAR(20) DEFAULT 'text',
      body TEXT,
      media_id VARCHAR(255),
      media_mime_type VARCHAR(100),
      provider_message_id VARCHAR(255),
      status ENUM('pending','sent','delivered','read','failed') DEFAULT 'sent',
      sent_by INT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_conversation (conversation_id, created_at),
      INDEX idx_provider_msg (provider_message_id)
    )`,

    // Products (Catalogue)
    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      mrp DECIMAL(10,2),
      selling_price DECIMAL(10,2),
      category VARCHAR(100),
      sku VARCHAR(100),
      image_url TEXT,
      meta_product_id VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      INDEX idx_tenant (tenant_id)
    )`,

    // Orders (OMS)
    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      contact_id INT,
      phone VARCHAR(20) NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(10) DEFAULT 'INR',
      payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
      fulfillment_status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
      shipping_address TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
      INDEX idx_tenant (tenant_id),
      INDEX idx_status (payment_status, fulfillment_status)
    )`,

    // Order line items
    `CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT,
      sku VARCHAR(100),
      item_name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    )`,
  ];

  for (const sql of coreMigrations) {
    try {
      await pool.execute(sql);
    } catch (error) {
      if (!error.message.includes('already exists')) console.error('Migration error:', error.message);
    }
  }

  // --------------------------------------------------------
  // Post-migration schema updates (safe to re-run)
  // --------------------------------------------------------
  try {
    await pool.execute(`ALTER TABLE tenants MODIFY COLUMN subscription_plan ENUM('trial','basic','pro','enterprise','paid') DEFAULT 'trial'`);
  } catch (error) { /* already updated */ }

  const alterMigrations = [
    `ALTER TABLE whatsapp_templates ADD COLUMN buttons_json TEXT AFTER footer_text`,
    `ALTER TABLE tenants ADD COLUMN whatsapp_catalog_id VARCHAR(50) AFTER whatsapp_business_account_id`,
    `ALTER TABLE products ADD COLUMN meta_product_id VARCHAR(100) AFTER image_url`,
    `ALTER TABLE products ADD COLUMN product_vector JSON AFTER meta_product_id`,
    `ALTER TABLE tenants ADD COLUMN bot_settings JSON AFTER whatsapp_catalog_id`,
    `ALTER TABLE orders ADD COLUMN shipping_address TEXT AFTER fulfillment_status`
  ];
  for (const sql of alterMigrations) {
    try {
      await pool.execute(sql);
    } catch (error) {
      if (!error.message.includes('Duplicate column')) { /* column already exists */ }
    }
  }

  // --------------------------------------------------------
  // Seed subscription plans
  // --------------------------------------------------------
  const plans = [
    ['trial', 'Free Trial', 0, 5, false],
    ['paid', 'Paid', 99900, 50, true],
  ];

  for (const [name, displayName, priceMonthly, maxUsers, whatsappEnabled] of plans) {
    try {
      await pool.execute(
        `INSERT IGNORE INTO subscription_plans (name, display_name, price_monthly, max_users, whatsapp_enabled) VALUES (?, ?, ?, ?, ?)`,
        [name, displayName, priceMonthly, maxUsers, whatsappEnabled]
      );
    } catch (error) { /* already seeded */ }
  }

  // --------------------------------------------------------
  // Seed default tenant + admin
  // --------------------------------------------------------
  try {
    const [tenants] = await pool.execute('SELECT COUNT(*) as count FROM tenants');
    if (tenants[0].count === 0) {
      await pool.execute(
        `INSERT INTO tenants (name, slug, email, subscription_plan, subscription_status, max_users) VALUES (?, ?, ?, 'enterprise', 'active', 50)`,
        ['Default Firm', 'default', 'admin@platform.local']
      );

      const bcrypt = await import('bcryptjs');
      const passwordHash = bcrypt.default.hashSync('admin123', 10);
      await pool.execute(
        'INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [1, 'Admin', 'admin@platform.local', passwordHash, 'admin']
      );

      console.log('Default tenant + admin created: admin@platform.local / admin123');
    }
  } catch (error) {
    console.log('Seed error (may already exist):', error.message);
  }

  console.log('Database migrations completed');
};

// ============================================================
// TENANT CACHE
// ============================================================
export const getTenantBySlug = async (slug) => {
  if (Date.now() - tenantCacheTime > TENANT_CACHE_TTL) {
    await refreshTenantCache();
  }
  let tenant = tenantCache.get(slug);
  if (!tenant) {
    tenant = await get('SELECT * FROM tenants WHERE slug = ?', [slug]);
    if (tenant) {
      tenantCache.set(slug, tenant);
    }
  }
  return tenant || null;
};

export const getTenantById = async (id) => {
  return await get('SELECT * FROM tenants WHERE id = ?', [id]);
};

const refreshTenantCache = async () => {
  try {
    const tenants = await query('SELECT * FROM tenants WHERE subscription_status != ?', ['cancelled']);
    tenantCache.clear();
    for (const tenant of tenants) {
      tenantCache.set(tenant.slug, tenant);
    }
    tenantCacheTime = Date.now();
  } catch (error) {
    console.error('Failed to refresh tenant cache:', error.message);
  }
};

export const invalidateTenantCache = async (slug) => {
  if (slug) {
    const tenant = await get('SELECT * FROM tenants WHERE slug = ?', [slug]);
    if (tenant) {
      tenantCache.set(slug, tenant);
    } else {
      tenantCache.delete(slug);
    }
  } else {
    tenantCacheTime = 0;
  }
};

// ============================================================
// QUERY HELPERS
// ============================================================
export const query = async (sql, params = []) => {
  if (!pool) await initDatabase();
  const [rows] = await pool.execute(sql, params);
  return rows;
};

export const run = async (sql, params = []) => {
  if (!pool) await initDatabase();
  const [result] = await pool.execute(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
};

export const get = async (sql, params = []) => {
  if (!pool) await initDatabase();
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
};

export { initDatabase };
export default { query, run, get, initDatabase, getTenantBySlug, getTenantById, invalidateTenantCache };
