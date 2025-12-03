const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const defaultApiBase = import.meta.env.VITE_API_BASE_URL || browserOrigin || 'http://localhost:4000';

export const API_BASE_URL = defaultApiBase;
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_BASE_URL;
