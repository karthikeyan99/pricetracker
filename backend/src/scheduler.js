const cron = require('node-cron');
const { db } = require('./db');
const { checkProduct } = require('./services/tracker');

// Progress of the currently running sweep (used by the "Refresh All" button)
const refreshState = {
  running: false,
  total: 0,
  done: 0,
  errors: 0,
  startedAt: null,
  finishedAt: null,
};

function getRefreshState() {
  return { ...refreshState };
}

async function checkAllPrices() {
  if (refreshState.running) {
    console.log('Scheduler: sweep already in progress — skipping.');
    return false;
  }

  console.log(`[${new Date().toISOString()}] Running scheduled price check...`);

  let products;
  try {
    products = db.prepare(`SELECT * FROM products ORDER BY updated_at ASC`).all();
  } catch (err) {
    console.error('Scheduler: failed to load products:', err.message);
    return false;
  }

  refreshState.running = true;
  refreshState.total = products.length;
  refreshState.done = 0;
  refreshState.errors = 0;
  refreshState.startedAt = new Date().toISOString();
  refreshState.finishedAt = null;

  for (const product of products) {
    try {
      const { scraped, events } = await checkProduct(product);
      const stockLabel = scraped.inStock === 0 ? 'OUT OF STOCK' : scraped.inStock === 1 ? 'in stock' : 'stock unknown';
      console.log(
        `Scheduler: "${scraped.name || product.name}" → ${scraped.price ?? 'no price'} (${stockLabel})` +
        (events.length ? ` — ${events.map((e) => e.event_type).join(', ')}` : '')
      );

      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 2000));
    } catch (err) {
      refreshState.errors++;
      console.error(`Scheduler: error processing product ${product.id}:`, err.message);
    } finally {
      refreshState.done++;
    }
  }

  refreshState.running = false;
  refreshState.finishedAt = new Date().toISOString();
  console.log(`[${new Date().toISOString()}] Price check complete (${refreshState.done} checked, ${refreshState.errors} errors).`);
  return true;
}

// Fire-and-forget sweep for the "Refresh All" button; returns false if one is already running
function startRefreshAll() {
  if (refreshState.running) return false;
  checkAllPrices().catch((err) => {
    refreshState.running = false;
    refreshState.finishedAt = new Date().toISOString();
    console.error('Refresh-all sweep failed:', err.message);
  });
  return true;
}

function startScheduler() {
  const cronExpression = process.env.PRICE_CHECK_CRON || '*/30 * * * *';

  if (!cron.validate(cronExpression)) {
    console.warn(`Invalid cron expression "${cronExpression}". Using default: */30 * * * *`);
  }

  cron.schedule(cron.validate(cronExpression) ? cronExpression : '*/30 * * * *', checkAllPrices);
  console.log(`Scheduler started. Cron: "${cronExpression}"`);

  // Morning "opening" and evening "closing" business reports (local time)
  const { sendDigest } = require('./services/digestService');
  const openCron = process.env.DIGEST_OPENING_CRON || '0 9 * * *';
  const closeCron = process.env.DIGEST_CLOSING_CRON || '0 21 * * *';
  if (cron.validate(openCron)) {
    cron.schedule(openCron, () => sendDigest('opening'));
    console.log(`Opening report scheduled: "${openCron}"`);
  }
  if (cron.validate(closeCron)) {
    cron.schedule(closeCron, () => sendDigest('closing'));
    console.log(`Closing report scheduled: "${closeCron}"`);
  }
}

module.exports = { startScheduler, checkAllPrices, startRefreshAll, getRefreshState };
