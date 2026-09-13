/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * REST API client module configured for tro. backend services.
 * Base URL defaults to http://localhost:8000/api/v1, automatically attaches
 * JWT Authorization header and provides robust network error handling.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location && window.location.origin
    ? (window.location.port === '5173'
        ? 'http://localhost:8000/api/v1'
        : `${window.location.origin}/api/v1`)
    : 'http://localhost:8000/api/v1');

/**
 * Retrieve the current JWT authentication token from localStorage.
 */
export function getToken() {
  return localStorage.getItem('tro_token') || localStorage.getItem('token');
}

/**
 * Persist the active JWT authentication token to localStorage.
 */
export function setToken(token) {
  if (token) {
    localStorage.setItem('tro_token', token);
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('tro_token');
    localStorage.removeItem('token');
  }
}

/**
 * Clear authentication credentials and user profile from localStorage.
 */
export function removeToken() {
  localStorage.removeItem('tro_token');
  localStorage.removeItem('token');
  localStorage.removeItem('tro_user');
}

/**
 * Primary HTTP request wrapper for tro. backend API.
 * Handles header injection, query serialization, response status parsing, and error formatting.
 */
export async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);

    // Parse response body if available
    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { raw: text } : null;
    }

    if (!response.ok) {
      if (
        response.status === 401 &&
        typeof window !== 'undefined' &&
        !endpoint.includes('/auth/login') &&
        !endpoint.includes('/auth/register')
      ) {
        window.dispatchEvent(new CustomEvent('tro:session_expired'));
      }

      let errorMessage =
        data?.detail ||
        (Array.isArray(data?.detail)
          ? data.detail.map((e) => e.msg || e).join(', ')
          : null) ||
        data?.message;

      if (response.status === 401) {
        if (
          errorMessage === 'Authentication credentials were not provided' ||
          errorMessage?.includes('invalid or expired token') ||
          errorMessage?.includes('sub missing')
        ) {
          errorMessage = 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.';
        }
      }

      if (!errorMessage) {
        errorMessage = `Yêu cầu thất bại với mã lỗi ${response.status} (${response.statusText})`;
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (
      err.name === 'TypeError' &&
      (msg.includes('fetch') ||
        msg.includes('load') ||
        msg.includes('network') ||
        msg.includes('failed to fetch'))
    ) {
      const hostHint = API_BASE_URL.replace('/api/v1', '');
      const networkError = new Error(
        `Không thể kết nối đến dịch vụ backend (${hostHint}). Vui lòng kiểm tra lại dịch vụ.`
      );
      networkError.status = 0;
      throw networkError;
    }
    throw err;
  }
}

// ----------------------------------------------------------------------------
// Authentication API
// ----------------------------------------------------------------------------
export const auth = {
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (userData) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  getMe: () =>
    request('/auth/me', {
      method: 'GET',
    }),

  changePassword: (data) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteAccount: (data) =>
    request('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify(data),
    }),

  removeTenant: (roomId) =>
    request(`/auth/rooms/${roomId}/remove-tenant`, {
      method: 'POST',
    }),
};

// ----------------------------------------------------------------------------
// Properties API (Quản lý Khu trọ)
// ----------------------------------------------------------------------------
export const properties = {
  list: () =>
    request('/properties', {
      method: 'GET',
    }),

  get: (id) =>
    request(`/properties/${id}`, {
      method: 'GET',
    }),

  create: (data) =>
    request('/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getRooms: (propertyId) =>
    request(`/properties/${propertyId}/rooms`, {
      method: 'GET',
    }),

  createRoom: (propertyId, data) =>
    request(`/properties/${propertyId}/rooms`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  assignTenant: (propertyId, roomId, data) =>
    request(`/properties/${propertyId}/rooms/${roomId}/assign-tenant`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeTenant: (propertyId, roomId) =>
    request(`/properties/${propertyId}/rooms/${roomId}/remove-tenant`, {
      method: 'POST',
    }),

  delete: (id, payload) =>
    request(`/properties/${id}`, {
      method: 'DELETE',
      body: JSON.stringify(typeof payload === 'string' ? { password: payload } : payload),
    }),
};

// ----------------------------------------------------------------------------
// Rooms & Readings API (Phòng trọ & Chỉ số công tơ)
// ----------------------------------------------------------------------------
export const rooms = {
  get: (id) =>
    request(`/rooms/${id}`, {
      method: 'GET',
    }),

  getMyRooms: () =>
    request('/tenant/rooms', {
      method: 'GET',
    }),

  join: (data) =>
    request('/rooms/join', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  assignTenant: (propertyId, roomId, data) =>
    request(
      propertyId
        ? `/properties/${propertyId}/rooms/${roomId}/assign-tenant`
        : `/rooms/${roomId}/assign-tenant`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  removeTenant: (roomId, propertyId) =>
    request(
      propertyId
        ? `/properties/${propertyId}/rooms/${roomId}/remove-tenant`
        : `/rooms/${roomId}/remove-tenant`,
      {
        method: 'POST',
      }
    ),

  getReadings: (roomId) =>
    request(`/rooms/${roomId}/readings`, {
      method: 'GET',
    }),

  createReading: (roomId, data) =>
    request(`/rooms/${roomId}/readings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getInvoices: (roomId) =>
    request(`/rooms/${roomId}/invoices`, {
      method: 'GET',
    }),

  calculateInvoice: (roomId, data) =>
    request(`/rooms/${roomId}/invoices/calculate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (roomId, payload) =>
    request(`/rooms/${roomId}`, {
      method: 'DELETE',
      body: JSON.stringify(typeof payload === 'string' ? { password: payload } : payload),
    }),

  requestOccupancyChange: (roomId, payload) =>
    request(`/rooms/${roomId}/occupancy-requests`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getOccupancyRequests: (roomId) =>
    request(`/rooms/${roomId}/occupancy-requests`, {
      method: 'GET',
    }),

  approveOccupancyRequest: (requestId) =>
    request(`/occupancy-requests/${requestId}/approve`, {
      method: 'POST',
    }),

  rejectOccupancyRequest: (requestId, reject_reason) =>
    request(`/occupancy-requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify(reject_reason ? { reject_reason } : {}),
    }),
};

// ----------------------------------------------------------------------------
// Tenant Automated API (Cổng Người Thuê)
// ----------------------------------------------------------------------------
export const tenant = {
  getRooms: () =>
    request('/tenant/rooms', {
      method: 'GET',
    }),

  joinRoom: (inviteCode) =>
    request('/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCode }),
    }),
};

// ----------------------------------------------------------------------------
// Invoices API (Hóa đơn & Tra cứu công khai Tính năng 17)
// ----------------------------------------------------------------------------
export const invoices = {
  get: (id) =>
    request(`/invoices/${id}`, {
      method: 'GET',
    }),

  publish: (id) =>
    request(`/invoices/${id}/publish`, {
      method: 'POST',
    }),

  getPublic: (shareToken) =>
    request(`/invoices/public/${encodeURIComponent(shareToken)}`, {
      method: 'GET',
    }),
};

// ----------------------------------------------------------------------------
// Notifications API
// ----------------------------------------------------------------------------
export const notifications = {
  get: () =>
    request('/notifications', {
      method: 'GET',
    }),
};

// ----------------------------------------------------------------------------
// System Pricing Configuration API (/config)
// ----------------------------------------------------------------------------
export const systemConfig = {
  get: () =>
    request('/config', {
      method: 'GET',
    }),

  update: (data) =>
    request('/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ----------------------------------------------------------------------------
// Admin API (Quản trị hệ thống & Biểu giá nhà nước)
// ----------------------------------------------------------------------------
export const admin = {
  getRequests: () =>
    request('/admin/requests', {
      method: 'GET',
    }),

  approveRequest: (id) =>
    request(`/admin/requests/${id}/approve`, {
      method: 'POST',
    }),

  rejectRequest: (id, reject_reason) =>
    request(`/admin/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(reject_reason ? { reject_reason } : {}),
    }),

  getAdmins: () =>
    request('/admin/admins', {
      method: 'GET',
    }),

  promoteAdmin: (userId) =>
    request(`/admin/promote/${userId}`, {
      method: 'POST',
    }),

  demoteAdmin: (userId) =>
    request(`/admin/demote/${userId}`, {
      method: 'POST',
    }),

  changeRole: (userId, role) =>
    request(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  rotateSecret: (payload) =>
    request('/admin/secret/rotate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  revealSecret: (payload) =>
    request('/admin/secret/reveal', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTariff: () =>
    request('/admin/tariff', {
      method: 'GET',
    }),

  updateTariff: (data) =>
    request('/admin/tariff', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getTariffHistory: () =>
    request('/admin/tariff/history', {
      method: 'GET',
    }),

  resetTariff: (version = 'QD-1279-2023') =>
    request(`/admin/tariff/reset/${encodeURIComponent(version)}`, {
      method: 'POST',
    }),
};

// ----------------------------------------------------------------------------
// Occupancy Change Dual-Approval Helper
// ----------------------------------------------------------------------------
export const occupancyRequests = {
  create: (roomId, payload) => rooms.requestOccupancyChange(roomId, payload),
  getByRoom: (roomId) => rooms.getOccupancyRequests(roomId),
  approve: (requestId) => rooms.approveOccupancyRequest(requestId),
  reject: (requestId, reason) => rooms.rejectOccupancyRequest(requestId, reason),
};

export default {
  request,
  getToken,
  setToken,
  removeToken,
  auth,
  properties,
  rooms,
  occupancyRequests,
  tenant,
  invoices,
  notifications,
  systemConfig,
  admin,
};
