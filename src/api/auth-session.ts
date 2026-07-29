export const AUTH_EXPIRED_EVENT = 'clever:auth-expired';
export const AUTH_TOKEN_STORAGE_KEY = 'clever.auth.token';
export const CSRF_TOKEN_STORAGE_KEY = 'clever.auth.csrf';

export function readAuthToken(): string | null {
  return window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function readCsrfToken(): string | null {
  return window.sessionStorage.getItem(CSRF_TOKEN_STORAGE_KEY);
}

export function storeAuthToken(token: string): void {
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function storeCsrfToken(token: string): void {
  window.sessionStorage.setItem(CSRF_TOKEN_STORAGE_KEY, token);
}

export function clearTransportSession(): void {
  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
}

export function expireTransportSession(): void {
  clearTransportSession();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
