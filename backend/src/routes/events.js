const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/events — recent competitor change events (newest first)
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const rows = db.prepare(`
      SELECT
        e.id, e.product_id, e.event_type, e.seller_name, e.old_price, e.new_price, e.created_at,
        p.name AS product_name, p.image_url, p.url, p.site, p.seller
      FROM change_events e
      JOIN products p ON p.id = e.product_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ?
    `).all(limit);
    res.json(rows);
  } catch (err) {
    console.error('GET /events error:', err);
    res.status(500).json({ error: 'Failed to fetch change events.' });
  }
});

module.exports = router;
