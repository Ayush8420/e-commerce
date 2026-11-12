'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatInrFromPaise } from '@ecommerce/shared';
import { ArrowRight, Package } from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch, OrderView } from '@/lib/api';

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SHIPPED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PROCESSING: 'bg-sky-50 text-sky-700 border-sky-200',
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-stone-100 text-stone-600 border-stone-200',
};

export default function OrdersPage() {
  const { user, authLoading } = useStore();
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    apiFetch<OrderView[]>('/orders')
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (!authLoading && !user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Sign in to view your orders</h1>
        <Link
          href="/login?next=/orders"
          className="mt-5 inline-block rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Your Orders</h1>
      <p className="mt-1 text-sm text-stone-600">
        Track live status updates, UPI UTR receipts, and email notifications.
      </p>

      {loading ? (
        <div className="mt-6 space-y-4">
          <div className="h-32 animate-pulse rounded-2xl bg-stone-200" />
          <div className="h-32 animate-pulse rounded-2xl bg-stone-200" />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-stone-400" />
          <p className="mt-3 text-base font-semibold text-gray-900">No orders placed yet</p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block rounded-2xl border border-stone-200 bg-white p-5 transition hover:shadow-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-sm font-bold text-gray-900">{order.orderNumber}</p>
                  <p className="text-xs text-stone-500">
                    Placed on {new Date(order.createdAt).toLocaleString('en-IN')} &bull;{' '}
                    {order.items.length} item(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      STATUS_STYLE[order.status] ?? 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {order.status}
                  </span>
                  <span className="font-mono text-base font-bold text-gray-900">
                    {formatInrFromPaise(order.totalPaise)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-stone-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

