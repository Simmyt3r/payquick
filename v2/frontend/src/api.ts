import { Capacitor } from '@capacitor/core';

export type Session = { access_token: string; user: { id: string; name: string; email: string; role?: 'customer' | 'operator' | 'admin' } };
export type WalletInfo = { balance_kobo: number; currency: 'NGN' };
export type Meter = {
  id: string; nickname: string; disco: string; meter_number: string; meter_type: string;
  capability: { remote_loading: boolean; load_mode: 'remote' | 'manual'; status: string };
};
export type Quote = {
  quote_id: string; amount_kobo: number; total_kobo: number; verified_customer_name: string; service_band: string; meter_number: string; disco: string;
  remote_loading_supported: boolean; execution_enabled: boolean; message: string;
};

// Web/PWA always uses same-origin /api, routed by the root Vercel services rewrite.
// VITE_API_URL is an Android/iOS native-only HTTPS origin, not a browser service binding.
const nativeApiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
const nativeClient = Capacitor.isNativePlatform();

export async function api<T>(path: string, options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  if (nativeClient && !nativeApiOrigin) {
    throw new Error('Android app needs VITE_API_URL set to the public HTTPS API.');
  }
  const res = await fetch((nativeClient ? nativeApiOrigin : '') + '/api' + path, {
    method: options.method || 'GET',
    headers: {
      ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
      ...(options.headers || {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  let data: Record<string, unknown>;
  try { data = await res.json() as Record<string, unknown>; }
  catch { throw new Error('The server did not return a valid response.'); }
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
  return data as T;
}

export const money = (kobo: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
