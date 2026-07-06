// Currency symbol based on the marketplace the product lives on
export function currencyFor(product) {
  const url = product?.url || '';
  if (product?.site === 'flipkart' || url.includes('flipkart')) return '₹';
  try {
    if (new URL(url).hostname.endsWith('.in')) return '₹';
  } catch { /* invalid URL */ }
  return '$';
}

export function formatPrice(value, product) {
  if (value == null) return '—';
  return `${currencyFor(product)}${parseFloat(value).toFixed(2)}`;
}

export function siteLabel(product) {
  return product?.site === 'flipkart' ? 'Flipkart' : 'Amazon';
}
