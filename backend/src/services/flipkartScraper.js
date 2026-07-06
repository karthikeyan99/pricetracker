const axios = require('axios');
const cheerio = require('cheerio');

// Flipkart's bot detection rejects sparse header sets — send a full
// Chrome-consistent set (UA + sec-ch-ua + Sec-Fetch) or it returns 403.
const BROWSER_PROFILES = [
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    secChUa: '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    platform: '"Windows"',
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    secChUa: '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    platform: '"macOS"',
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    platform: '"Windows"',
  },
];

function browserHeaders() {
  const profile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
  return {
    'User-Agent': profile.ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'sec-ch-ua': profile.secChUa,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': profile.platform,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

// Extract Flipkart product id — the pid query param, or the /p/itmXXXX path segment
function extractProductId(url) {
  try {
    const urlObj = new URL(url);
    const pid = urlObj.searchParams.get('pid');
    if (pid) return pid;
    const match = urlObj.pathname.match(/\/p\/(itm[a-z0-9]+)/i);
    if (match) return match[1];
  } catch { /* fall through */ }
  return null;
}

// Keep the slug + /p/itm path and the pid param, drop tracking params
function normaliseUrl(url) {
  try {
    const urlObj = new URL(url);
    const pid = urlObj.searchParams.get('pid');
    let clean = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    if (pid) clean += `?pid=${pid}`;
    return clean;
  } catch {
    return url;
  }
}

function parsePrice(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

// Pull the Product object out of the page's JSON-LD blocks (most stable source)
function parseJsonLd($) {
  let product = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (product) return;
    try {
      const parsed = JSON.parse($(el).contents().text());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of candidates) {
        if (item && item['@type'] === 'Product') {
          product = item;
          return;
        }
      }
    } catch { /* malformed block — ignore */ }
  });
  return product;
}

async function scrapeFlipkartProduct(url) {
  const normalised = normaliseUrl(url);

  const { data: html, status } = await axios.get(normalised, {
    headers: browserHeaders(),
    timeout: 20000,
    validateStatus: (s) => s < 500,
  });

  if (status === 403 || status === 429) {
    throw new Error(`Flipkart blocked the request (HTTP ${status}). Try again in a few minutes.`);
  }

  const $ = cheerio.load(html);
  const ld = parseJsonLd($);

  // --- Name ---
  let name =
    (ld && ld.name) ||
    $('h1 span').first().text().trim() ||
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    null;
  if (name) name = name.replace(/\s+/g, ' ').trim();

  // --- Price ---
  let rawPrice = null;
  let availability = null;
  let seller = null;

  if (ld && ld.offers) {
    const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
    if (offers) {
      rawPrice = offers.price ?? offers.lowPrice ?? null;
      availability = offers.availability || null;
      if (offers.seller && offers.seller.name) seller = offers.seller.name;
    }
  }

  if (rawPrice == null) {
    // Flipkart CSS classes rotate; try current known price classes then the state JSON
    const cssPrice =
      $('div.Nx9bqj.CxhGGd').first().text().trim() ||
      $('div._30jeq3._16Jk6d').first().text().trim();
    if (cssPrice && /\d/.test(cssPrice)) rawPrice = cssPrice;
  }

  if (rawPrice == null) {
    const stateMatch =
      html.match(/"finalPrice"\s*:\s*\{[^{}]*?"decimalValue"\s*:\s*"?([\d.]+)/) ||
      html.match(/"finalPrice"\s*:\s*\{[^{}]*?"value"\s*:\s*([\d.]+)/);
    if (stateMatch) rawPrice = stateMatch[1];
  }

  const price = parsePrice(rawPrice);

  // --- Stock status ---
  // Most reliable: the listing state embedded in the page's initial data
  let inStock = null;
  const statusMatch = html.match(/"availabilityStatus"\s*:\s*"([A-Z_]+)"/);
  if (statusMatch) {
    inStock = statusMatch[1] === 'IN_STOCK' ? 1 : 0;
  } else if (availability) {
    inStock = /InStock/i.test(availability) ? 1 : 0;
  } else {
    const bodyText = $('body').text();
    if (/sold out|currently unavailable|coming soon|notify me/i.test(bodyText)) {
      inStock = 0;
    } else if (price != null) {
      // Price present and no unavailable marker — treat as in stock
      inStock = 1;
    }
  }

  // --- Seller (buy-box owner, e.g. "Finypetz") ---
  if (!seller) {
    seller = $('#sellerName span span').first().text().trim() || null;
  }
  if (!seller) {
    const sellerMatch = html.match(/"sellerName"\s*:\s*"([^"]+)"/);
    if (sellerMatch) seller = sellerMatch[1];
  }

  // --- Image ---
  const imageUrl =
    (ld && (Array.isArray(ld.image) ? ld.image[0] : ld.image)) ||
    $('meta[property="og:image"]').attr('content') ||
    null;

  // Product id (pid) — prefer the URL param, else pull it from the page data
  let productId = extractProductId(normalised);
  if (!productId || /^itm/i.test(productId)) {
    const pidMatch = html.match(/"productId"\s*:\s*"([A-Z0-9]{10,})"/);
    if (pidMatch) productId = pidMatch[1];
  }

  if (!name && price === null) {
    throw new Error('Could not parse product details — Flipkart may have blocked the request or the URL is invalid.');
  }

  return { url: normalised, asin: productId, name, price, imageUrl, inStock, seller, site: 'flipkart' };
}

// Fetch every seller offering this product (the "See other sellers" list).
// Uses Flipkart's page API — the seller list is not in the server-rendered HTML.
// Returns [{ sellerId, sellerName, price, listingId, isBuybox, rating, newSeller }].
async function fetchFlipkartSellers(pid) {
  const { data, status } = await axios.post(
    'https://1.rome.api.flipkart.com/api/3/page/dynamic/product-sellers',
    { requestContext: { productId: pid }, pageContext: {} },
    {
      headers: {
        ...browserHeaders(),
        'X-User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 FKUA/website/42/website/Desktop',
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Origin': 'https://www.flipkart.com',
        'Referer': 'https://www.flipkart.com/',
      },
      timeout: 20000,
      validateStatus: (s) => s < 500,
    }
  );

  if (status !== 200) {
    throw new Error(`Flipkart seller API returned HTTP ${status}.`);
  }

  // Listing entries live under RESPONSE.data.<slot>.data[].value (ListingDetailValue)
  const sellers = [];
  const slots = (data && data.RESPONSE && data.RESPONSE.data) || {};
  for (const slotName of Object.keys(slots)) {
    const slotData = slots[slotName] && slots[slotName].data;
    if (!Array.isArray(slotData)) continue;
    for (const item of slotData) {
      const v = item && item.value;
      if (!v || v.type !== 'ListingDetailValue' || !v.sellerInfo || !v.sellerInfo.value) continue;
      const info = v.sellerInfo.value;
      const finalPrice = v.pricing && v.pricing.value && v.pricing.value.finalPrice;
      sellers.push({
        sellerId: info.id || null,
        sellerName: info.name || null,
        price: finalPrice && finalPrice.value != null ? finalPrice.value : null,
        listingId: v.listingId || null,
        isBuybox: v.selected === true ? 1 : 0,
        rating: info.rating && info.rating.average != null ? info.rating.average : null,
        newSeller: info.newSeller === true,
      });
    }
  }

  return sellers.filter((s) => s.sellerName);
}

module.exports = { scrapeFlipkartProduct, fetchFlipkartSellers, normaliseUrl, extractProductId };
