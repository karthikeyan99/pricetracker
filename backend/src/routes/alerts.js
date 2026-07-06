const express = require('express');
const router = express.Router();
const { db } = require('../db');

// POST /api/alerts — create a price-drop alert
router.post('/', async (req, res) => {
  const { product_id, email, target_price } = req.body;

  if (!product_id || !email || !target_price) {
    return res.status(400).json({ error: 'product_id, email, and target_price are required.' });
  }
  if (isNaN(parseFloat(target_price)) || parseFloat(target_price) <= 0) {
    return res.status(400).json({ error: 'target_price must be a positive number.' });
  }

  try {
    const productCheck = db.prepare(`SELECT id FROM products WHERE id = ?`).get(product_id);
    if (!productCheck) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const result = db.prepare(
      `INSERT INTO alerts (product_id, email, target_price)
       VALUES (?, ?, ?)`
    ).run(product_id, email, parseFloat(target_price));

    const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(alert);
  } catch (err) {
    console.error('POST /alerts error:', err);
    res.status(500).json({ error: 'Failed to create alert.' });
  }
});

// DELETE /api/alerts/:id — remove an alert
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = db.prepare(`DELETE FROM alerts WHERE id = ?`).run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alert not found.' });
    }
    res.json({ message: 'Alert removed.' });
  } catch (err) {
    console.error('DELETE /alerts/:id error:', err);
    res.status(500).json({ error: 'Failed to delete alert.' });
  }
});

// PATCH /api/alerts/:id/toggle — enable/disable an alert
router.patch('/:id/toggle', async (req, res) => {
  const { id } = req.params;
  try {
    db.prepare(
      `UPDATE alerts SET is_active = NOT is_active WHERE id = ?`
    ).run(id);

    const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found.' });
    }
    res.json(alert);
  } catch (err) {
    console.error('PATCH /alerts/:id/toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle alert.' });
  }
});

module.exports = router;
