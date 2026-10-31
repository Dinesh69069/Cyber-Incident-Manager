/**
 * api.js — Axios API client for the Cyber Incident Platform.
 *
 * In a real deployment:
 *  - Replace VITE_API_URL with the production FastAPI server URL.
 *  - The JWT is stored in localStorage and sent as Bearer token on every request.
 *  - 401 responses redirect to the login page.
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 45000,
});

// ── Request interceptor: attach JWT Bearer token ─────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cyber_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 globally ────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cyber_token');
      localStorage.removeItem('cyber_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// ── High-Performance In-Memory SWR Cache ──────────────────────────────────────
const cacheStore = new Map();
const inflightRequests = new Map();

export const apiCache = {
  get: (url) => {
    const entry = cacheStore.get(url);
    if (!entry) return null;
    return entry.data;
  },
  set: (url, data) => {
    cacheStore.set(url, { data, timestamp: Date.now() });
  },
  invalidate: (pattern) => {
    for (const key of cacheStore.keys()) {
      if (!pattern || key.includes(pattern)) {
        cacheStore.delete(key);
      }
    }
  },
  clear: () => {
    cacheStore.clear();
    inflightRequests.clear();
  },
};

/**
 * cachedGet: Returns cached response instantly (0ms) if available,
 * while revalidating in the background (Stale-While-Revalidate).
 */
async function cachedGet(url, config = {}, ttlMs = 45000) {
  const cacheKey = url + (config.params ? JSON.stringify(config.params) : '');
  const cached = cacheStore.get(cacheKey);

  const revalidate = async () => {
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey);
    }
    const promise = api.get(url, config)
      .then((res) => {
        cacheStore.set(cacheKey, { data: res.data, timestamp: Date.now() });
        inflightRequests.delete(cacheKey);
        return res;
      })
      .catch((err) => {
        inflightRequests.delete(cacheKey);
        throw err;
      });
    inflightRequests.set(cacheKey, promise);
    return promise;
  };

  if (cached) {
    // If cache is older than 6 seconds, revalidate in background silently
    if (Date.now() - cached.timestamp > 6000) {
      revalidate().catch(() => {});
    }
    return Promise.resolve({ data: cached.data, status: 200, fromCache: true });
  }

  return revalidate();
}

// ── Auth endpoints ────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data).then(r => { apiCache.clear(); return r; }),
  login:    (data) => api.post('/auth/login', data).then(r => { apiCache.clear(); return r; }),
  me:       ()     => cachedGet('/auth/me', {}, 60000),
};

// ── Asset endpoints ───────────────────────────────────────────────────────────
export const assetsApi = {
  list:   ()           => cachedGet('/assets'),
  get:    (id)         => cachedGet(`/assets/${id}`),
  create: (data)       => api.post('/assets', data).then(r => { apiCache.invalidate('/assets'); apiCache.invalidate('/dashboard'); return r; }),
  update: (id, data)   => api.put(`/assets/${id}`, data).then(r => { apiCache.invalidate('/assets'); apiCache.invalidate('/dashboard'); return r; }),
  delete: (id)         => api.delete(`/assets/${id}`).then(r => { apiCache.invalidate('/assets'); apiCache.invalidate('/dashboard'); return r; }),
  scan:   (id)         => api.post(`/assets/${id}/scan`).then(r => { apiCache.invalidate('/assets'); apiCache.invalidate('/vulnerabilities'); apiCache.invalidate('/incidents'); apiCache.invalidate('/dashboard'); return r; }),
  vulns:  (id)         => cachedGet(`/assets/${id}/vulnerabilities`),
};

// ── Incident endpoints ────────────────────────────────────────────────────────
export const incidentsApi = {
  list:         ()            => cachedGet('/incidents'),
  get:          (id)          => cachedGet(`/incidents/${id}`),
  create:       (data)        => api.post('/incidents', data).then(r => { apiCache.invalidate('/incidents'); apiCache.invalidate('/dashboard'); return r; }),
  updateStatus: (id, data)    => api.patch(`/incidents/${id}/status`, data).then(r => { apiCache.invalidate('/incidents'); apiCache.invalidate('/dashboard'); return r; }),
  addNote:      (id, data)    => api.post(`/incidents/${id}/note`, data).then(r => { apiCache.invalidate('/incidents'); return r; }),
  delete:       (id)          => api.delete(`/incidents/${id}`).then(r => { apiCache.invalidate('/incidents'); apiCache.invalidate('/dashboard'); return r; }),
};

// ── Vulnerability endpoints ───────────────────────────────────────────────────
export const vulnsApi = {
  list:   ()   => cachedGet('/vulnerabilities'),
  delete: (id) => api.delete(`/vulnerabilities/${id}`).then(r => { apiCache.invalidate('/vulnerabilities'); apiCache.invalidate('/dashboard'); return r; }),
};

// ── Payment endpoints ─────────────────────────────────────────────────────────
export const paymentsApi = {
  createSession:  (data)       => api.post('/payments/create-checkout-session', data),
  verifySession:  (sessionId)  => api.get(`/payments/verify-session/${sessionId}`).then(r => { apiCache.clear(); return r; }),
  createUpiSession: (data = {}) => api.post('/payments/upi-session', data),
  confirmUpi:     (data)       => api.post('/payments/upi-confirm', data).then(r => { apiCache.clear(); return r; }),
  webhook:        (data, sig)  => api.post('/payments/webhook', data, {
    headers: { 'stripe-signature': sig, 'Content-Type': 'application/json' },
  }).then(r => { apiCache.clear(); return r; }),
  upgrade:        ()           => api.post('/payments/upgrade').then(r => { apiCache.clear(); return r; }),
  downgrade:      ()           => api.post('/payments/downgrade').then(r => { apiCache.clear(); return r; }),
  invoices:       ()           => cachedGet('/payments/invoices'),
  webhookEvents:  ()           => cachedGet('/payments/webhook-events'),
};

// ── User management endpoints ─────────────────────────────────────────────────
export const usersApi = {
  list:   ()          => cachedGet('/users'),
  update: (id, data)  => api.patch(`/users/${id}`, data).then(r => { apiCache.invalidate('/users'); return r; }),
  delete: (id)        => api.delete(`/users/${id}`).then(r => { apiCache.invalidate('/users'); return r; }),
};

// ── Dashboard endpoints ───────────────────────────────────────────────────────
export const dashboardApi = {
  stats:     () => cachedGet('/dashboard/stats'),
  activity:  () => cachedGet('/dashboard/activity'),
  chartData: () => cachedGet('/dashboard/chart-data'),
};

export default api;
