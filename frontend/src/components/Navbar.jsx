import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav className="bg-amazon-dark shadow-lg sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
          <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span className="text-white">Price<span className="text-orange-400">Tracker</span></span>
        </Link>

        <div className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-md transition-colors ${
              pathname === '/'
                ? 'bg-orange-500 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/scorecard"
            className={`px-3 py-1.5 rounded-md transition-colors ${
              pathname === '/scorecard'
                ? 'bg-orange-500 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Scorecard
          </Link>
        </div>
      </div>
    </nav>
  );
}
