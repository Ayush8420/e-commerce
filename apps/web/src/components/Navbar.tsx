'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatInrFromPaise } from '@ecommerce/shared';
import {
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useStore } from './providers/StoreProvider';

interface Suggestion {
  id: string;
  title: string;
  slug: string;
  brand: string;
  pricePaise: number;
  image?: string;
}

export function Navbar() {
  const router = useRouter();
  const { user, cart, setCartDrawerOpen, logout } = useStore();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ suggestions: Suggestion[] }>(
          `/search/suggest?q=${encodeURIComponent(trimmed)}`,
          { skipAuthRefresh: true },
        );
        setSuggestions(res.suggestions);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowDropdown(false);
    const trimmed = query.trim();
    router.push(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : '/products');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-gray-900">
              AetherMart
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-widest text-stone-500">
              Curated Studio Gear
            </span>
          </div>
        </Link>

        <div ref={wrapperRef} className="relative hidden flex-1 max-w-xl md:block">
          <form onSubmit={handleSubmit} className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder="Search Sony, Keychron, smart lamps, GaN chargers..."
              className="w-full rounded-full border border-stone-200 bg-stone-50 py-2 pl-10 pr-20 text-sm text-gray-900 placeholder:text-stone-400 focus:border-gray-900 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-gray-900 px-3.5 py-1 text-xs font-medium text-white hover:bg-gray-800"
            >
              Search
            </button>
          </form>

          {showDropdown && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
              {suggestions.map((item) => (
                <Link
                  key={item.id}
                  href={`/products/${item.slug}`}
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-10 w-10 rounded-lg object-cover bg-stone-100 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-stone-100 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-stone-500">{item.brand}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-gray-900">
                    {formatInrFromPaise(item.pricePaise)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/products"
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 hover:text-gray-900"
          >
            Catalog
          </Link>

          {user && (
            <Link
              href="/orders"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 hover:text-gray-900 sm:flex"
            >
              <Package className="h-4 w-4" />
              Orders
            </Link>
          )}

          {user?.role === 'ADMIN' && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-1.5">
              <Link
                href="/orders"
                className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-stone-100"
              >
                <UserIcon className="h-3.5 w-3.5 text-stone-600" />
                <span className="max-w-[90px] truncate">{user.name.split(' ')[0]}</span>
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                title="Sign out"
                className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-stone-100"
            >
              Sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => setCartDrawerOpen(true)}
            className="relative flex items-center gap-2 rounded-full bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Bag</span>
            {cart.itemCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
                {cart.itemCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}

