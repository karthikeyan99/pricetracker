import { useState, useEffect, useCallback, useRef } from 'react';
import { getProducts, getEvents, getConfig, refreshAll, getRefreshStatus } from '../api';
import AddProductForm from '../components/AddProductForm';
import ProductCard from '../components/ProductCard';
import ChangeFeed from '../components/ChangeFeed';
import { undercutBy, primaryCompetitorOut } from '../components/SellerList';
import useCountUp from '../hooks/useCountUp';

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [sweep, setSweep] = useState(null); // { running, done, total } while a refresh-all runs
  const pollRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await getProducts();
      setProducts(data);
      getEvents(200).then(setEvents).catch(() => {});
      getConfig().then(setConfig).catch(() => {});
    } catch {
      setError('Failed to load products. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const pollSweep = useCallback(() => {
    clearTimeout(pollRef.current);
    const tick = async () => {
      try {
        const status = await getRefreshStatus();
        if (status.running) {
          setSweep(status);
          pollRef.current = setTimeout(tick, 2500);
        } else {
          setSweep(null);
          fetchProducts(); // sweep finished — reload prices, sellers, events
        }
      } catch {
        setSweep(null);
      }
    };
    tick();
  }, [fetchProducts]);

  // If a sweep (manual or scheduled) is already running when the page opens, show its progress
  useEffect(() => {
    getRefreshStatus().then((s) => { if (s.running) pollSweep(); }).catch(() => {});
    return () => clearTimeout(pollRef.current);
  }, [pollSweep]);

  async function handleRefreshAll() {
    try {
      await refreshAll();
    } catch {
      // 409 = already running — just start polling either way
    }
    pollSweep();
  }

  function handleProductAdded(product) {
    setProducts((prev) => [product, ...prev]);
  }

  function handleDelete(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  function handleRefresh(updated) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }

  const isOut = (p) => p.in_stock === 0 || (p.sellers || []).some((s) => !s.is_mine && s.in_stock === 0);
  const recentIds = new Set(
    events
      .filter((e) => Date.now() - new Date(e.created_at).getTime() < 24 * 60 * 60 * 1000)
      .map((e) => e.product_id)
  );

  // Rivals that came back in stock in the last 24 hours — map product id → seller names
  const REFILL_WINDOW = 24 * 60 * 60 * 1000;
  const refilledBy = new Map();
  for (const e of events) {
    if (e.event_type !== 'BACK_IN_STOCK') continue;
    if (Date.now() - new Date(e.created_at).getTime() > REFILL_WINDOW) continue;
    if (!refilledBy.has(e.product_id)) refilledBy.set(e.product_id, new Set());
    if (e.seller_name) refilledBy.get(e.product_id).add(e.seller_name);
  }
  const refilledIds = new Set(refilledBy.keys());

  const rival = config.primaryCompetitor || 'Main rival';
  const rivalGone = (p) => primaryCompetitorOut(p.sellers, config.primaryCompetitor);

  const totalTracked = products.length;
  const undercut = products.filter((p) => undercutBy(p.sellers)).length;
  const rivalsOut = products.filter(isOut).length;
  const rivalGoneCount = products.filter(rivalGone).length;
  const refilledCount = refilledIds.size;
  const recentEvents = events.filter(
    (e) => Date.now() - new Date(e.created_at).getTime() < 24 * 60 * 60 * 1000
  ).length;

  const buyboxMine = products.filter((p) => (p.sellers || []).some((s) => s.is_mine === 1 && s.is_buybox === 1)).length;
  const selling = products.filter((p) => (p.sellers || []).some((s) => s.is_mine === 1)).length;

  const FILTERS = {
    all: () => true,
    undercut: (p) => !!undercutBy(p.sellers),
    rivalgone: rivalGone,
    refilled: (p) => refilledIds.has(p.id),
    oos: isOut,
    changed: (p) => recentIds.has(p.id),
  };

  const myPriceOf = (p) => {
    const mine = (p.sellers || []).find((s) => s.is_mine === 1);
    return mine && mine.price != null ? parseFloat(mine.price) : (p.current_price != null ? parseFloat(p.current_price) : null);
  };
  const marginOf = (p) => {
    const price = myPriceOf(p);
    return p.cost_price != null && price != null ? price - parseFloat(p.cost_price) : null;
  };
  const SORTS = {
    recent: (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
    margin: (a, b) => (marginOf(a) ?? Infinity) - (marginOf(b) ?? Infinity),
    price: (a, b) => (myPriceOf(a) ?? Infinity) - (myPriceOf(b) ?? Infinity),
    name: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
  };

  const visible = products
    .filter(FILTERS[filter] || FILTERS.all)
    .filter((p) => !search.trim() || String(p.name || '').toLowerCase().includes(search.trim().toLowerCase()))
    .sort(SORTS[sort] || SORTS.recent);
  const filterLabel = {
    all: 'Watched Listings',
    undercut: 'Undercut by Rivals',
    rivalgone: `${rival} Not Selling — Raise Your Price`,
    refilled: 'Rivals Refilled Stock — Recheck Your Price',
    oos: 'Out-of-Stock Watch',
    changed: 'Changed in Last 24h',
  }[filter];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Hero header */}
      <div className="hero">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="pulse-dot" />
              <span className="text-xs uppercase tracking-widest text-orange-300 font-semibold">Live monitoring</span>
            </div>
            <h1 className="text-2xl font-bold mt-1">Competitor Watch</h1>
            {totalTracked > 0 && (
              <p className="text-sm text-slate-300 mt-2">
                🥇 You hold the buy box on <span className="font-bold text-white">{buyboxMine}</span> of{' '}
                <span className="font-bold text-white">{selling}</span> listings
                {undercut > 0 && <> · ⚠️ <span className="font-bold text-red-300">{undercut}</span> undercut</>}
                {rivalGoneCount > 0 && <> · 🚀 <span className="font-bold text-green-300">{rivalGoneCount}</span> raise-price chances</>}
                {refilledCount > 0 && <> · 🔄 <span className="font-bold text-orange-300">{refilledCount}</span> just restocked</>}
              </p>
            )}
            {config.publicUrl && (
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                <a href={config.publicUrl} target="_blank" rel="noopener noreferrer"
                  className="hover:text-orange-300 underline decoration-dotted">{config.publicUrl}</a>
                <button
                  onClick={() => navigator.clipboard?.writeText(config.publicUrl)}
                  className="text-slate-500 hover:text-orange-300"
                  title="Copy link"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </p>
            )}
          </div>
          <button
            onClick={handleRefreshAll}
            disabled={!!sweep}
            className="btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-70 shadow-lg"
            title="Re-check every listing right now"
          >
            <svg className={`w-4 h-4 ${sweep ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {sweep ? `Checking ${sweep.done}/${sweep.total}…` : 'Refresh All'}
          </button>
        </div>
        {sweep && sweep.total > 0 && (
          <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.round((sweep.done / sweep.total) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Stats — click to filter the product grid */}
      {totalTracked > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard icon="📦" label="Watched Listings" value={totalTracked}
            active={filter === 'all'} onClick={() => setFilter('all')} />
          <StatCard icon="⚠️" label="Undercut by Rivals" value={undercut} color={undercut > 0 ? 'red' : 'green'}
            active={filter === 'undercut'} onClick={() => setFilter(filter === 'undercut' ? 'all' : 'undercut')} />
          <StatCard icon="🚀" label={`${rival} Not Selling`} value={rivalGoneCount} color={rivalGoneCount > 0 ? 'green' : undefined}
            hint="They are out of stock or off the listing — you can raise your price"
            active={filter === 'rivalgone'} onClick={() => setFilter(filter === 'rivalgone' ? 'all' : 'rivalgone')} />
          <StatCard icon="🔄" label="Rivals Refilled (24h)" value={refilledCount} color={refilledCount > 0 ? 'red' : undefined}
            hint="A rival that was out of stock is selling again — recheck your price so you stay competitive"
            active={filter === 'refilled'} onClick={() => setFilter(filter === 'refilled' ? 'all' : 'refilled')} />
          <StatCard icon="🚫" label="Out of Stock" value={rivalsOut} color={rivalsOut > 0 ? 'green' : undefined}
            active={filter === 'oos'} onClick={() => setFilter(filter === 'oos' ? 'all' : 'oos')} />
          <StatCard icon="⚡" label="Changes (24h)" value={recentEvents}
            active={filter === 'changed'} onClick={() => setFilter(filter === 'changed' ? 'all' : 'changed')} />
        </div>
      )}

      <AddProductForm onProductAdded={handleProductAdded} />

      <ChangeFeed events={events} />

      {loading && (
        <div className="flex justify-center py-16">
          <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="card p-12 text-center">
          <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <p className="text-gray-500 font-medium">No listings watched yet.</p>
          <p className="text-gray-400 text-sm mt-1">Paste a Flipkart or Amazon product URL above to get started.</p>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              {filterLabel} ({visible.length})
            </h2>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="text-xs text-orange-600 hover:text-orange-700 underline">
                clear filter
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <div className="relative">
                <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="input pl-8 py-1.5 w-44 sm:w-56 text-sm"
                />
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="input py-1.5 w-auto text-sm" title="Sort products">
                <option value="recent">Recently checked</option>
                <option value="margin">Lowest margin first</option>
                <option value="price">Lowest price first</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="card p-8 text-center text-sm text-gray-400">
              Nothing here right now — that&apos;s good news for this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onDelete={handleDelete}
                  onRefresh={handleRefresh}
                  primaryCompetitor={config.primaryCompetitor}
                  refilledBy={[...(refilledBy.get(product.id) || [])]}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, active, onClick, hint }) {
  const colorClass = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-orange-600';
  const animated = useCountUp(value);
  return (
    <button
      onClick={onClick}
      className={`card card-hover p-4 text-left cursor-pointer ${
        active ? 'ring-2 ring-orange-400 shadow-md' : ''
      }`}
      title={hint || 'Click to filter the list below'}
    >
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1">
        <span>{icon}</span> {label}
      </p>
      <p className={`text-3xl font-extrabold mt-1 tabular-nums ${colorClass}`}>{animated}</p>
    </button>
  );
}
