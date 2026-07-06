import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteProduct, refreshProduct, updateProduct } from '../api';
import { currencyFor, siteLabel } from '../utils/format';
import { SellerChips, undercutBy, primaryCompetitorOut } from './SellerList';

function PriceDelta({ current, initial }) {
  if (initial == null || current == null || isNaN(initial)) return null;
  const diff = current - initial;
  const pct = ((diff / initial) * 100).toFixed(1);
  if (diff < 0) {
    return (
      <span className="badge-green">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
        {pct}%
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className="badge-red">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        +{pct}%
      </span>
    );
  }
  return null;
}

// Cost + margin line: margin is my selling price minus my cost
function MarginLine({ cost, myPrice, cur, onEditCost }) {
  if (cost == null) {
    return (
      <button
        onClick={onEditCost}
        className="text-xs text-orange-600 hover:text-orange-700 underline decoration-dotted"
      >
        + Set cost price
      </button>
    );
  }
  const margin = myPrice != null ? myPrice - cost : null;
  const pct = margin != null && myPrice > 0 ? ((margin / myPrice) * 100).toFixed(0) : null;
  return (
    <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
      Cost <span className="font-semibold text-gray-700">{cur}{parseFloat(cost).toFixed(0)}</span>
      {margin != null && (
        <>
          · Margin{' '}
          <span className={`font-semibold ${margin > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {margin < 0 ? '−' : ''}{cur}{Math.abs(margin).toFixed(0)}{pct != null && ` (${pct}%)`}
          </span>
        </>
      )}
      <button onClick={onEditCost} className="text-gray-300 hover:text-orange-500 p-0.5" title="Edit cost price">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </p>
  );
}

export default function ProductCard({ product, onDelete, onRefresh, primaryCompetitor, refilledBy = [] }) {
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleRefresh(e) {
    e.preventDefault();
    setRefreshing(true);
    try {
      const updated = await refreshProduct(product.id);
      onRefresh(updated);
    } catch {
      // silently fail — user can retry
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete(e) {
    e.preventDefault();
    if (!confirm(`Stop tracking "${product.name || 'this product'}"?`)) return;
    setDeleting(true);
    try {
      await deleteProduct(product.id);
      onDelete(product.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleEditCost(e) {
    e.preventDefault();
    const current = product.cost_price != null ? parseFloat(product.cost_price) : '';
    const input = prompt('Cost price (your purchase rate) in ₹:', current);
    if (input === null) return;
    const value = input.trim() === '' ? null : parseFloat(input);
    if (value !== null && (isNaN(value) || value < 0)) {
      alert('Please enter a valid number.');
      return;
    }
    try {
      const updated = await updateProduct(product.id, { cost_price: value });
      onRefresh(updated);
    } catch {
      alert('Failed to save cost price.');
    }
  }

  const sellers = product.sellers || [];
  const myOffer = sellers.find((s) => s.is_mine === 1);
  const price = myOffer && myOffer.price != null
    ? parseFloat(myOffer.price)
    : product.current_price != null ? parseFloat(product.current_price) : null;
  const cost = product.cost_price != null ? parseFloat(product.cost_price) : null;
  const cur = currencyFor(product);
  const undercutter = undercutBy(sellers);
  const listingOut = product.in_stock === 0;
  const rivalOut = sellers.some((s) => !s.is_mine && s.in_stock === 0);
  const primaryGone = primaryCompetitorOut(sellers, primaryCompetitor);

  return (
    <Link
      to={`/product/${product.id}`}
      className={`card card-hover card-animate flex flex-col cursor-pointer group overflow-hidden ${listingOut ? 'opacity-90 border-red-200' : ''}`}
    >
      {/* Image */}
      <div className="relative h-36 bg-gray-50 border-b border-gray-100 flex items-center justify-center">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="thumb-img object-contain h-full w-full p-2" />
        ) : (
          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
        {/* Status ribbons */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {listingOut && <span className="badge-red">Listing out of stock</span>}
          {undercutter && (
            <span className="badge-red" title={`${undercutter.seller_name} is selling below your price`}>
              Undercut: {undercutter.seller_name} {cur}{parseFloat(undercutter.price).toFixed(0)}
            </span>
          )}
          {primaryGone && (
            <span className="badge-green" title={`${primaryCompetitor} has no live offer here — you can raise your price`}>
              ↑ {primaryCompetitor} not selling
            </span>
          )}
          {refilledBy.length > 0 && (
            <span className="badge-red" title={`${refilledBy.join(', ')} was out of stock and is selling again — recheck your price`}>
              🔄 {refilledBy.join(', ')} restocked
            </span>
          )}
          {!listingOut && !primaryGone && refilledBy.length === 0 && rivalOut && (
            <span className="badge-green">A rival is out of stock</span>
          )}
        </div>
        {/* Actions */}
        <div className="absolute top-2 right-2 flex gap-1" onClick={(e) => e.preventDefault()}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-white/90 shadow-sm border border-gray-100 text-gray-400 hover:text-orange-500 transition-colors p-1.5 rounded-lg"
            title="Refresh now"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-white/90 shadow-sm border border-gray-100 text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg"
            title="Stop tracking"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-1.5 p-3">
        <p className="text-sm font-medium text-gray-800 line-clamp-2 group-hover:text-orange-600 transition-colors">
          {product.name || 'Loading product name…'}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          {price != null ? (
            <span className="text-lg font-bold text-gray-900">{cur}{price.toFixed(0)}</span>
          ) : (
            <span className="text-sm text-gray-400 italic">Price unavailable</span>
          )}
          <PriceDelta current={price} initial={parseFloat(product.initial_price)} />
        </div>

        <MarginLine cost={cost} myPrice={price} cur={cur} onEditCost={handleEditCost} />

        <SellerChips sellers={sellers} primaryCompetitor={primaryCompetitor} currency={cur} />
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-50 text-[11px] text-gray-400 flex items-center justify-between">
        <span>{siteLabel(product)}{product.asin && ` · ${product.asin}`}</span>
        {product.updated_at && (
          <span title="Last checked">{new Date(product.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        )}
      </div>
    </Link>
  );
}
