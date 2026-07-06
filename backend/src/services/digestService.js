const { db } = require('../db');
const { sendWhatsApp } = require('./notifyService');
const { getTunnelUrl } = require('./tunnelService');

function normaliseName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '');
}

const EVENT_LABELS = {
  PRICE_DROP: '🔻 price drop',
  PRICE_INCREASE: '🔺 price rise',
  OUT_OF_STOCK: '🚫 out of stock',
  BACK_IN_STOCK: '📦 back in stock',
  BUYBOX_CHANGE: '🥇 buy box change',
};

// Current action counts across the catalog (same logic as the dashboard tiles)
function currentStatus() {
  const products = db.prepare(`SELECT id, in_stock FROM products`).all();
  const offers = db.prepare(`SELECT * FROM seller_offers`).all();
  const byProduct = new Map();
  for (const o of offers) {
    if (!byProduct.has(o.product_id)) byProduct.set(o.product_id, []);
    byProduct.get(o.product_id).push(o);
  }

  const rivalName = normaliseName(process.env.PRIMARY_COMPETITOR);
  let undercut = 0;
  let rivalGone = 0;
  let listingOut = 0;

  for (const p of products) {
    const sellers = byProduct.get(p.id) || [];
    const mine = sellers.find((s) => s.is_mine === 1 && s.in_stock === 1);
    if (p.in_stock === 0) listingOut++;
    if (!mine) continue;
    if (sellers.some((s) => !s.is_mine && s.in_stock === 1 && s.price != null && mine.price != null
        && parseFloat(s.price) < parseFloat(mine.price))) {
      undercut++;
    }
    if (rivalName) {
      const rival = sellers.find((s) => normaliseName(s.seller_name) === rivalName);
      if (!rival || rival.in_stock === 0) rivalGone++;
    }
  }

  return { total: products.length, undercut, rivalGone, listingOut };
}

function buildDigest(kind) {
  const hours = 12;
  const events = db.prepare(`
    SELECT e.event_type, e.seller_name, e.old_price, e.new_price, p.name
    FROM change_events e JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= datetime('now', ?)
    ORDER BY e.created_at DESC
  `).all(`-${hours} hours`);

  const status = currentStatus();
  const rival = process.env.PRIMARY_COMPETITOR || 'Main rival';
  const header = kind === 'opening'
    ? '🌅 *Opening Report — Competitor Watch*'
    : '🌙 *Closing Report — Competitor Watch*';
  const windowLabel = kind === 'opening' ? 'Overnight' : 'Today';

  const lines = [header, ''];

  if (events.length === 0) {
    lines.push(`${windowLabel}: no competitor changes in the last ${hours}h. ✅`);
  } else {
    lines.push(`${windowLabel}: *${events.length} change${events.length !== 1 ? 's' : ''}* (last ${hours}h):`);
    for (const e of events.slice(0, 8)) {
      const label = EVENT_LABELS[e.event_type] || e.event_type;
      const who = e.seller_name ? `${e.seller_name} ` : '';
      const prices = (e.event_type === 'PRICE_DROP' || e.event_type === 'PRICE_INCREASE')
        ? ` ₹${parseFloat(e.old_price).toFixed(0)}→₹${parseFloat(e.new_price).toFixed(0)}`
        : '';
      lines.push(`• ${who}${label}${prices} — ${String(e.name).slice(0, 45)}`);
    }
    if (events.length > 8) lines.push(`…and ${events.length - 8} more on the dashboard.`);
  }

  lines.push('');
  lines.push('*Right now:*');
  lines.push(`⚠️ Undercut by rivals: ${status.undercut} product${status.undercut !== 1 ? 's' : ''}`);
  lines.push(`🚀 ${rival} not selling: ${status.rivalGone} — room to raise prices`);
  if (status.listingOut > 0) lines.push(`🚫 Listings out of stock: ${status.listingOut}`);
  lines.push('');
  lines.push(getTunnelUrl() || 'https://tinyurl.com/gtgwatch');

  return lines.join('\n');
}

function sendDigest(kind) {
  const message = buildDigest(kind);
  const sent = sendWhatsApp(message);
  console.log(`Digest: ${kind} report ${sent ? 'sent' : 'skipped (no notification channel configured)'}.`);
  return sent;
}

module.exports = { sendDigest, buildDigest };
