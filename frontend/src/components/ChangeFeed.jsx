import { useState } from 'react';
import { Link } from 'react-router-dom';
import { currencyFor } from '../utils/format';

const EVENT_META = {
  PRICE_DROP: {
    label: 'Price dropped',
    badge: 'badge-red',
    advice: 'Competitor is cheaper — consider lowering your price.',
  },
  PRICE_INCREASE: {
    label: 'Price increased',
    badge: 'badge-green',
    advice: 'Room to raise your price and stay cheapest.',
  },
  OUT_OF_STOCK: {
    label: 'Out of stock',
    badge: 'badge-green',
    advice: 'Competitor unavailable — raise your price now.',
  },
  BACK_IN_STOCK: {
    label: 'Back in stock',
    badge: 'badge-gray',
    advice: 'Competitor selling again — re-check your price.',
  },
  BUYBOX_CHANGE: {
    label: 'Buy box changed',
    badge: 'badge-gray',
    advice: 'Default seller changed — check who is winning the sale now.',
  },
};

export default function ChangeFeed({ events }) {
  const [open, setOpen] = useState(() => localStorage.getItem('changefeed-open') !== 'no');

  if (!events || events.length === 0) return null;

  function toggle() {
    setOpen((prev) => {
      localStorage.setItem('changefeed-open', prev ? 'no' : 'yes');
      return !prev;
    });
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={toggle}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        title={open ? 'Click to close' : 'Click to open'}
      >
        <span className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800 text-sm">Recent Competitor Changes</h2>
          <span className="text-xs text-gray-400">{events.length} event{events.length !== 1 ? 's' : ''}</span>
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
      <ul className="divide-y divide-gray-50 border-t border-gray-100">
        {events.slice(0, 10).map((e) => {
          const meta = EVENT_META[e.event_type] || { label: e.event_type, badge: 'badge-gray', advice: '' };
          const cur = currencyFor(e);
          return (
            <li key={e.id}>
              <Link to={`/product/${e.product_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className={meta.badge}>{meta.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">
                    {e.seller_name && <span className="font-semibold text-gray-600">{e.seller_name} · </span>}
                    {e.product_name || e.url}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(e.event_type === 'PRICE_DROP' || e.event_type === 'PRICE_INCREASE') && e.old_price != null && (
                      <>
                        {cur}{parseFloat(e.old_price).toFixed(2)} → <span className="font-semibold text-gray-600">{cur}{parseFloat(e.new_price).toFixed(2)}</span> ·{' '}
                      </>
                    )}
                    {meta.advice}
                  </p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
