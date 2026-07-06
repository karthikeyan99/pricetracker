import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Products
export const getProducts = () => api.get('/products').then((r) => r.data);
export const getProduct = (id) => api.get(`/products/${id}`).then((r) => r.data);
export const addProduct = (url) => api.post('/products', { url }).then((r) => r.data);
export const deleteProduct = (id) => api.delete(`/products/${id}`).then((r) => r.data);
export const updateProduct = (id, data) => api.patch(`/products/${id}`, data).then((r) => r.data);
export const refreshProduct = (id) => api.post(`/products/${id}/refresh`).then((r) => r.data);

// Refresh-all sweep (background job on the server)
export const refreshAll = () => api.post('/refresh-all').then((r) => r.data);
export const getRefreshStatus = () => api.get('/refresh-status').then((r) => r.data);

// Store config (my store name, primary competitor)
export const getConfig = () => api.get('/config').then((r) => r.data);

// Change events (competitor price/stock changes)
export const getEvents = (limit = 50) => api.get('/events', { params: { limit } }).then((r) => r.data);

// Alerts
export const createAlert = (data) => api.post('/alerts', data).then((r) => r.data);
export const deleteAlert = (id) => api.delete(`/alerts/${id}`).then((r) => r.data);
export const toggleAlert = (id) => api.patch(`/alerts/${id}/toggle`).then((r) => r.data);
