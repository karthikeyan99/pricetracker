// Per-seller offer display for multi-seller Flipkart listings.
// `sellers` come sorted from the API: my store first, then by price.

function samePerson(a, b) {
  return String(a || '').toLowerCase().replace(/\s+/g, '') === String(b || '').toLowerCase().replace(/\s+/g, '');
}

// True when the primary competitor can't sell this product (out of stock or
// no offer at all) while my own offer is live — a chance to raise my price.
export function primaryCompetitorOut(sellers, primaryName) {
  if (!primaryName || !sellers || sellers.length === 0) return false;
  const mine = sellers.find((s) => s.is_mine === 1 && s.in_stock === 1);
  if (!mine) return false;
  const primary = sellers.find((s) => samePerson(s.seller_name, primaryName));
  return !primary || primary.in_stock === 0;
}

export function undercutBy(sellers) {
  const mine = sellers?.find((s) => s.is_mine === 1 && s.in_stock === 1);
  if (!mine || mine.price == null) return null;
  const rivals = sellers.filter((s) => !s.is_mine && s.in_stock === 1 && s.price != null && parseFloat(s.price) < parseFloat(mine.price));
  if (rivals.length === 0) return null;
  return rivals.reduce((low, s) => (parseFloat(s.price) < parseFloat(low.price) ? s : low));
}

// Compact one-line version for product cards
export function SellerChips({ sellers, primaryCompetitor, currency }) {
  if (!sellers || sellers.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs">
      {sellers.map((s) => {
        const isPrimary = primaryCompetitor && samePerson(s.seller_name, primaryCompetitor);
        const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border';
        const style = s.is_mine
          ? 'bg-green-50 border-green-300 text-green-800'
          : isPrimary
            ? 'bg-orange-50 border-orange-300 text-orange-800'
            : 'bg-gray-50 border-gray-200 text-gray-600';
        return (
          <span key={s.seller_name} className={`${base} ${style}`} title={s.is_mine ? 'Your store' : isPrimary ? 'Primary competitor' : 'Competitor'}>
            {s.is_buybox === 1 && <span title="Holds the buy box">🥇</span>}
            <span className="font-medium">{s.is_mine ? 'You' : s.seller_name}</span>
            {s.in_stock === 0 ? (
              <span className="text-red-500 font-semibold">out of stock</span>
            ) : (
              <span className="font-semibold">{s.price != null ? `${currency}${parseFloat(s.price).toFixed(0)}` : '—'}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// Full table for the product detail page
export default function SellerTable({ sellers, primaryCompetitor, currency }) {
  if (!sellers || sellers.length === 0) return null;
  const mine = sellers.find((s) => s.is_mine === 1);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 text-sm">Sellers on this Listing</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
            <th className="text-left px-5 py-2">Seller</th>
            <th className="text-right px-5 py-2">Price</th>
            <th className="text-right px-5 py-2">vs You</th>
            <th className="text-right px-5 py-2">Rating</th>
            <th className="text-right px-5 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {sellers.map((s) => {
            const isPrimary = primaryCompetitor && samePerson(s.seller_name, primaryCompetitor);
            const diff = !s.is_mine && mine && mine.price != null && s.price != null
              ? parseFloat(s.price) - parseFloat(mine.price)
              : null;
            return (
              <tr key={s.seller_name} className={`border-t border-gray-50 ${s.is_mine ? 'bg-green-50/50' : ''}`}>
                <td className="px-5 py-2.5">
                  <span className="flex items-center gap-1.5">
                    {s.is_buybox === 1 && <span title="Holds the buy box">🥇</span>}
                    <span className={`font-medium ${s.is_mine ? 'text-green-700' : isPrimary ? 'text-orange-700' : 'text-gray-800'}`}>
                      {s.seller_name}
                    </span>
                    {s.is_mine === 1 && <span className="badge-green">You</span>}
                    {isPrimary && <span className="badge-gray">Main rival</span>}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right font-semibold">
                  {s.price != null ? `${currency}${parseFloat(s.price).toFixed(2)}` : '—'}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {diff == null ? '—' : diff < 0 ? (
                    <span className="text-red-600 font-semibold">{currency}{Math.abs(diff).toFixed(0)} cheaper</span>
                  ) : diff > 0 ? (
                    <span className="text-green-600">{currency}{diff.toFixed(0)} costlier</span>
                  ) : (
                    <span className="text-gray-500">same price</span>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right text-gray-600">
                  {s.rating != null ? `${parseFloat(s.rating).toFixed(1)}★` : '—'}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {s.in_stock === 1 ? (
                    <span className="text-green-600">In stock</span>
                  ) : (
                    <span className="text-red-600 font-semibold">Out of stock</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
