import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProduct, refreshProduct, updateProduct, getConfig } from '../api';
import PriceChart from '../components/PriceChart';
import AlertModal from '../components/AlertModal';
import SellerTable from '../components/SellerList';
import { currencyFor, siteLabel } from '../utils/format';

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value ?? '—'}</span>
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [config, setConfig] = useState({});

  useEffect(() => {
    getProduct(id)
      .then(setProduct)
      .catch(() => setError('Product not found.'))
      .finally(() => setLoading(false));
    getConfig().then(setConfig).catch(() => {});
  }, [id]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const updated = await refreshProduct(id);
      // Re-fetch full detail to get updated history
      const full = await getProduct(id);
      setProduct(full);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to refresh price.');
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">{error || 'Product not found.'}</p>
        <Link to="/" className="btn-secondary inline-block">← Back to Dashboard</Link>
      </div>
    );
  }

  const currentPrice = product.current_price != null ? parseFloat(product.current_price) : null;
  const cur = currencyFor(product);
  const myOffer = (product.sellers || []).find((s) => s.is_mine === 1);
  const myPrice = myOffer && myOffer.price != null ? parseFloat(myOffer.price) : currentPrice;
  const costPrice = product.cost_price != null ? parseFloat(product.cost_price) : null;
  const margin = costPrice != null && myPrice != null ? myPrice - costPrice : null;

  async function handleEditCost() {
    const input = prompt('Cost price (your purchase rate) in ₹:', costPrice ?? '');
    if (input === null) return;
    const value = input.trim() === '' ? null : parseFloat(input);
    if (value !== null && (isNaN(value) || value < 0)) {
      alert('Please enter a valid number.');
      return;
    }
    try {
      const updated = await updateProduct(product.id, { cost_price: value });
      setProduct((p) => ({ ...p, cost_price: updated.cost_price }));
    } catch {
      alert('Failed to save cost price.');
    }
  }
  const history = product.history || [];
  const alerts = product.alerts || [];
  const activeAlerts = alerts.filter((a) => a.is_active).length;

  const lowestPrice = history.length > 0 ? Math.min(...history.map((h) => parseFloat(h.price))) : null;
  const highestPrice = history.length > 0 ? Math.max(...history.map((h) => parseFloat(h.price))) : null;
  const priceChange =
    history.length >= 2
      ? parseFloat(history[history.length - 1].price) - parseFloat(history[0].price)
      : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Breadcrumb */}
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-600 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Dashboard
      </Link>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: product info */}
        <div className="md:col-span-1 space-y-4">
          {/* Image */}
          <div className="card p-4 flex items-center justify-center h-48">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="max-h-40 object-contain" />
            ) : (
              <svg className="w-16 h-16 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>

          {/* Stats */}
          <div className="card p-4">
            <InfoRow
              label="Stock Status"
              value={
                product.in_stock === 0 ? (
                  <span className="text-red-600 font-semibold">Out of stock</span>
                ) : product.in_stock === 1 ? (
                  <span className="text-green-600 font-semibold">In stock</span>
                ) : 'Unknown'
              }
            />
            <InfoRow label="Seller" value={product.seller} />
            <InfoRow label="Current Price" value={currentPrice != null ? `${cur}${currentPrice.toFixed(2)}` : 'N/A'} />
            <InfoRow
              label="My Cost Price"
              value={
                <button onClick={handleEditCost} className="hover:text-orange-600" title="Click to edit">
                  {costPrice != null ? `${cur}${costPrice.toFixed(2)} ✎` : 'Set cost ✎'}
                </button>
              }
            />
            <InfoRow
              label="My Margin"
              value={
                margin != null ? (
                  <span className={margin > 0 ? 'text-green-600' : 'text-red-600'}>
                    {margin < 0 ? '−' : ''}{cur}{Math.abs(margin).toFixed(2)}
                    {myPrice > 0 && ` (${((margin / myPrice) * 100).toFixed(0)}%)`}
                  </span>
                ) : '—'
              }
            />
            <InfoRow label="Lowest Price" value={lowestPrice != null ? `${cur}${lowestPrice.toFixed(2)}` : '—'} />
            <InfoRow label="Highest Price" value={highestPrice != null ? `${cur}${highestPrice.toFixed(2)}` : '—'} />
            <InfoRow
              label="Price Change"
              value={
                priceChange != null
                  ? `${priceChange >= 0 ? '+' : '−'}${cur}${Math.abs(priceChange).toFixed(2)}`
                  : '—'
              }
            />
            <InfoRow label="Data Points" value={history.length} />
            <InfoRow label="Product ID" value={product.asin} />
            <InfoRow
              label="Last Updated"
              value={product.updated_at ? new Date(product.updated_at).toLocaleString() : '—'}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary w-full flex items-center justify-center gap-2">
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Checking…' : 'Refresh Price'}
            </button>
            <button onClick={() => setShowAlerts(true)} className="btn-primary w-full flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Manage Alerts
              {activeAlerts > 0 && (
                <span className="bg-white/25 text-white text-xs rounded-full px-1.5 py-0.5">
                  {activeAlerts}
                </span>
              )}
            </button>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full text-center text-sm flex items-center justify-center gap-1"
            >
              View on {siteLabel(product)}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Right: chart + history */}
        <div className="md:col-span-2 space-y-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900 line-clamp-3">{product.name || 'Loading…'}</h1>
          </div>

          {/* Sellers on this listing */}
          <SellerTable sellers={product.sellers} primaryCompetitor={config.primaryCompetitor} currency={cur} />

          {/* Chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Price History</h2>
              <span className="text-xs text-gray-400">{history.length} point{history.length !== 1 ? 's' : ''}</span>
            </div>
            <PriceChart history={history} alerts={alerts} currency={cur} />
          </div>

          {/* Recent history table */}
          {history.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">Recent Prices</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                      <th className="text-left px-5 py-2">Date</th>
                      <th className="text-right px-5 py-2">Price</th>
                      <th className="text-right px-5 py-2">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().slice(0, 20).map((h, i, arr) => {
                      const price = parseFloat(h.price);
                      const prev = arr[i + 1] ? parseFloat(arr[i + 1].price) : null;
                      const delta = prev != null ? price - prev : null;
                      return (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-2 text-gray-500">
                            {new Date(h.scraped_at).toLocaleString()}
                          </td>
                          <td className="px-5 py-2 text-right font-semibold">{cur}{price.toFixed(2)}</td>
                          <td className="px-5 py-2 text-right">
                            {delta != null ? (
                              <span className={delta < 0 ? 'text-green-600' : delta > 0 ? 'text-red-600' : 'text-gray-400'}>
                                {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAlerts && (
        <AlertModal
          product={product}
          alerts={alerts}
          onClose={() => setShowAlerts(false)}
          onAlertsChange={(updated) => setProduct((p) => ({ ...p, alerts: updated }))}
        />
      )}
    </div>
  );
}
