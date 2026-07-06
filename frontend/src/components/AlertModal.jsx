import { useState } from 'react';
import { createAlert, deleteAlert, toggleAlert } from '../api';

function AlertRow({ alert, onDelete, onToggle }) {
  const [busy, setBusy] = useState(false);

  async function handleToggle() {
    setBusy(true);
    try { onToggle(await toggleAlert(alert.id)); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true);
    try { await deleteAlert(alert.id); onDelete(alert.id); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
      <div>
        <span className="font-medium text-gray-800">{alert.email}</span>
        <span className="text-gray-500"> — below </span>
        <span className="font-semibold text-orange-600">${parseFloat(alert.target_price).toFixed(2)}</span>
        {alert.triggered_at && (
          <span className="ml-2 badge-gray text-xs">
            Triggered {new Date(alert.triggered_at).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={busy}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${alert.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
          title={alert.is_active ? 'Active — click to disable' : 'Disabled — click to enable'}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${alert.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
        <button onClick={handleDelete} disabled={busy} className="text-gray-300 hover:text-red-500 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function AlertModal({ product, alerts: initialAlerts, onClose, onAlertsChange }) {
  const [alerts, setAlerts] = useState(initialAlerts || []);
  const [email, setEmail] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const currentPrice = product.current_price != null ? parseFloat(product.current_price) : null;

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    if (!email || !targetPrice) return;

    setLoading(true);
    try {
      const alert = await createAlert({
        product_id: product.id,
        email,
        target_price: parseFloat(targetPrice),
      });
      const updated = [alert, ...alerts];
      setAlerts(updated);
      onAlertsChange(updated);
      setEmail('');
      setTargetPrice('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create alert.');
    } finally {
      setLoading(false);
    }
  }

  function handleDelete(id) {
    const updated = alerts.filter((a) => a.id !== id);
    setAlerts(updated);
    onAlertsChange(updated);
  }

  function handleToggle(updated) {
    const list = alerts.map((a) => (a.id === updated.id ? updated : a));
    setAlerts(list);
    onAlertsChange(list);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="card w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Price Alerts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Product context */}
          <p className="text-sm text-gray-500 line-clamp-1">{product.name}</p>
          {currentPrice != null && (
            <p className="text-sm text-gray-600">
              Current price: <span className="font-semibold text-gray-900">${currentPrice.toFixed(2)}</span>
            </p>
          )}

          {/* Add form */}
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Alert me when price drops to or below
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  className="input pl-7"
                  placeholder={currentPrice ? (currentPrice * 0.9).toFixed(2) : '0.00'}
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Adding…' : 'Add Alert'}
            </button>
          </form>

          {/* Existing alerts */}
          {alerts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Existing Alerts</p>
              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
