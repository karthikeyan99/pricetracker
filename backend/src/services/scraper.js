const axios = require('axios');
const cheerio = require('cheerio');
const { scrapeFlipkartProduct } = require('./flipkartScraper');

// Which marketplace does this URL belong to?
function detectSite(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('flipkart')) return 'flipkart';
    if (host.includes('amazon') || host.includes('amzn')) return 'amazon';
  } catch { /* invalid URL */ }
  return null;
}

// Rotate user-agents to reduce bot detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Extract ASIN from Amazon URL
function extractAsin(url) {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/ASIN\/([A-Z0-9]{10})/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Normalise Amazon URL to clean dp link
function normaliseUrl(url) {
  const asin = extractAsin(url);
  if (!asin) return url;
  const urlObj = new URL(url);
  return `${urlObj.protocol}//${urlObj.hostname}/dp/${asin}`;
}

// Parse a price string like "$1,299.99" → 1299.99
function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

async function scrapeProduct(url) {
  const site = detectSite(url);
  if (site === 'flipkart') {
    return scrapeFlipkartProduct(url);
  }
  return scrapeAmazonProduct(url);
}

async function scrapeAmazonProduct(url) {
  const normalised = normaliseUrl(url);

  const { data: html } = await axios.get(normalised, {
    headers: {
      'User-Agent': randomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(html);

  // --- Product name ---
  const name =
    $('#productTitle').text().trim() ||
    $('h1.product-title-word-break').text().trim() ||
    $('span#title').text().trim() ||
    null;

  // --- Price (try multiple selectors Amazon uses) ---
  const priceSelectors = [
    '.a-price[data-a-size="xl"] .a-offscreen',
    '.a-price[data-a-size="l"] .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    '#price_inside_buybox',
    '.a-price .a-offscreen',
    '#corePrice_feature_div .a-offscreen',
    '#apex_offerDisplay_desktop .a-price .a-offscreen',
    '.a-color-price',
  ];

  let rawPrice = null;
  for (const sel of priceSelectors) {
    const text = $(sel).first().text().trim();
    if (text && /\d/.test(text)) {
      rawPrice = text;
      break;
    }
  }

  const price = parsePrice(rawPrice);

  // --- Image ---
  const imageUrl =
    $('#landingImage').attr('src') ||
    $('#imgBlkFront').attr('src') ||
    $('img#main-image').attr('src') ||
    $('[data-old-hires]').first().attr('data-old-hires') ||
    null;

  const asin = extractAsin(normalised);

  // --- Stock status ---
  const availabilityText = $('#availability').text().trim().toLowerCase();
  let inStock = null;
  if (availabilityText) {
    inStock = /unavailable|out of stock/.test(availabilityText) ? 0 : 1;
  } else if (price != null) {
    inStock = 1;
  }

  // --- Seller (buy-box owner) ---
  const seller =
    $('#sellerProfileTriggerId').text().trim() ||
    $('#merchant-info a').first().text().trim() ||
    null;

  if (!name && price === null) {
    throw new Error('Could not parse product details — Amazon may have blocked the request or the URL is invalid.');
  }

  return { url: normalised, asin, name, price, imageUrl, inStock, seller, site: 'amazon' };
}

module.exports = { scrapeProduct, normaliseUrl, extractAsin, detectSite };
