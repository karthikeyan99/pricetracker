const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Manages a Cloudflare quick tunnel so the dashboard is reachable from any
// internet connection. The public URL rotates on every restart, so we persist
// the latest one to a file and (when SMTP is configured) email it out.

let tunnelUrl = null;
let child = null;

const URL_FILE = path.join(__dirname, '../../public-url.txt');

function getTunnelUrl() {
  return tunnelUrl;
}

function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function findNgrok() {
  const candidates = [
    process.env.NGROK_PATH,
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\WinGet\\Packages\\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\\ngrok.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function emailTunnelUrl(url) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.ALERT_EMAIL) return;
  if (process.env.EMAIL_PASS === 'your_app_password') return;
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Price Tracker" <${process.env.EMAIL_USER}>`,
      to: process.env.ALERT_EMAIL,
      subject: `🔗 Competitor Watch link: ${url}`,
      html: `<p>Your Competitor Watch dashboard is online at:</p>
             <p><a href="${url}" style="font-size:18px;font-weight:bold;">${url}</a></p>
             <p style="color:#6b7280;font-size:13px;">This link changes whenever the PC restarts — the newest link is always emailed here.</p>`,
    });
    console.log(`Tunnel: public URL emailed to ${process.env.ALERT_EMAIL}`);
  } catch (err) {
    console.warn('Tunnel: could not email public URL:', err.message);
  }
}

function announce(url, permanent) {
  console.log(`Tunnel: dashboard is publicly reachable at ${url}`);
  try { fs.writeFileSync(URL_FILE, url + '\n'); } catch { /* non-fatal */ }
  emailTunnelUrl(url);
  const { sendWhatsApp } = require('./notifyService');
  const note = permanent
    ? 'This link is permanent — bookmark it.'
    : 'This link changes on PC restart.';
  sendWhatsApp(`🔗 *Competitor Watch is online*\n${url}\n${note} Login with your usual username and password.`);
}

// Preferred: ngrok with a fixed domain (URL never changes).
// Fallback: Cloudflare quick tunnel (URL rotates each restart).
function startTunnel(port) {
  const ngrokExe = findNgrok();
  const ngrokDomain = process.env.NGROK_DOMAIN;

  if (ngrokExe && ngrokDomain) {
    console.log(`Tunnel: starting ngrok on fixed domain ${ngrokDomain}...`);
    // Explicit --config: when started by Task Scheduler the user-profile env
    // may be incomplete and ngrok can't locate its authtoken config on its own.
    // Auth via NGROK_AUTHTOKEN env var (from .env) — the agent reads it directly.
    // More reliable than the ngrok.yml config file, which is not always visible
    // to processes started by Task Scheduler.
    const args = ['http', `--domain=${ngrokDomain}`, String(port), '--log', 'stdout'];
    child = spawn(ngrokExe, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN || '' },
    });
    child.on('error', (err) => console.warn('Tunnel(ngrok): spawn failed:', err.message));

    const onData = (buf) => {
      const text = buf.toString();
      if (!tunnelUrl && /started tunnel|url=https:/.test(text)) {
        tunnelUrl = `https://${ngrokDomain}`;
        announce(tunnelUrl, true);
      }
      if (/ERR_NGROK|authentication failed|failed to start tunnel/i.test(text)) {
        console.warn('Tunnel(ngrok):', text.slice(0, 300));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('exit', (code) => {
      console.warn(`Tunnel: ngrok exited (code ${code}) — restarting in 15s...`);
      tunnelUrl = null;
      child = null;
      setTimeout(() => startTunnel(port), 15000);
    });
    return;
  }

  const exe = findCloudflared();
  if (!exe) {
    console.warn('Tunnel: no tunnel client found — dashboard is LAN-only. Set NGROK_DOMAIN or CLOUDFLARED_PATH in .env.');
    return;
  }

  console.log('Tunnel: starting Cloudflare quick tunnel...');
  child = spawn(exe, ['tunnel', '--url', `http://localhost:${port}`], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const onData = (buf) => {
    const text = buf.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
      announce(tunnelUrl, false);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('exit', (code) => {
    console.warn(`Tunnel: cloudflared exited (code ${code}) — restarting in 15s...`);
    tunnelUrl = null;
    child = null;
    setTimeout(() => startTunnel(port), 15000);
  });
}

module.exports = { startTunnel, getTunnelUrl };
