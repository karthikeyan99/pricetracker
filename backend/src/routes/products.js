const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { scrapeProduct, detectSite } = require('../services/scraper');
const { checkProduct, syncSellers } = require('../services/tracker');
const { fetchFlipkartSellers } = require('../services/flipkartScraper');

// Helper to convert SQL from $1, $2 style to ? style
function convertSql(sql, params) {
  let converted = sql;
  let paramIndex = 0;
  converted = converted.replace(/\$\d+/g, () => {
    paramIndex++;
    return '?';
  });
  return { sql: converted, params };
}

// GET /api/products — list all tracked products
router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT
        p.*,
        (SELECT price FROM price_history WHERE product_id = p.id ORDER BY scraped_at DESC LIMIT 1) AS latest_price,
        (SELECT price FROM price_history WHERE product_id = p.id ORDER BY scraped_at ASC  LIMIT 1) AS initial_price,
        (SELECT MIN(price) FROM price_history WHERE product_id = p.id) AS lowest_price,
        (SELECT MAX(price) FROM price_history WHERE product_id = p.id) AS highest_price,
        (SELECT COUNT(*) FROM price_history WHERE product_id = p.id) AS data_points
      FROM products p
      ORDER BY p.created_at DESC
    `;
    const rows = db.prepare(sql).all();

    // Attach current seller offers (multi-seller Flipkart listings)
    const allOffers = db.prepare(
      `SELECT product_id, seller_name, price, is_buybox, in_stock, rating, is_mine
       FROM seller_offers ORDER BY is_mine DESC, price ASC`
    ).all();
    const offersByProduct = new Map();
    for (const o of allOffers) {
      if (!offersByProduct.has(o.product_id)) offersByProduct.set(o.product_id, []);
      offersByProduct.get(o.product_id).push(o);
    }
    res.json(rows.map((r) => ({ ...r, sellers: offersByProduct.get(r.id) || [] })));
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

// GET /api/products/:id — single product with price history
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const history = db.prepare(`
      SELECT price, scraped_at FROM price_history
      WHERE product_id = ?
      ORDER BY scraped_at ASC
    `).all(id);

    const alerts = db.prepare(`
      SELECT id, email, target_price, is_active, triggered_at, created_at
      FROM alerts WHERE product_id = ? ORDER BY created_at DESC
    `).all(id);

    const sellers = db.prepare(`
      SELECT seller_name, price, is_buybox, in_stock, rating, is_mine, updated_at
      FROM seller_offers WHERE product_id = ? ORDER BY is_mine DESC, price ASC
    `).all(id);

    res.json({
      ...product,
      history,
      alerts,
      sellers,
    });
  } catch (err) {
    console.error('GET /products/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch product details.' });
  }
});

// POST /api/products — add a new product by URL
router.post('/', async (req, res) => {
  const { url } = req.body;
  if (!url || !detectSite(url)) {
    return res.status(400).json({ error: 'A valid Flipkart or Amazon product URL is required.' });
  }

  try {
    // Check if already tracked
    const existing = db.prepare(`SELECT id FROM products WHERE url = ?`).get(url);
    if (existing) {
      return res.status(409).json({ error: 'This product is already being tracked.', id: existing.id });
    }

    // Scrape product details
    const scraped = await scrapeProduct(url);

    // Insert product
    const result = db.prepare(
      `INSERT INTO products (url, asin, name, image_url, current_price, in_stock, seller, site, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(scraped.url, scraped.asin, scraped.name, scraped.imageUrl, scraped.price,
          scraped.inStock ?? null, scraped.seller ?? null, scraped.site || 'amazon');

    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(result.lastInsertRowid);

    // Record first price point
    if (scraped.price !== null) {
      db.prepare(
        `INSERT INTO price_history (product_id, price, in_stock) VALUES (?, ?, ?)`
      ).run(product.id, scraped.price, scraped.inStock ?? null);
    }

    // Populate the seller list right away (no events on first sync)
    let sellers = [];
    if (scraped.site === 'flipkart' && scraped.asin && !/^itm/i.test(scraped.asin)) {
      try {
        const liveSellers = await fetchFlipkartSellers(scraped.asin);
        syncSellers(product, liveSellers);
        sellers = db.prepare(
          `SELECT seller_name, price, is_buybox, in_stock, rating, is_mine
           FROM seller_offers WHERE product_id = ? ORDER BY is_mine DESC, price ASC`
        ).all(product.id);
      } catch (err) {
        console.warn(`POST /products: seller list fetch failed: ${err.message}`);
      }
    }

    res.status(201).json({ ...product, sellers });
  } catch (err) {
    console.error('POST /products error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to add product.' });
  }
});

// POST /api/products/:id/refresh — manually trigger a price check
router.post('/:id/refresh', async (req, res) => {
  const { id } = req.params;
  try {
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Full check: persists snapshot, detects price/stock changes, sends alerts
    const { scraped, events } = await checkProduct(product);

    const updated = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    const sellers = db.prepare(
      `SELECT seller_name, price, is_buybox, in_stock, rating, is_mine
       FROM seller_offers WHERE product_id = ? ORDER BY is_mine DESC, price ASC`
    ).all(id);
    res.json({ ...updated, events, sellers });
  } catch (err) {
    console.error('POST /products/:id/refresh error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to refresh price.' });
  }
});

// PATCH /api/products/:id — update editable fields (cost price)
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { cost_price } = req.body;
  try {
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    if (cost_price !== undefined) {
      const value = cost_price === null || cost_price === '' ? null : parseFloat(cost_price);
      if (value !== null && (isNaN(value) || value < 0)) {
        return res.status(400).json({ error: 'cost_price must be a non-negative number or null.' });
      }
      db.prepare(`UPDATE products SET cost_price = ? WHERE id = ?`).run(value, id);
    }
    res.json(db.prepare(`SELECT * FROM products WHERE id = ?`).get(id));
  } catch (err) {
    console.error('PATCH /products/:id error:', err);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

// DELETE /api/products/:id — remove a tracked product
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ message: 'Product removed.' });
  } catch (err) {
    console.error('DELETE /products/:id error:', err);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

module.exports = router;
