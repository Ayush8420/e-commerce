'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductDocument, SearchResponse } from '@ecommerce/shared';
import { ArrowRight, Mail, QrCode, Search, ShieldCheck, Zap } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { apiFetch, CategorySummary } from '@/lib/api';

export default function HomePage() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [featured, setFeatured] = useState<ProductDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<CategorySummary[]>('/categories', { skipAuthRefresh: true }).catch(() => []),
      apiFetch<SearchResponse>('/search?limit=8&sort=rating_desc', { skipAuthRefresh: true }).catch(
        () => ({ items: [] as ProductDocument[] }),
      ),
    ])
      .then(([cats, searchRes]) => {
        if (!active) return;
        setCategories(cats);
        setFeatured(searchRes.items ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-gradient-to-br from-stone-950 via-stone-900 to-indigo-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:items-center lg:py-24">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-medium text-emerald-300">
              <Zap className="h-3.5 w-3.5" />
              Instant UPI Checkout &bull; Live OpenSearch Discovery
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Precision tech for your desk, studio &amp; daily carry.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-stone-300 sm:text-lg">
              Explore studio audio, hot-swappable mechanical keyboards, and smart ambient lighting.
              Use promo code <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-emerald-300">UPIFIRST</code> for 15% off your first UPI order.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-stone-100"
              >
                Explore Catalog <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/products?category=mechanical-keyboards"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Shop Keyboards
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <Search className="h-6 w-6 text-indigo-300" />
              <h3 className="mt-3 text-sm font-semibold">OpenSearch Facets</h3>
              <p className="mt-1 text-xs text-stone-300">
                Typo-tolerant full-text search with instant brand, price &amp; rating filters.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <QrCode className="h-6 w-6 text-emerald-300" />
              <h3 className="mt-3 text-sm font-semibold">UPI QR &amp; VPA</h3>
              <p className="mt-1 text-xs text-stone-300">
                Scan NPCI UPI QR codes or pay via VPA with instant UTR verification.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <Mail className="h-6 w-6 text-amber-300" />
              <h3 className="mt-3 text-sm font-semibold">Kafka Email Alerts</h3>
              <p className="mt-1 text-xs text-stone-300">
                Transactional outbox events deliver order &amp; shipping emails reliably.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <ShieldCheck className="h-6 w-6 text-sky-300" />
              <h3 className="mt-3 text-sm font-semibold">Google &amp; JWT Auth</h3>
              <p className="mt-1 text-xs text-stone-300">
                Sign in seamlessly with email/password or Google OAuth 2.0.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Shop by Category</h2>
            <p className="mt-1 text-sm text-stone-600">Curated collections synchronized via Kafka</p>
          </div>
          <Link href="/products" className="text-sm font-semibold text-indigo-700 hover:underline">
            View all
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/products?category=${cat.slug}`}
              className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="aspect-[16/10] overflow-hidden rounded-xl bg-stone-100">
                <img
                  src={cat.imageUrl || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=60'}
                  alt={cat.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">{cat.name}</h3>
              <p className="text-xs text-stone-500">{cat.productCount} items</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Featured Gear</h2>
            <p className="mt-1 text-sm text-stone-600">Top-rated essentials ready for instant UPI checkout</p>
          </div>
          <Link href="/products" className="text-sm font-semibold text-indigo-700 hover:underline">
            Filter &amp; search all &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-80 animate-pulse rounded-2xl bg-stone-200" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <p className="text-base font-medium text-gray-900">No products indexed yet</p>
            <p className="mt-1 text-sm text-stone-500">
              Start Docker Compose, push the Prisma schema, and run <code className="font-mono">npm run db:seed</code> to populate sample gear.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

