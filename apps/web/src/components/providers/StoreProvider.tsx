'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiFetch,
  AuthUser,
  CartItemView,
  CartResponse,
  setAccessToken,
} from '@/lib/api';

const GUEST_CART_KEY = 'aethermart_guest_cart_v1';
const CITY_STORAGE_KEY = 'aethermart_selected_city';

export const INDIAN_CITIES = [
  'Mumbai',
  'Bengaluru',
  'Delhi',
  'Pune',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Ahmedabad',
] as const;

export type IndianCity = (typeof INDIAN_CITIES)[number];

export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Delhi: { lat: 28.6139, lng: 77.209 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
};

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function findNearestIndianCity(userLat: number, userLng: number): string {
  let nearestCity = 'Mumbai';
  let minDistance = Infinity;

  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    const dist = getDistanceKm(userLat, userLng, coords.lat, coords.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCity = city;
    }
  }

  return nearestCity;
}

interface ToastMessage {
  id: string;
  text: string;
  tone: 'success' | 'error' | 'info';
}

interface StoreContextValue {
  user: AuthUser | null;
  authLoading: boolean;
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  detectLocation: () => Promise<string | null>;
  isDetectingLocation: boolean;
  availableCities: readonly string[];
  cart: CartResponse;
  cartDrawerOpen: boolean;
  setCartDrawerOpen: (open: boolean) => void;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  completeOAuthSession: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  addToCart: (product: CartItemView['product'], quantity?: number) => Promise<void>;
  updateCartQty: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  reloadCart: () => Promise<void>;
  notify: (text: string, tone?: ToastMessage['tone']) => void;
}

const emptyCart: CartResponse = { items: [], itemCount: 0, subtotalPaise: 0 };

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedCity, setSelectedCityState] = useState<string>('Mumbai');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [cart, setCart] = useState<CartResponse>(emptyCart);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const detectLocation = useCallback(async (): Promise<string | null> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      notify('Geolocation is not supported by your browser', 'error');
      return null;
    }
    setIsDetectingLocation(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsDetectingLocation(false);
          const nearest = findNearestIndianCity(pos.coords.latitude, pos.coords.longitude);
          setSelectedCityState(nearest);
          window.localStorage.setItem(CITY_STORAGE_KEY, nearest);
          notify(`📍 Located nearest store in ${nearest} via GPS`, 'success');
          resolve(nearest);
        },
        (err) => {
          setIsDetectingLocation(false);
          notify('Could not access GPS location. You can select your city from the store menu.', 'info');
          resolve(null);
        },
        { timeout: 8000, enableHighAccuracy: false },
      );
    });
  }, [notify]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(CITY_STORAGE_KEY);
      if (saved) {
        setSelectedCityState(saved);
      } else if (navigator.geolocation) {
        // Automatic detection on first visit
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const nearest = findNearestIndianCity(pos.coords.latitude, pos.coords.longitude);
            setSelectedCityState(nearest);
            window.localStorage.setItem(CITY_STORAGE_KEY, nearest);
            notify(`📍 Auto-detected nearest store branch: ${nearest}`, 'success');
          },
          () => {
            // User denied or timed out; keep default Mumbai
          },
          { timeout: 6000, enableHighAccuracy: false },
        );
      }
    }
  }, [notify]);

  const setSelectedCity = useCallback((city: string) => {
    setSelectedCityState(city);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CITY_STORAGE_KEY, city);
    }
    notify(`📍 Showing products available in ${city}`, 'info');
  }, [notify]);

  const readGuestCart = useCallback((): CartResponse => {
    if (typeof window === 'undefined') return emptyCart;
    try {
      const raw = window.localStorage.getItem(GUEST_CART_KEY);
      if (!raw) return emptyCart;
      const parsed = JSON.parse(raw) as CartItemView[];
      const subtotalPaise = parsed.reduce((sum, i) => sum + i.product.pricePaise * i.quantity, 0);
      const itemCount = parsed.reduce((sum, i) => sum + i.quantity, 0);
      return { items: parsed, itemCount, subtotalPaise };
    } catch {
      return emptyCart;
    }
  }, []);

  const writeGuestCart = useCallback((items: CartItemView[]) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    const subtotalPaise = items.reduce((sum, i) => sum + i.product.pricePaise * i.quantity, 0);
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    setCart({ items, itemCount, subtotalPaise });
  }, []);

  const mergeGuestCartIfAny = useCallback(async () => {
    const guest = readGuestCart();
    if (guest.items.length > 0) {
      const merged = await apiFetch<CartResponse>('/cart/merge', {
        method: 'POST',
        body: JSON.stringify({
          items: guest.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(GUEST_CART_KEY);
      }
      setCart(merged);
      return;
    }
    const serverCart = await apiFetch<CartResponse>('/cart');
    setCart(serverCart);
  }, [readGuestCart]);

  const reloadCart = useCallback(async () => {
    if (user) {
      const serverCart = await apiFetch<CartResponse>('/cart');
      setCart(serverCart);
    } else {
      setCart(readGuestCart());
    }
  }, [user, readGuestCart]);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: AuthUser; accessToken: string }>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
        skipAuthRefresh: true,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      const serverCart = await apiFetch<CartResponse>('/cart');
      setCart(serverCart);
    } catch {
      setAccessToken(null);
      setUser(null);
      setCart(readGuestCart());
    } finally {
      setAuthLoading(false);
    }
  }, [readGuestCart]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ user: AuthUser; accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuthRefresh: true,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      await mergeGuestCartIfAny();
      notify(`Signed in as ${data.user.name}`, 'success');
      return data.user;
    },
    [mergeGuestCartIfAny, notify],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await apiFetch<{ user: AuthUser; accessToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
        skipAuthRefresh: true,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      await mergeGuestCartIfAny();
      notify('Account created! Verification email queued.', 'success');
      return data.user;
    },
    [mergeGuestCartIfAny, notify],
  );

  const completeOAuthSession = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: AuthUser; accessToken: string }>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
        skipAuthRefresh: true,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      await mergeGuestCartIfAny();
      return data.user;
    } catch {
      return null;
    }
  }, [mergeGuestCartIfAny]);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST', skipAuthRefresh: true }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setCart(readGuestCart());
    notify('Signed out', 'info');
  }, [notify, readGuestCart]);

  const addToCart = useCallback(
    async (product: CartItemView['product'], quantity = 1) => {
      if (user) {
        const updated = await apiFetch<CartResponse>('/cart/items', {
          method: 'POST',
          body: JSON.stringify({ productId: product.id, quantity }),
        });
        setCart(updated);
      } else {
        const current = readGuestCart().items;
        const existing = current.find((i) => i.productId === product.id);
        let next: CartItemView[];
        if (existing) {
          next = current.map((i) =>
            i.productId === product.id
              ? { ...i, quantity: Math.min(product.stock, i.quantity + quantity) }
              : i,
          );
        } else {
          next = [
            ...current,
            {
              id: `guest-${product.id}`,
              productId: product.id,
              quantity: Math.min(product.stock, quantity),
              product,
            },
          ];
        }
        writeGuestCart(next);
      }
      setCartDrawerOpen(true);
      notify(`Added ${product.title} to bag`, 'success');
    },
    [notify, readGuestCart, user, writeGuestCart],
  );

  const updateCartQty = useCallback(
    async (productId: string, quantity: number) => {
      if (user) {
        const updated = await apiFetch<CartResponse>(`/cart/items/${productId}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity }),
        });
        setCart(updated);
      } else {
        const current = readGuestCart().items;
        const next =
          quantity <= 0
            ? current.filter((i) => i.productId !== productId)
            : current.map((i) =>
                i.productId === productId
                  ? { ...i, quantity: Math.min(i.product.stock, quantity) }
                  : i,
              );
        writeGuestCart(next);
      }
    },
    [readGuestCart, user, writeGuestCart],
  );

  const removeFromCart = useCallback(
    async (productId: string) => {
      if (user) {
        const updated = await apiFetch<CartResponse>(`/cart/items/${productId}`, {
          method: 'DELETE',
        });
        setCart(updated);
      } else {
        const current = readGuestCart().items;
        writeGuestCart(current.filter((i) => i.productId !== productId));
      }
    },
    [readGuestCart, user, writeGuestCart],
  );

  return (
    <StoreContext.Provider
      value={{
        user,
        authLoading,
        selectedCity,
        setSelectedCity,
        detectLocation,
        isDetectingLocation,
        availableCities: INDIAN_CITIES,
        cart,
        cartDrawerOpen,
        setCartDrawerOpen,
        login,
        register,
        completeOAuthSession,
        logout,
        refreshSession,
        addToCart,
        updateCartQty,
        removeFromCart,
        reloadCart,
        notify,
      }}
    >
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl px-4 py-3 text-sm font-medium shadow-lg border transition-all ${
              toast.tone === 'success'
                ? 'bg-emerald-950 text-emerald-50 border-emerald-700'
                : toast.tone === 'error'
                  ? 'bg-red-950 text-red-50 border-red-700'
                  : 'bg-gray-900 text-white border-gray-700'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used inside StoreProvider');
  }
  return ctx;
}

