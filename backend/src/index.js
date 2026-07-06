require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { runMigrations } = require('./db');
const { startScheduler, startRefreshAll, getRefreshState } = require('./scheduler');
const productsRouter = require('./routes/products');
const alertsRouter = require('./routes/alerts');
const eventsRouter = require('./routes/events');

const { startTunnel, getTunnelUrl } = require('./services/tunnelService');

const app = express();
const PORT = process.env.PORT || 5000;
const isCloudHost = !!(
  process.env.RENDER ||
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.FLY_APP_NAME ||
  process.env.K_SERVICE
);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Password gate — required because the tunnel makes this reachable from the
// whole internet. Browser asks once and remembers (HTTP Basic Auth).
const APP_USER = process.env.APP_USER;
const APP_PASS = process.env.APP_PASS;
if (APP_USER && APP_PASS) {
  const expected = 'Basic ' + Buffer.from(`${APP_USER}:${APP_PASS}`).toString('base64');
  app.use((req, res, next) => {
    // Direct localhost use (the PC itself) needs no login. Tunnel traffic also
    // arrives via localhost but always carries X-Forwarded-For — still challenged.
    const addr = req.socket.remoteAddress;
    const isLoopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (isLoopback && !req.headers['x-forwarded-for']) return next();
    if (req.headers.authorization === expected) return next();
    res.set('WWW-Authenticate', 'Basic realm="Competitor Watch"');
    res.status(401).send('Authentication required.');
  });
  console.log('Password protection enabled (skipped for direct localhost use).');
} else {
  console.warn('APP_USER/APP_PASS not set — dashboard is NOT password protected.');
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Refresh every product now (runs in the background; poll status below)
app.post('/api/refresh-all', (req, res) => {
  const started = startRefreshAll();
  res.status(started ? 202 : 409).json({ started, ...getRefreshState() });
});

app.get('/api/refresh-status', (req, res) => {
  res.json(getRefreshState());
});

// Store config for the frontend (who am I, who is the main rival)
app.get('/api/config', (req, res) => {
  res.json({
    myStore: process.env.MY_STORE || null,
    primaryCompetitor: process.env.PRIMARY_COMPETITOR || null,
    publicUrl: getTunnelUrl(),
  });
});

app.use('/api/products', productsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/events', eventsRouter);

// Serve the built dashboard (frontend/dist) so one server = one URL,
// reachable from the phone too: http://<pc-ip>:5000
const distDir = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: any non-API route serves the app shell
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.warn('frontend/dist not found — run "npm run build" in frontend/ to serve the dashboard from this server.');
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Best-effort "monitoring stopped" alert on graceful shutdown (Ctrl+C / process
// stop). A hard power-off can't be caught — silence after a "started" message
// with no "stopped" one means the PC went down uncleanly.
let shuttingDown = false;
async function notifyShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    const { sendWhatsApp } = require('./services/notifyService');
    sendWhatsApp('🛑 *Competitor Watch stopped* — monitoring is paused until the PC is back on.');
    await new Promise((r) => setTimeout(r, 4000)); // give the queue a moment to send
  } catch { /* exit anyway */ }
  process.exit(0);
}
process.on('SIGINT', () => notifyShutdown('SIGINT'));
process.on('SIGTERM', () => notifyShutdown('SIGTERM'));
process.on('SIGHUP', () => notifyShutdown('SIGHUP'));

async function start() {
  try {
    runMigrations();
    startScheduler();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      if (process.env.PUBLIC_TUNNEL !== 'off' && !isCloudHost) {
        startTunnel(PORT);
      } else if (isCloudHost) {
        console.log('Cloud host detected; local tunnel is disabled.');
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
