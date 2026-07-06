# Cloud Deployment Plan

This copy is prepared so the tracker can run online instead of depending on
your PC being switched on.

## What changes

- The backend can now store SQLite at a custom path using `DB_PATH`.
- A `render.yaml` blueprint is included for cloud deployment.
- The public tunnel is automatically disabled when the app detects common cloud
  hosts, so cloud hosting does not try to start Cloudflare Tunnel.
- Your old local setup is still compatible. If `DB_PATH` is empty, the app keeps
  using `backend/amazon_price_tracker.db`.

## Recommended first deployment

The included `render.yaml` uses Render's free web service mode so you can test
without adding payment details.

It is designed to:

- build frontend
- start backend
- serve the dashboard and API from one URL
- run the existing price-check scheduler in the cloud

## Free hosting limitation

Render free web services can sleep when idle and their local filesystem is not
persistent. That means the default local SQLite file is fine for testing, but it
is not the right permanent database for serious tracking.

For a reliable no-PC setup, use one of these:

- Paid Render service with persistent disk for the current SQLite app.
- Free/low-cost hosted Postgres or Supabase, then update the backend to store
  products and price history there.

## Required private settings

Add these in the hosting dashboard, not inside the code:

```env
APP_USER=choose_login_name
APP_PASS=choose_strong_password
ALERT_EMAIL=your_email@gmail.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM=Competitor Watch <your_email@gmail.com>
MY_STORE=YourStoreName
PRIMARY_COMPETITOR=MainCompetitorName
PUBLIC_TUNNEL=off
```

Telegram is recommended for fast alerts:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## Important reality

This removes the need to keep your PC on. It does not fully remove marketplace
blocking. Amazon and Flipkart can still block direct scraping from cloud servers.

If blocking happens often, the next upgrade should be a provider layer:

- direct scraper for testing
- proxy/API scraper for production
- one normalized product result returned to the tracker

That way the dashboard, alerts, database, and scheduler stay the same while the
scraping method can change behind the scenes.

## Safe migration path

1. Keep your current local tracker running.
2. Deploy this copied project to the cloud.
3. Add one or two test products first.
4. Confirm alerts work.
5. Add the full product list.
6. Only then decide whether to stop the local PC tracker.
