'use client';

import type { ProductDocument, SearchResponse, ShippingAddress, UserRole } from '@ecommerce/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    title: string;
    slug: string;
    brand: string;
    pricePaise: number;
    compareAtPaise: number | null;
    stock: number;
    images: string[];
    categoryName: string;
  };
}

export interface CartResponse {
  items: CartItemView[];
  itemCount: number;
  subtotalPaise: number;
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

export interface UpiPaymentPayload {
  provider: string;
  merchantVpa: string;
  merchantName: string;
  transactionRef: string;
  amountPaise: number;
  upiUri: string;
  qrDataUrl: string;
  customerVpa: string | null;
}

export interface OrderItemView {
  id: string;
  productId: string;
  titleSnapshot: string;
  skuSnapshot: string;
  imageSnapshot: string | null;
  pricePaise: number;
  quantity: number;
}

export interface PaymentTxView {
  id: string;
  provider: string;
  method: 'UPI_QR' | 'UPI_VPA' | 'CARD_TEST';
  amountPaise: number;
  upiVpa: string | null;
  upiUri: string | null;
  utrNumber: string | null;
  status: string;
  createdAt: string;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  paymentMethod: 'UPI_QR' | 'UPI_VPA' | 'CARD_TEST';
  paymentStatus: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  promoCode: string | null;
  shippingAddress: ShippingAddress;
  upiTransactionRef: string | null;
  upiVpa: string | null;
  items: OrderItemView[];
  payments: PaymentTxView[];
  user?: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

let inMemoryToken: string | null = null;
let sessionRefreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryToken;
}

function getClientSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const key = 'aethermart_session_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `sess_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (!sessionRefreshPromise) {
    sessionRefreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          inMemoryToken = null;
          return null;
        }
        const data = (await res.json()) as { accessToken: string };
        inMemoryToken = data.accessToken;
        return data.accessToken;
      } catch {
        inMemoryToken = null;
        return null;
      } finally {
        sessionRefreshPromise = null;
      }
    })();
  }
  return sessionRefreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuthRefresh?: boolean } = {},
): Promise<T> {
  const { skipAuthRefresh, headers, ...rest } = options;

  const makeRequest = async (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': getClientSessionId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers ?? {}),
      },
    });

  let res = await makeRequest(inMemoryToken);

  if (res.status === 401 && !skipAuthRefresh && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await makeRequest(newToken);
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(errBody.message)) {
        message = errBody.message.join(', ');
      } else if (errBody.message) {
        message = errBody.message;
      }
    } catch {
      // ignore non-json error bodies
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export function getGoogleLoginUrl(): string {
  return `${API_BASE}/auth/google`;
}

export async function trackAnalyticsEvent(payload: {
  type: 'search.performed' | 'product.viewed' | 'cart.item_added' | 'checkout.started' | 'order.completed';
  productId?: string;
  orderId?: string;
  query?: string;
  metadata?: Record<string, unknown>;
}) {
  await apiFetch('/analytics/track', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuthRefresh: true,
  }).catch(() => undefined);
}

export type { ProductDocument, SearchResponse };

