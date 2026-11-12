import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-4 sm:px-6">
        <div className="sm:col-span-2">
          <h3 className="text-base font-bold text-gray-900">AetherMart</h3>
          <p className="mt-2 max-w-md text-sm text-stone-600">
            Event-driven e-commerce storefront powered by Next.js, NestJS, PostgreSQL + Prisma,
            Apache Kafka outbox streams, OpenSearch faceted discovery, and instant UPI payments.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Shop</h4>
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            <li><Link href="/products" className="hover:text-gray-900">All Products</Link></li>
            <li><Link href="/products?category=audio-headphones" className="hover:text-gray-900">Audio &amp; Headphones</Link></li>
            <li><Link href="/products?category=mechanical-keyboards" className="hover:text-gray-900">Mechanical Keyboards</Link></li>
            <li><Link href="/cart" className="hover:text-gray-900">Shopping Bag</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Account</h4>
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            <li><Link href="/login" className="hover:text-gray-900">Sign In / Google OAuth</Link></li>
            <li><Link href="/orders" className="hover:text-gray-900">Order History</Link></li>
            <li><Link href="/admin" className="hover:text-gray-900">Admin Console</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

