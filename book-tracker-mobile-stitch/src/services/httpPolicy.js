// Zero-import pure helpers for the api.js response interceptor.
// Kept import-free so Node's built-in test runner can exercise the auth and
// retry rules directly, without loading axios / React Native.
const TRANSIENT_CODES = ['ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK'];

export function isAuthExpiredError(error) {
  const config = error?.config;
  if (!config) return false;
  return error?.response?.status === 401 && !!config.headers?.Authorization && !config.skipAuthExpired;
}

export function isRetryableRequest(error) {
  const config = error?.config;
  if (!config || config.__retried) return false;
  const method = (config.method || 'get').toLowerCase();
  const transient = TRANSIENT_CODES.includes(error?.code) || !error?.response;
  return method === 'get' && transient;
}
