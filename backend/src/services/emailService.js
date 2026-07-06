const nodemailer = require('nodemailer');
require('dotenv').config();

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendPriceDropAlert({ to, productName, productUrl, targetPrice, currentPrice, imageUrl }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email credentials not configured — skipping alert send.');
    return;
  }

  const transporter = createTransporter();

  const savings = targetPrice - currentPrice;
  const savingsPct = ((savings / targetPrice) * 100).toFixed(1);

  const imgTag = imageUrl
    ? `<img src="${imageUrl}" alt="${productName}" style="max-width:200px;border-radius:8px;margin-bottom:16px;" />`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    .header { background: #f97316; padding: 24px; text-align: center; color: #fff; }
    .header h1 { margin: 0; font-size: 22px; }
    .body { padding: 32px; text-align: center; }
    .price-block { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .price-new { font-size: 36px; font-weight: bold; color: #16a34a; }
    .price-target { font-size: 14px; color: #6b7280; margin-top: 4px; }
    .btn { display: inline-block; background: #f97316; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold; margin-top: 20px; }
    .footer { padding: 16px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Price Drop Alert!</h1>
    </div>
    <div class="body">
      ${imgTag}
      <p style="font-size:18px;font-weight:600;color:#111827;">${productName}</p>
      <div class="price-block">
        <div class="price-new">$${currentPrice.toFixed(2)}</div>
        <div class="price-target">Your target was $${targetPrice.toFixed(2)} — you save $${savings.toFixed(2)} (${savingsPct}%)</div>
      </div>
      <a href="${productUrl}" class="btn">View on Amazon</a>
    </div>
    <div class="footer">
      You received this because you set a price alert on Amazon Price Tracker.<br/>
      <a href="${productUrl}">${productUrl}</a>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"Amazon Price Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Price Drop: ${productName} is now $${currentPrice.toFixed(2)}`,
    html,
  });

  console.log(`Alert email sent to ${to} for "${productName}"`);
}

// Copy per event type: what happened + what the seller should do about it
const EVENT_COPY = {
  PRICE_DROP: {
    emoji: '🔻',
    title: 'Competitor Dropped Their Price',
    color: '#dc2626',
    advice: 'They are now cheaper. Consider lowering your price just below theirs to keep winning the sale.',
  },
  PRICE_INCREASE: {
    emoji: '🔺',
    title: 'Competitor Raised Their Price',
    color: '#16a34a',
    advice: 'They raised their price — you have room to increase yours and still stay the cheapest option.',
  },
  OUT_OF_STOCK: {
    emoji: '🚫',
    title: 'Competitor is OUT OF STOCK',
    color: '#16a34a',
    advice: 'Their listing is unavailable. Raise your price now — buyers have no cheaper alternative until they restock.',
  },
  BACK_IN_STOCK: {
    emoji: '📦',
    title: 'Competitor is Back In Stock',
    color: '#d97706',
    advice: 'They are selling again. Re-check your price and make sure you are still competitive.',
  },
  BUYBOX_CHANGE: {
    emoji: '🥇',
    title: 'Buy Box Changed Hands',
    color: '#2563eb',
    advice: 'The default "Buy Now" seller on this listing changed. If it is not your store, most buyers are now purchasing from the new holder — check your price and delivery speed.',
  },
};

async function sendChangeAlert({ to, eventType, productName, productUrl, oldPrice, newPrice, seller, currency = '₹' }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email credentials not configured — skipping change alert send.');
    return;
  }

  const copy = EVENT_COPY[eventType];
  if (!copy) return;

  const transporter = createTransporter();

  const fmt = (v) => (v != null ? `${currency}${parseFloat(v).toFixed(2)}` : '—');
  const isPriceEvent = eventType === 'PRICE_DROP' || eventType === 'PRICE_INCREASE';

  const priceBlock = isPriceEvent
    ? `<div style="font-size:32px;font-weight:bold;color:${copy.color};">${fmt(newPrice)}</div>
       <div style="font-size:14px;color:#6b7280;margin-top:4px;">was ${fmt(oldPrice)}</div>`
    : `<div style="font-size:24px;font-weight:bold;color:${copy.color};">${copy.title}</div>
       ${newPrice != null ? `<div style="font-size:14px;color:#6b7280;margin-top:4px;">last price ${fmt(newPrice)}</div>` : ''}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:0;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);">
    <div style="background:#1e293b;padding:24px;text-align:center;color:#fff;">
      <h1 style="margin:0;font-size:20px;">${copy.emoji} ${copy.title}</h1>
    </div>
    <div style="padding:32px;text-align:center;">
      <p style="font-size:16px;font-weight:600;color:#111827;">${productName}</p>
      ${seller ? `<p style="font-size:13px;color:#6b7280;">Seller: ${seller}</p>` : ''}
      <div style="background:#f8fafc;border:2px solid ${copy.color};border-radius:8px;padding:20px;margin:20px 0;">
        ${priceBlock}
      </div>
      <p style="font-size:14px;color:#374151;background:#fefce8;border-radius:8px;padding:12px;">
        💡 ${copy.advice}
      </p>
      <a href="${productUrl}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:bold;margin-top:16px;">View Listing</a>
    </div>
    <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
      Competitor watch alert from Price Tracker.<br/>
      <a href="${productUrl}">${productUrl}</a>
    </div>
  </div>
</body>
</html>`;

  const sellerTag = seller ? ` [${seller}]` : '';
  const subject = isPriceEvent
    ? `${copy.emoji} ${copy.title}${sellerTag}: ${productName} now ${fmt(newPrice)} (was ${fmt(oldPrice)})`
    : `${copy.emoji} ${copy.title}${sellerTag}: ${productName}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"Price Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });

  console.log(`Change alert (${eventType}) sent to ${to} for "${productName}"`);
}

module.exports = { sendPriceDropAlert, sendChangeAlert };
