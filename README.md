# Price Tracker — Flipkart & Amazon Competitor Watch

A full-stack web app to watch competitor listings on **Flipkart** and **Amazon** — track price history and stock status, and get an email the moment a competitor:

- **drops their price** (so you can undercut them)
- **raises their price** (so you can raise yours and stay cheapest)
- **goes out of stock** (so you can raise your price while they can't sell)
- **comes back in stock** (so you can re-check your pricing)

Alerts are sent to the address in `ALERT_EMAIL`, and every change is logged in the "Recent Competitor Changes" feed on the dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Scraping | Axios + Cheerio |
| Email | Nodemailer (SMTP) |
| Scheduling | node-cron |

---

## Project Structure

```
amazon-price-tracker/
├── backend/
│   ├── src/
│   │   ├── db/index.js          # SQLite setup + migrations
│   │   ├── routes/
│   │   │   ├── products.js      # CRUD for tracked products
│   │   │   └── alerts.js        # Price alert management
│   │   ├── services/
│   │   │   ├── scraper.js       # Axios + Cheerio Amazon scraper
│   │   │   └── emailService.js  # Nodemailer price-drop emails
│   │   ├── scheduler.js         # node-cron price-check job
│   │   └── index.js             # Express app entry point
│   ├── .env.example
│   ├── package.json
│   └── amazon_price_tracker.db  # SQLite database (created on first run)
└── frontend/
    ├── src/
    │   ├── api/index.js          # Axios API client
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── AddProductForm.jsx
    │   │   ├── ProductCard.jsx    # shows price delta, all-time-low badge
    │   │   ├── PriceChart.jsx     # Recharts area chart + alert reference lines
    │   │   └── AlertModal.jsx
    │   ├── pages/Dashboard.jsx    # stats overview + product list
    │   └── pages/ProductDetail.jsx # chart, history table, actions
    └── ...config files (Vite, Tailwind, PostCSS)
```

---

## Prerequisites

- Node.js 18+

That's it! No database installation needed. SQLite uses a local file (`amazon_price_tracker.db`).

---

## Setup

### 1. Backend

```bash
cd backend
npm install

# Copy and fill in your environment variables
cp .env.example .env
```

Edit `backend/.env` (only email config needed):

```
PORT=5000

# For Gmail: use an App Password (not your account password)
# https://myaccount.google.com/apppasswords
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=you@gmail.com
EMAIL_PASS=your_16_char_app_password
EMAIL_FROM=Price Tracker <you@gmail.com>

# Where competitor change alerts (price up/down, stock in/out) are sent
ALERT_EMAIL=you@gmail.com

# Cron: default is every 30 minutes
PRICE_CHECK_CRON=*/30 * * * *
```

Start the backend (database creates automatically on first run):

```bash
npm run dev     # development (nodemon)
# or
npm start       # production
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 3. Single-server mode (recommended for daily use)

Build the frontend once and the backend serves the whole app on one URL:

```bash
cd frontend && npm run build
cd ../backend && npm start
```

- On this PC: http://localhost:5000
- From a phone on the same WiFi: `http://<pc-ip>:5000` (allow TCP 5000 in Windows Firewall).
  On the phone, use the browser menu → **Add to Home Screen** to install it like an app (PWA manifest included).
- Auto-start at logon: `start-tracker.vbs` (a copy in the Windows Startup folder launches the tracker silently on every login).

---

## API Reference

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | List all tracked products with stats |
| `GET` | `/api/products/:id` | Product detail + price history + alerts |
| `POST` | `/api/products` | Add product `{ url }` |
| `POST` | `/api/products/:id/refresh` | Manually re-scrape price |
| `DELETE` | `/api/products/:id` | Stop tracking |

### Change Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events?limit=50` | Recent competitor changes (price up/down, stock in/out) |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/alerts` | Create alert `{ product_id, email, target_price }` |
| `PATCH` | `/api/alerts/:id/toggle` | Enable / disable alert |
| `DELETE` | `/api/alerts/:id` | Delete alert |

---

## Features

- **Per-seller tracking (Flipkart)** — on multi-seller listings, every seller's offer is tracked separately. Set `MY_STORE` to your store name: your own price changes never trigger alerts, and the dashboard shows "You ₹395 · Rival ₹360 …" chips per listing with an **"Undercut by …"** warning when a rival is cheaper. `PRIMARY_COMPETITOR` is highlighted as your main rival.
- **Buy-box alerts** — email when the default "Buy Now" seller changes hands (you won or lost the buy box)
- **Competitor change alerts** — email sent to `ALERT_EMAIL` on price drop, price increase, out-of-stock, and back-in-stock, each with a suggested repricing action
- **Change feed** — dashboard panel listing every detected competitor change
- **Stock tracking** — in-stock / out-of-stock status stored with every price check
- **Flipkart support** — paste any Flipkart product URL (`/p/itm…` format); price, stock, and image are parsed from the listing
- **Track by URL** — paste any Amazon product URL (supports `/dp/`, `/gp/product/` formats)
- **Price history chart** — interactive area chart with all recorded price points
- **All-time low badge** — highlights when the current price is the lowest ever seen
- **Email alerts** — beautiful HTML email sent when price drops to or below your target
- **Auto-scheduling** — configurable cron job checks all products periodically
- **Manual refresh** — trigger an immediate price check from the UI
- **Alert management** — enable/disable/delete alerts per product
- **Portable SQLite DB** — no server setup needed, just works on any machine

---

## Notes on Scraping

Amazon actively detects and blocks scrapers. This app uses rotating User-Agent strings and reasonable request delays, but scraping may fail occasionally (especially for new IPs or high-traffic periods). For production use, consider:

- [ScraperAPI](https://www.scraperapi.com/) — proxy rotation + CAPTCHA bypass
- [Rainforest API](https://www.rainforestapi.com/) — official Amazon data API
- [Amazon Product Advertising API](https://affiliate-program.amazon.com/help/topic/t405) — official (requires affiliate account)

---

## Database

The SQLite database file (`amazon_price_tracker.db`) is created in the backend root directory on first run. To reset everything, simply delete it and restart the server.

To inspect the database:

```bash
# Install sqlite3 CLI if you don't have it
# Then navigate to backend/ and run:
sqlite3 amazon_price_tracker.db

# View tables:
.tables

# Query:
SELECT * FROM products;
```
