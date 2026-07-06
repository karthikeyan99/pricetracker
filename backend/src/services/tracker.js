const { db } = require('../db');
const { scrapeProduct } = require('./scraper');
const { fetchFlipkartSellers } = require('./flipkartScraper');
const { sendPriceDropAlert, sendChangeAlert } = require('./emailService');
const { sendWhatsApp, formatChangeMessage } = require('./notifyService');

function currencyFor(product) {
  try {
    const host = new URL(product.url).hostname;
    if (host.includes('flipkart') || host.endsWith('.in')) return '₹';
  } catch { /* fall through */ }
  return '$';
}

// "GoldTouch Glows" and "GoldTouchGlows" are the same store
function normaliseName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '');
}

function isMyStore(sellerName) {
  const mine = process.env.MY_STORE;
  return !!mine && normaliseName(sellerName) === normaliseName(mine);
}

// Diff the live seller list against the stored snapshot. Returns events
// (seller-scoped). The user's own store never generates price/stock events.
function diffSellers(product, sellers) {
  const events = [];
  const prevOffers = db.prepare(`SELECT * FROM seller_offers WHERE product_id = ?`).all(product.id);
  const prevByName = new Map(prevOffers.map((o) => [normaliseName(o.seller_name), o]));
  const currentNames = new Set(sellers.map((s) => normaliseName(s.sellerName)));

  for (const s of sellers) {
    const prev = prevByName.get(normaliseName(s.sellerName));
    const mine = isMyStore(s.sellerName);

    db.prepare(
      `INSERT INTO seller_offers (product_id, seller_id, seller_name, price, is_buybox, in_stock, rating, is_mine, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(product_id, seller_name) DO UPDATE SET
         seller_id = excluded.seller_id,
         price = excluded.price,
         is_buybox = excluded.is_buybox,
         in_stock = 1,
         rating = excluded.rating,
         is_mine = excluded.is_mine,
         updated_at = CURRENT_TIMESTAMP`
    ).run(product.id, s.sellerId, s.sellerName, s.price, s.isBuybox, s.rating, mine ? 1 : 0);

    db.prepare(
      `INSERT INTO seller_price_history (product_id, seller_name, price, in_stock) VALUES (?, ?, ?, 1)`
    ).run(product.id, s.sellerName, s.price);

    if (mine) continue;

    if (prev && prev.in_stock === 0) {
      events.push({ event_type: 'BACK_IN_STOCK', seller_name: s.sellerName, old_price: prev.price, new_price: s.price });
    } else if (prev && prev.price != null && s.price != null && parseFloat(prev.price) !== s.price) {
      events.push({
        event_type: s.price < parseFloat(prev.price) ? 'PRICE_DROP' : 'PRICE_INCREASE',
        seller_name: s.sellerName,
        old_price: parseFloat(prev.price),
        new_price: s.price,
      });
    }
  }

  // Sellers that vanished from the list = their offer is unavailable
  for (const prev of prevOffers) {
    if (currentNames.has(normaliseName(prev.seller_name))) continue;
    if (prev.in_stock === 0) continue; // already known to be out
    db.prepare(
      `UPDATE seller_offers SET in_stock = 0, is_buybox = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(prev.id);
    db.prepare(
      `INSERT INTO seller_price_history (product_id, seller_name, price, in_stock) VALUES (?, ?, ?, 0)`
    ).run(product.id, prev.seller_name, prev.price);
    if (!isMyStore(prev.seller_name)) {
      events.push({ event_type: 'OUT_OF_STOCK', seller_name: prev.seller_name, old_price: prev.price, new_price: prev.price });
    }
  }

  // Buy-box handover (always reported — winning or losing it matters most)
  const prevBuybox = prevOffers.find((o) => o.is_buybox === 1);
  const currBuybox = sellers.find((s) => s.isBuybox === 1);
  if (prevBuybox && currBuybox && normaliseName(prevBuybox.seller_name) !== normaliseName(currBuybox.sellerName)) {
    events.push({
      event_type: 'BUYBOX_CHANGE',
      seller_name: currBuybox.sellerName,
      old_price: prevBuybox.price,
      new_price: currBuybox.price,
    });
  }

  return events;
}

// Scrape a product, persist the result, detect changes vs the previous
// snapshot, log change events, and send alert emails. Returns { scraped, events, sellers }.
async function checkProduct(product) {
  const scraped = await scrapeProduct(product.url);

  const prevPrice = product.current_price != null ? parseFloat(product.current_price) : null;
  const prevStock = product.in_stock; // null = unknown, 1 = in stock, 0 = out
  let events = [];
  let sellers = null;

  // Multi-seller tracking (Flipkart): per-seller diff is the source of truth
  if (scraped.site === 'flipkart' && scraped.asin && !/^itm/i.test(scraped.asin)) {
    try {
      sellers = await fetchFlipkartSellers(scraped.asin);
    } catch (err) {
      console.warn(`Tracker: seller list fetch failed for product ${product.id}: ${err.message}`);
    }
  }

  if (sellers && sellers.length > 0) {
    events = diffSellers(product, sellers);
  } else {
    // Single-seller / Amazon / seller API unavailable: product-level diff
    if (scraped.price != null && prevPrice != null && scraped.price !== prevPrice) {
      events.push({
        event_type: scraped.price < prevPrice ? 'PRICE_DROP' : 'PRICE_INCREASE',
        seller_name: scraped.seller || null,
        old_price: prevPrice,
        new_price: scraped.price,
      });
    }
    if (scraped.inStock != null && prevStock != null && scraped.inStock !== prevStock) {
      events.push({
        event_type: scraped.inStock === 0 ? 'OUT_OF_STOCK' : 'BACK_IN_STOCK',
        seller_name: scraped.seller || null,
        old_price: prevPrice,
        new_price: scraped.price ?? prevPrice,
      });
    }
  }

  // Buy-box seller name (from seller list when available)
  const buybox = sellers && sellers.find((s) => s.isBuybox === 1);

  // --- Persist product snapshot ---
  db.prepare(
    `UPDATE products SET
       current_price = COALESCE(?, current_price),
       name = COALESCE(?, name),
       image_url = COALESCE(?, image_url),
       in_stock = COALESCE(?, in_stock),
       seller = COALESCE(?, seller),
       site = COALESCE(?, site),
       asin = COALESCE(?, asin),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(scraped.price, scraped.name, scraped.imageUrl, scraped.inStock,
        (buybox && buybox.sellerName) || scraped.seller, scraped.site, scraped.asin, product.id);

  if (scraped.price != null) {
    db.prepare(
      `INSERT INTO price_history (product_id, price, in_stock) VALUES (?, ?, ?)`
    ).run(product.id, scraped.price, scraped.inStock);
  }

  // --- Log events + send change alerts ---
  const alertEmail = process.env.ALERT_EMAIL;
  const currency = currencyFor(product);

  for (const event of events) {
    db.prepare(
      `INSERT INTO change_events (product_id, event_type, seller_name, old_price, new_price) VALUES (?, ?, ?, ?, ?)`
    ).run(product.id, event.event_type, event.seller_name || null, event.old_price, event.new_price);

    console.log(`Tracker: ${event.event_type}${event.seller_name ? ` [${event.seller_name}]` : ''} for "${scraped.name || product.name}" (${event.old_price} → ${event.new_price})`);

    // WhatsApp alert (if configured)
    sendWhatsApp(formatChangeMessage({
      eventType: event.event_type,
      productName: scraped.name || product.name || product.url,
      seller: event.seller_name || scraped.seller || product.seller,
      oldPrice: event.old_price,
      newPrice: event.new_price,
      currency,
      url: product.url,
    }));

    if (alertEmail) {
      try {
        await sendChangeAlert({
          to: alertEmail,
          eventType: event.event_type,
          productName: scraped.name || product.name || product.url,
          productUrl: product.url,
          oldPrice: event.old_price,
          newPrice: event.new_price,
          seller: event.seller_name || scraped.seller || product.seller,
          currency,
        });
      } catch (emailErr) {
        console.error(`Tracker: change alert email failed for product ${product.id}:`, emailErr.message);
      }
    }
  }

  // --- Legacy target-price alerts ---
  if (scraped.price != null) {
    const alerts = db.prepare(
      `SELECT * FROM alerts WHERE product_id = ? AND is_active = 1 AND target_price >= ?`
    ).all(product.id, scraped.price);

    for (const alert of alerts) {
      try {
        await sendPriceDropAlert({
          to: alert.email,
          productName: scraped.name || product.name,
          productUrl: product.url,
          targetPrice: parseFloat(alert.target_price),
          currentPrice: scraped.price,
          imageUrl: scraped.imageUrl || product.image_url,
        });
        db.prepare(
          `UPDATE alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(alert.id);
      } catch (emailErr) {
        console.error(`Tracker: email failed for alert ${alert.id}:`, emailErr.message);
      }
    }
  }

  return { scraped, events, sellers };
}

module.exports = { checkProduct, currencyFor, isMyStore, syncSellers: diffSellers };
