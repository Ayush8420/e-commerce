'use client';

import React from 'react';
import Link from 'next/link';
import { formatInrFromPaise } from '@ecommerce/shared';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useStore } from './providers/StoreProvider';

export function CartDrawer() {
  const { cart, cartDrawerOpen, setCartDrawerOpen, updateCartQty, removeFromCart } = useStore();

  if (!cartDrawerOpen) {
    return null;
  }

  const freeShippingRemaining = Math.max(0, 99900 - cart.subtotalPaise);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-gray-900" />
            <h2 className="text-lg font-semibold text-gray-900">
              Your Bag ({cart.itemCount})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCartDrawerOpen(false)}
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-stone-100 bg-stone-50 px-6 py-2.5 text-xs text-stone-600">
          {freeShippingRemaining === 0 ? (
            <span className="font-medium text-emerald-700">
              Unlocked FREE Express Delivery across India!
            </span>
          ) : (
            <span>
              Add <strong className="text-gray-900">{formatInrFromPaise(freeShippingRemaining)}</strong> more for free shipping
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cart.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-full bg-stone-100 p-4 text-stone-400">
                <ShoppingBag className="h-8 w-8" />
              </div>
              <p className="text-base font-medium text-gray-900">Your bag is empty</p>
              <p className="mt-1 text-sm text-stone-500">
                Explore headphones, mechanical keyboards, and smart studio gear.
              </p>
              <Link
                href="/products"
                onClick={() => setCartDrawerOpen(false)}
                className="mt-5 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Browse Catalog
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.productId}
                  className="flex gap-4 rounded-2xl border border-stone-200 p-3"
                >
                  <img
                    src={item.product.images[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=60'}
                    alt={item.product.title}
                    className="h-20 w-20 shrink-0 rounded-xl object-cover bg-stone-100"
                  />
                  <div className="flex flex-1 flex-col justify-between min-w-0">
                    <div>
                      <Link
                        href={`/products/${item.product.slug}`}
                        onClick={() => setCartDrawerOpen(false)}
                        className="line-clamp-1 text-sm font-semibold text-gray-900 hover:underline"
                      >
                        {item.product.title}
                      </Link>
                      <p className="text-xs text-stone-500">{item.product.brand}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-stone-200">
                        <button
                          type="button"
                          onClick={() => void updateCartQty(item.productId, item.quantity - 1)}
                          className="p-1.5 text-stone-600 hover:text-gray-900"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-semibold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => void updateCartQty(item.productId, item.quantity + 1)}
                          disabled={item.quantity >= item.product.stock}
                          className="p-1.5 text-stone-600 hover:text-gray-900 disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-gray-900">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="border-t border-stone-200 bg-stone-50 p-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-600">Subtotal</span>
              <span className="font-mono text-lg font-bold text-gray-900">
                {formatInrFromPaise(cart.subtotalPaise)}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Promo codes &amp; UPI QR / ID calculated at checkout.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                href="/cart"
                onClick={() => setCartDrawerOpen(false)}
                className="flex items-center justify-center rounded-xl border border-stone-300 bg-white py-3 text-sm font-semibold text-gray-900 hover:bg-stone-100"
              >
                View Bag
              </Link>
              <Link
                href="/checkout"
                onClick={() => setCartDrawerOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Checkout <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

