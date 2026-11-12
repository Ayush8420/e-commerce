'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { formatInrFromPaise } from '@ecommerce/shared';
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch } from '@/lib/api';

export default function CartPage() {
  const { cart, updateCartQty, removeFromCart, notify } = useStore();
  const [promoCode, setPromoCode] = useState('');
  const [discountPaise, setDiscountPaise] = useState(0);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  const afterDiscount = Math.max(0, cart.subtotalPaise - discountPaise);
  const shippingPaise = cart.items.length === 0 ? 0 : afterDiscount >= 99900 ? 0 : 7900;
  const totalPaise = afterDiscount + shippingPaise;

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    try {
      const res = await apiFetch<{ code: string; discountPaise: number }>('/promos/validate', {
        method: 'POST',
        body: JSON.stringify({ code: promoCode.trim(), subtotalPaise: cart.subtotalPaise }),
        skipAuthRefresh: true,
      });
      setDiscountPaise(res.discountPaise);
      setAppliedPromo(res.code);
      notify(`Promo ${res.code} applied!`, 'success');
    } catch (err) {
      setDiscountPaise(0);
      setAppliedPromo(null);
      notify(err instanceof Error ? err.message : 'Invalid promo code', 'error');
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-stone-400">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Your shopping bag is empty</h1>
        <p className="mt-2 text-sm text-stone-500">
          Browse studio headphones, mechanical keyboards, and smart home accessories.
        </p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white"
        >
          Explore Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Shopping Bag</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {cart.items.map((item) => (
            <div
              key={item.productId}
              className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center"
            >
              <img
                src={item.product.images[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=60'}
                alt={item.product.title}
                className="h-24 w-24 rounded-xl object-cover bg-stone-100 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium uppercase text-stone-500">{item.product.brand}</p>
                <Link
                  href={`/products/${item.product.slug}`}
                  className="text-base font-semibold text-gray-900 hover:underline"
                >
                  {item.product.title}
                </Link>
                <p className="mt-1 font-mono text-sm font-medium text-stone-600">
                  {formatInrFromPaise(item.product.pricePaise)} each
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="flex items-center rounded-xl border border-stone-300">
                  <button
                    type="button"
                    onClick={() => void updateCartQty(item.productId, item.quantity - 1)}
                    className="p-2 text-stone-600 hover:text-gray-900"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center font-mono text-sm font-semibold">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => void updateCartQty(item.productId, item.quantity + 1)}
                    disabled={item.quantity >= item.product.stock}
                    className="p-2 text-stone-600 hover:text-gray-900 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="min-w-[90px] text-right font-mono text-base font-bold text-gray-900">
                  {formatInrFromPaise(item.product.pricePaise * item.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => void removeFromCart(item.productId)}
                  className="text-stone-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:col-span-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Order Summary</h2>

            <form onSubmit={handleApplyPromo} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Promo (WELCOME10, UPIFIRST)"
                  className="w-full rounded-xl border border-stone-300 py-2 pl-9 pr-3 text-sm uppercase"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800"
              >
                Apply
              </button>
            </form>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-600">Subtotal</dt>
                <dd className="font-mono font-semibold text-gray-900">
                  {formatInrFromPaise(cart.subtotalPaise)}
                </dd>
              </div>
              {discountPaise > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount ({appliedPromo})</dt>
                  <dd className="font-mono font-semibold">-{formatInrFromPaise(discountPaise)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-stone-600">Shipping</dt>
                <dd className="font-mono font-semibold text-gray-900">
                  {shippingPaise === 0 ? 'FREE' : formatInrFromPaise(shippingPaise)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-3 text-base font-bold text-gray-900">
                <dt>Total</dt>
                <dd className="font-mono">{formatInrFromPaise(totalPaise)}</dd>
              </div>
            </dl>

            <Link
              href={appliedPromo ? `/checkout?promo=${encodeURIComponent(appliedPromo)}` : '/checkout'}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Proceed to UPI Checkout <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

