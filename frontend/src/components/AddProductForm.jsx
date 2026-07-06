import { useState } from 'react';
import { addProduct } from '../api';

export default function AddProductForm({ onProductAdded }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) return;

    if (!trimmed.includes('amazon') && !trimmed.includes('flipkart')) {
      setError('Please enter a valid Flipkart or Amazon product URL.');
      return;
    }

    setLoading(true);
    try {
      const product = await addProduct(trimmed);
      setUrl('');
      onProductAdded(product);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add product. The site may have blocked the request — try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-3">Watch a Competitor Listing</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          className="input flex-1"
          placeholder="Paste Flipkart or Amazon product URL — e.g. https://www.flipkart.com/…/p/itm…?pid=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn-primary whitespace-nowrap" disabled={loading || !url.trim()}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Scraping...
            </span>
          ) : (
            'Track Product'
          )}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
