const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../../amazon_price_tracker.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return { rows: stmt.all(...params), rowCount: stmt.all(...params).length };
    } else if (sql.trim().toUpperCase().startsWith('INSERT') || sql.trim().toUpperCase().startsWith('UPDATE') || sql.trim().toUpperCase().startsWith('DELETE')) {
      const result = stmt.run(...params);
      return { rowCount: result.changes, lastID: result.lastInsertRowid };
    }
  } catch (err) {
    console.error('DB error:', err.message, { sql: sql.substring(0, 60), params });
    throw err;
  }
}

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      url         TEXT NOT NULL UNIQUE,
      asin        VARCHAR(20),
      name        TEXT,
      image_url   TEXT,
      current_price NUMERIC(10, 2),
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      price      NUMERIC(10, 2) NOT NULL,
      scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_product_id
    ON price_history(product_id, scraped_at DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id   INTEGER NOT NULL,
      email        TEXT NOT NULL,
      target_price NUMERIC(10, 2) NOT NULL,
      is_active    BOOLEAN NOT NULL DEFAULT 1,
      triggered_at DATETIME,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS change_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      event_type TEXT NOT NULL, -- PRICE_DROP | PRICE_INCREASE | OUT_OF_STOCK | BACK_IN_STOCK
      old_price  NUMERIC(10, 2),
      new_price  NUMERIC(10, 2),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_change_events_created
    ON change_events(created_at DESC);

    -- Current offer of every seller on a listing (multi-seller Flipkart products)
    CREATE TABLE IF NOT EXISTS seller_offers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL,
      seller_id   TEXT,
      seller_name TEXT NOT NULL,
      price       NUMERIC(10, 2),
      is_buybox   INTEGER NOT NULL DEFAULT 0,
      in_stock    INTEGER NOT NULL DEFAULT 1, -- 0 = seller vanished from the seller list
      rating      NUMERIC(3, 1),
      is_mine     INTEGER NOT NULL DEFAULT 0, -- 1 = this is the user's own store
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, seller_name),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS seller_price_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL,
      seller_name TEXT NOT NULL,
      price       NUMERIC(10, 2),
      in_stock    INTEGER,
      scraped_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_seller_price_history
    ON seller_price_history(product_id, seller_name, scraped_at DESC);
  `);

  // Column additions for existing databases (SQLite has no ADD COLUMN IF NOT EXISTS)
  addColumnIfMissing('products', 'site', `TEXT NOT NULL DEFAULT 'amazon'`);
  addColumnIfMissing('products', 'in_stock', 'INTEGER');
  addColumnIfMissing('products', 'seller', 'TEXT');
  addColumnIfMissing('price_history', 'in_stock', 'INTEGER');
  addColumnIfMissing('change_events', 'seller_name', 'TEXT');
  addColumnIfMissing('products', 'cost_price', 'NUMERIC(10, 2)');

  console.log('Database migrations complete.');
}

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Migration: added ${table}.${column}`);
  }
}

module.exports = { query, runMigrations, db };
