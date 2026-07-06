import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ProductDetail from './pages/ProductDetail';
import Scorecard from './pages/Scorecard';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scorecard" element={<Scorecard />} />
          <Route path="/product/:id" element={<ProductDetail />} />
        </Routes>
      </main>
    </div>
  );
}
