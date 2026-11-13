'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatInrFromPaise } from '@ecommerce/shared';
import { ArrowLeft, CheckCircle2, MapPin, Minus, Plus, ShieldCheck, Star, Store, Truck } from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch, trackAnalyticsEvent } from '@/lib/api';

interface StoreInventoryItem {
  id: string;
  storeId: string;
  quantity: number;
  store: {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    address: string;
    isActive: boolean;
  };
}

interface ProductDetail {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  pricePaise: number;
  compareAtPaise: number | null;
  sku: string;
  stock: number;
  images: string[];
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  ratingAvg: number;
  reviewCount: number;
  category: { id: string; name: string; slug: string };
  reviews: Array<{
    id: string;
    rating: number;
    title: string;
    comment: string;
    createdAt: string;
    user: { id: string; name: string; avatarUrl: string | null };
  }>;
}

export default function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, addToCart, notify } = useStore();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [storeInventories, setStoreInventories] = useState<StoreInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);

  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadProduct = useCallback(async () => {
    try {
      const data = await apiFetch<ProductDetail>(`/products/${slug}`, { skipAuthRefresh: true });
      setProduct(data);
      void trackAnalyticsEvent({
        type: 'product.viewed',
        productId: data.id,
        metadata: { slug: data.slug, category: data.category.slug },
      });

      // Load per-store inventory across Indian physical retail outlets
      apiFetch<StoreInventoryItem[]>(`/orders/stores/inventory/${data.id}`, { skipAuthRefresh: true })
        .then((items) => {
          if (Array.isArray(items)) setStoreInventories(items);
        })
        .catch(() => undefined);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSubmittingReview(true);
    try {
      await apiFetch(`/products/${product.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          title: reviewTitle,
          comment: reviewComment,
        }),
      });
      notify('Review published and indexed!', 'success');
      setReviewTitle('');
      setReviewComment('');
      await loadProduct();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to post review', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="h-[460px] animate-pulse rounded-3xl bg-stone-200" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Product not found</h1>
        <Link href="/products" className="mt-4 inline-block text-sm font-semibold text-indigo-700">
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to catalog
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-12">
        {/* Images */}
        <div className="lg:col-span-6">
          <div className="aspect-square overflow-hidden rounded-3xl border border-stone-200 bg-white">
            <img
              src={
                product.images[selectedImage] ||
                product.images[0] ||
                'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80'
              }
              alt={product.title}
              className="h-full w-full object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <div className="mt-4 flex gap-3">
              {product.images.map((img, idx) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setSelectedImage(idx)}
                  className={`h-20 w-20 overflow-hidden rounded-xl border-2 ${
                    selectedImage === idx ? 'border-gray-900' : 'border-stone-200'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="lg:col-span-6">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-indigo-700">
            <span>{product.brand}</span>
            <span>&bull;</span>
            <Link href={`/products?category=${product.category.slug}`} className="hover:underline">
              {product.category.name}
            </Link>
          </div>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{product.title}</h1>

          <div className="mt-3 flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
              <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
              {product.ratingAvg.toFixed(1)}
            </span>
            <span className="text-stone-500">{product.reviewCount} verified reviews</span>
            <span className="font-mono text-xs text-stone-400">SKU: {product.sku}</span>
          </div>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold text-gray-900">
              {formatInrFromPaise(product.pricePaise)}
            </span>
            {product.compareAtPaise && product.compareAtPaise > product.pricePaise && (
              <span className="font-mono text-lg text-stone-400 line-through">
                {formatInrFromPaise(product.compareAtPaise)}
              </span>
            )}
          </div>

          <p className="mt-5 text-sm leading-relaxed text-stone-700">{product.description}</p>

          <div className="mt-6 flex items-center gap-2 text-sm">
            <CheckCircle2
              className={`h-4 w-4 ${product.stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}
            />
            <span className={product.stock > 0 ? 'font-medium text-emerald-700' : 'text-red-600'}>
              {product.stock > 0 ? `In stock (${product.stock} units available)` : 'Out of stock'}
            </span>
          </div>

          {/* Quantity + Add */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-xl border border-stone-300 bg-white">
              <button
                type="button"
                onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                className="p-3 text-stone-600 hover:text-gray-900"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-mono text-sm font-semibold">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((prev) => Math.min(product.stock || 1, prev + 1))}
                className="p-3 text-stone-600 hover:text-gray-900"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={product.stock <= 0}
              onClick={() =>
                void addToCart(
                  {
                    id: product.id,
                    title: product.title,
                    slug: product.slug,
                    brand: product.brand,
                    pricePaise: product.pricePaise,
                    compareAtPaise: product.compareAtPaise,
                    stock: product.stock,
                    images: product.images,
                    categoryName: product.category.name,
                  },
                  qty,
                )
              }
              className="flex-1 rounded-xl bg-gray-900 px-8 py-3.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-stone-300"
            >
              Add to Bag &bull; {formatInrFromPaise(product.pricePaise * qty)}
            </button>
          </div>

          <div className="mt-6 grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 text-xs text-stone-700">
              <Truck className="h-4 w-4 text-gray-900 shrink-0" />
              Free express delivery on orders ₹999+
            </div>
            <div className="flex items-center gap-2.5 text-xs text-stone-700">
              <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
              Instant UPI QR &amp; VPA checkout supported
            </div>
          </div>

          {/* Physical Retail Store Stock Across India */}
          {storeInventories.length > 0 && (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-900">
                  <Store className="h-4 w-4 text-indigo-600" /> Physical Store Availability
                </span>
                <span className="text-[11px] text-stone-500 font-mono">Live Aiven PostgreSQL Stock</span>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {storeInventories.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col justify-between rounded-xl border border-stone-100 bg-stone-50 p-2 text-xs"
                  >
                    <div>
                      <span className="flex items-center gap-1 font-semibold text-gray-900">
                        <MapPin className="h-3 w-3 text-stone-400" /> {inv.store.city}
                      </span>
                      <p className="text-[10px] text-stone-500 truncate" title={inv.store.name}>
                        {inv.store.name}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between pt-1 border-t border-stone-200/60">
                      <span className="text-[10px] text-stone-400">Stock:</span>
                      <span
                        className={`font-mono text-xs font-bold ${
                          inv.quantity > 0 ? 'text-emerald-700' : 'text-red-500'
                        }`}
                      >
                        {inv.quantity > 0 ? `${inv.quantity} units` : 'Sold out'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Specs */}
          {product.attributes && Object.keys(product.attributes).length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
                Specifications
              </h2>
              <dl className="mt-3 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
                {Object.entries(product.attributes).map(([key, value]) => (
                  <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                    <dt className="capitalize text-stone-500">{key}</dt>
                    <dd className="font-medium text-gray-900">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-16 border-t border-stone-200 pt-12">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-bold text-gray-900">Customer Reviews</h2>
            <p className="mt-1 text-sm text-stone-600">
              Submitting a review updates product rating in PostgreSQL and syncs to OpenSearch via Kafka.
            </p>

            {user ? (
              <form
                onSubmit={handleReviewSubmit}
                className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-5"
              >
                <h3 className="text-sm font-semibold text-gray-900">Write a Review</h3>
                <div>
                  <label className="block text-xs font-medium text-stone-600">Rating</label>
                  <div className="mt-1 flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            star <= rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-stone-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600">Headline</label>
                  <input
                    required
                    minLength={2}
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    placeholder="Great acoustic isolation"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600">Review</label>
                  <textarea
                    required
                    minLength={5}
                    rows={3}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Share your experience..."
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {submittingReview ? 'Submitting...' : 'Publish Review'}
                </button>
              </form>
            ) : (
              <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
                <p className="text-sm text-stone-600">Sign in to share your review.</p>
                <Link
                  href="/login"
                  className="mt-3 inline-block rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-7">
            {product.reviews.length === 0 ? (
              <p className="text-sm text-stone-500">No reviews yet. Be the first to review!</p>
            ) : (
              product.reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="rounded-2xl border border-stone-200 bg-white p-5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{rev.user.name}</span>
                      <span className="text-xs text-stone-400">
                        {new Date(rev.createdAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {rev.rating}.0
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-semibold text-gray-900">{rev.title}</h4>
                  <p className="mt-1 text-sm text-stone-600">{rev.comment}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

