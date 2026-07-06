import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="text-gray-500 text-xs mb-1">{formatDate(label)}</p>
      <p className="font-bold text-gray-900">{currency}{parseFloat(payload[0].value).toFixed(2)}</p>
    </div>
  );
}

export default function PriceChart({ history, alerts = [], currency = '$' }) {
  if (!history || history.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No price history yet.
      </div>
    );
  }

  const data = history.map((h) => ({
    date: h.scraped_at,
    price: parseFloat(h.price),
  }));

  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.15 || 5;
  const yMin = Math.max(0, minPrice - padding);
  const yMax = maxPrice + padding;

  const activeAlertPrices = alerts
    .filter((a) => a.is_active)
    .map((a) => parseFloat(a.target_price));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={(v) => `${currency}${v.toFixed(0)}`}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} />
        {activeAlertPrices.map((alertPrice, i) => (
          <ReferenceLine
            key={i}
            y={alertPrice}
            stroke="#22c55e"
            strokeDasharray="4 4"
            label={{ value: `Alert ${currency}${alertPrice.toFixed(2)}`, fontSize: 10, fill: '#16a34a', position: 'insideTopRight' }}
          />
        ))}
        <Area
          type="monotone"
          dataKey="price"
          stroke="#f97316"
          strokeWidth={2}
          fill="url(#priceGradient)"
          dot={data.length <= 20 ? { fill: '#f97316', r: 3 } : false}
          activeDot={{ r: 5, fill: '#ea580c' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
