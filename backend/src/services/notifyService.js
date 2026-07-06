const axios = require('axios');

// Phone notifications, two channels (whichever is configured; both is fine):
//
// 1. Telegram bot (preferred — official API, instant, reliable):
//    TELEGRAM_BOT_TOKEN=123456:ABC...   (from @BotFather)
//    TELEGRAM_CHAT_ID=123456789         (your chat with the bot)
//
// 2. WhatsApp via CallMeBot (free personal gateway, can be flaky):
//    WHATSAPP_PHONE=+91XXXXXXXXXX
//    CALLMEBOT_APIKEY=XXXXXX
//
// Messages go through a serial queue: CallMeBot rate-limits hard (12s gap);
// Telegram is fast (1s gap).

const queue = [];
let draining = false;

function telegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function whatsappConfigured() {
  return !!(process.env.WHATSAPP_PHONE && process.env.CALLMEBOT_APIKEY);
}

function isConfigured() {
  return telegramConfigured() || whatsappConfigured();
}

async function sendViaTelegram(text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const base = { chat_id: process.env.TELEGRAM_CHAT_ID, text };
  // Try Markdown first (for *bold*); product names can break Markdown parsing,
  // so fall back to plain text on a parse error.
  let r = await axios.post(url, { ...base, parse_mode: 'Markdown' }, { timeout: 30000, validateStatus: () => true });
  if (r.status !== 200) {
    r = await axios.post(url, base, { timeout: 30000, validateStatus: () => true });
  }
  if (r.status === 200) {
    console.log('Telegram: message sent.');
  } else {
    console.warn(`Telegram: send failed (HTTP ${r.status}): ${JSON.stringify(r.data).slice(0, 150)}`);
  }
}

async function sendViaWhatsApp(text) {
  const { status, data } = await axios.get('https://api.callmebot.com/whatsapp.php', {
    params: { phone: process.env.WHATSAPP_PHONE, apikey: process.env.CALLMEBOT_APIKEY, text },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (status === 200) {
    console.log('WhatsApp: message sent.');
  } else {
    console.warn(`WhatsApp: send failed (HTTP ${status}): ${String(data).slice(0, 120)}`);
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length > 0) {
    const text = queue.shift();
    if (telegramConfigured()) {
      try { await sendViaTelegram(text); } catch (err) { console.warn('Telegram: send failed:', err.message); }
    }
    if (whatsappConfigured()) {
      try { await sendViaWhatsApp(text); } catch (err) { console.warn('WhatsApp: send failed:', err.message); }
    }
    if (queue.length > 0) {
      await new Promise((r) => setTimeout(r, whatsappConfigured() ? 12000 : 1000));
    }
  }
  draining = false;
}

// Queue a phone notification; no-op when no channel is configured.
function sendWhatsApp(text) {
  if (!isConfigured()) return false;
  queue.push(text);
  drain();
  return true;
}

// Compact per-event message for competitor changes
function formatChangeMessage({ eventType, productName, seller, oldPrice, newPrice, currency = '₹', url }) {
  const name = String(productName).slice(0, 70);
  const fmt = (v) => (v != null ? `${currency}${parseFloat(v).toFixed(0)}` : '—');
  const lines = {
    PRICE_DROP: `🔻 *${seller || 'Competitor'} dropped price*\n${name}\n${fmt(oldPrice)} → *${fmt(newPrice)}*\nThey are cheaper now — consider lowering your price.`,
    PRICE_INCREASE: `🔺 *${seller || 'Competitor'} raised price*\n${name}\n${fmt(oldPrice)} → *${fmt(newPrice)}*\nRoom to raise yours and stay cheapest.`,
    OUT_OF_STOCK: `🚫 *${seller || 'Competitor'} OUT OF STOCK*\n${name}\nRaise your price — buyers have no alternative until they restock.`,
    BACK_IN_STOCK: `📦 *${seller || 'Competitor'} back in stock*\n${name}\nRe-check your price.`,
    BUYBOX_CHANGE: `🥇 *Buy box changed*\n${name}\nNow held by *${seller || 'unknown'}* at ${fmt(newPrice)}.`,
  };
  const body = lines[eventType] || `${eventType}: ${name}`;
  return url ? `${body}\n${url}` : body;
}

module.exports = { sendWhatsApp, formatChangeMessage, isConfigured };
