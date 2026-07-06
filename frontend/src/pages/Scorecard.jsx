import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getProducts, getConfig } from '../api';
import { currencyFor } from '../utils/format';
import useCountUp from '../hooks/useCountUp';

// Compare my offer against rivals on one product.
function analyze(product, primaryCompetitor) {
  const sellers = product.sellers || [];
  const mine = sellers.find((s) => s.is_mine === 1);
  if (!mine || mine.price == null) return null; // I'm not selling here
  const myPrice = parseFloat(mine.price);
  const cost = product.cost_price != null ? parseFloat(product.cost_price) : null;
  const rivals = sellers.filter((s) => !s.is_mine && s.in_stock === 1 && s.price != null);
  const cheapestRival = rivals.length
    ? rivals.reduce((lo, s) => (parseFloat(s.price) < parseFloat(lo.price) ? s : lo))
    : null;
  const rivalPrice = cheapestRival ? parseFloat(cheapestRival.price) : null;
  // Primary competitor price
  const normalized = (name) => (name || '').toLowerCase().replace(/\s+/g, '');
  const primaryRival = primaryCompetitor
    ? sellers.find((s) => !s.is_mine && s.in_stock === 1 && normalized(s.seller_name) === normalized(primaryCompetitor))
    : null;
  const primaryPrice = primaryRival && primaryRival.price != null ? parseFloat(primaryRival.price) : null;
  // advantage: how much cheaper I am than the best rival (positive = I win)
  const advantage = rivalPrice != null ? rivalPrice - myPrice : null;
  const iAmCheapest = rivalPrice == null || myPrice <= rivalPrice;
  const hasBuybox = mine.is_buybox === 1;
  // 50% margin target: cost * 1.5
  const targetPrice = cost != null ? Math.round(cost * 1.5) : null;
  const currentMargin = cost != null && myPrice ? Math.round(((myPrice - cost) / cost) * 100) : null;
  const targetMargin = 50;
  const canReachTarget = targetPrice != null && primaryPrice != null ? targetPrice <= primaryPrice : targetPrice != null;
  return {
    product, mine, myPrice, cheapestRival, rivalPrice, advantage,
    iAmCheapest, hasBuybox,
    winning: iAmCheapest,
    noRival: rivalPrice == null,
    cost, targetPrice, currentMargin, targetMargin, canReachTarget, primaryPrice, primaryRival,
  };
}

export default function Scorecard() {
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('lose'); // 'lose' = needs attention, 'win' = ahead, 'margin' = optimization

  useEffect(() => {
    getProducts().then(setProducts).catch(() => {}).finally(() => setLoading(false));
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const rows = products.map(analyze).filter(Boolean);
  const selling = rows.length;
  const winning = rows.filter((r) => r.winning);
  const losing = rows.filter((r) => !r.winning);
  const winRate = selling > 0 ? Math.round((winning.length / selling) * 100) : 0;
  const buybox = rows.filter((r) => r.hasBuybox).length;
  const soleSeller = rows.filter((r) => r.noRival).length;
  const notSelling = products.length - selling;

  const animRate = useCountUp(winRate);

  // winners: biggest lead first · losers: biggest gap (most urgent) first
  const winnersSorted = [...winning].sort((a, b) => (b.advantage ?? Infinity) - (a.advantage ?? Infinity));
  const losersSorted = [...losing].sort((a, b) => (a.advantage ?? 0) - (b.advantage ?? 0));

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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Hero win-rate */}
      <div className="hero flex flex-col sm:flex-row items-center gap-6">
        <WinRing rate={animRate} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">How You're Doing vs Rivals</h1>
          <p className="text-slate-300 mt-2">
            You have the <span className="font-bold text-white">best price</span> on{' '}
            <span className="font-bold text-green-300">{winning.length}</span> of{' '}
            <span className="font-bold text-white">{selling}</span> listings you sell on.
          </p>
          <div className="flex gap-4 mt-3 text-sm flex-wrap">
            <span>🥇 <span className="font-bold">{buybox}</span> buy boxes held</span>
            <span>👑 <span className="font-bold">{soleSeller}</span> sole seller</span>
            <span>🎯 <span className="font-bold text-red-300">{losing.length}</span> need attention</span>
          </div>
        </div>
      </div>

      {selling === 0 && (
        <div className="card p-10 text-center text-gray-500">
          No seller data yet. Hit <span className="font-semibold">Refresh All</span> on the Dashboard first.
        </div>
      )}

      {/* Tabs */}
      {selling > 0 && (
        <>
          <div className="flex gap-2">
            <TabButton active={view === 'lose'} onClick={() => setView('lose')}
              label="🎯 Needs Attention" count={losersSorted.length} tone="lose" />
            <TabButton active={view === 'win'} onClick={() => setView('win')}
              label="🏆 You're Ahead" count={winnersSorted.length} tone="win" />
          </div>

          {view === 'lose' && (
            losersSorted.length > 0 ? (
              <Section
                title="🎯 Needs Attention — a rival is beating your price"
                subtitle="Biggest gaps first. Consider lowering your price to win these back."
                rows={losersSorted}
                config={config}
                tone="lose"
              />
            ) : (
              <div className="card p-10 text-center text-green-600 font-medium">
                🎉 Nobody is beating your price right now — you're ahead everywhere!
              </div>
            )
          )}

          {view === 'win' && (
            winnersSorted.length > 0 ? (
              <Section
                title="🏆 You're Ahead — you have the best price"
                subtitle="Sorted by your biggest lead. Where a rival is out, you may even have room to raise."
                rows={winnersSorted}
                config={config}
                tone="win"
              />
            ) : (
              <div className="card p-10 text-center text-gray-500">
                No listings where you have the best price yet.
              </div>
            )
          )}
        </>
      )}

      {notSelling > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {notSelling} watched listing{notSelling !== 1 ? 's are' : ' is'} not counted — you have no live offer there.
        </p>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label, count, tone }) {
  const activeColor = tone === 'lose' ? 'bg-red-500' : 'bg-green-600';
  const badgeColor = tone === 'lose' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
        active ? `${activeColor} text-white shadow` : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
      <span className={`text-xs rounded-full px-1.5 py-0.5 ${active ? 'bg-white/25 text-white' : badgeColor}`}>
        {count}
      </span>
    </button>
  );
}

function WinRing({ rate }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;
  const color = rate >= 66 ? '#22c55e' : rate >= 40 ? '#f97316' : '#ef4444';
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text x="60" y="58" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="bold">{rate}%</text>
      <text x="60" y="76" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11">win rate</text>
    </svg>
  );
}

function Section({ title, subtitle, rows, config, tone }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map((r) => (
          <Row key={r.product.id} r={r} config={config} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function Row({ r, config, tone }) {
  const { product } = r;
  const cur = currencyFor(product);
  const isPrimary = config.primaryCompetitor
    && r.cheapestRival
    && r.cheapestRival.seller_name.toLowerCase().replace(/\s+/g, '') === config.primaryCompetitor.toLowerCase().replace(/\s+/g, '');

  return (
    <Link to={`/product/${product.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
      <div className="w-12 h-12 flex-shrink-0 bg-gray-50 rounded border border-gray-100 flex items-center justify-center overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt="" className="object-contain w-full h-full p-0.5" />
          : <span className="text-gray-300 text-lg">📦</span>}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{product.name}</p>
        <p className="text-xs text-gray-400">
          You: <span className="font-semibold text-gray-600">{cur}{r.myPrice.toFixed(0)}</span>
          {r.hasBuybox && <span className="ml-1" title="You hold the buy box">🥇</span>}
          {r.cheapestRival ? (
            <> · Best rival: {r.cheapestRival.seller_name}{isPrimary && ' ★'}{' '}
              <span className="font-semibold text-gray-600">{cur}{r.rivalPrice.toFixed(0)}</span></>
          ) : (
            <> · <span className="text-green-600 font-medium">no rival in stock</span></>
          )}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        {tone === 'win' ? (
          r.advantage == null ? (
            <span className="badge-green">Only seller</span>
          ) : r.advantage > 0 ? (
            <span className="badge-green" title="You are cheaper by this much">▲ {cur}{r.advantage.toFixed(0)} cheaper</span>
          ) : (
            <span className="badge-gray">Matched</span>
          )
        ) : (
          <span className="badge-red" title="Rival is cheaper by this much">▼ {cur}{Math.abs(r.advantage).toFixed(0)} behind</span>
        )}
      </div>
    </Link>
  );
}
