'use client';

import React from 'react';
import Link from 'next/link';
import { formatInrFromPaise, ProductDocument } from '@ecommerce/shared';
import { Plus, Star } from 'lucide-react';
import { useStore } from './providers/StoreProvider';

export function ProductCard({ product }: { product: ProductDocument }) {
  const { addToCart } = useStore();
  const discountPct =
    product.compareAtPaise && product.compareAtPaise > product.pricePaise
      ? Math.round(((product.compareAtPaise - product.pricePaise) / product.compareAtPaise) * 100)
      : 0;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/products/${product.slug}`} className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        <img
          src={
            product.images[0] ||
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'
          }
          alt={product.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {discountPct > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
            {discountPct}% OFF
          </span>
        )}
        {product.stock <= 0 && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold uppercase tracking-wider text-white">
            Out of Stock
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span className="font-medium uppercase tracking-wider">{product.brand}</span>
          <span className="flex items-center gap-1 font-medium text-amber-600">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            {product.ratingAvg.toFixed(1)} ({product.reviewCount})
          </span>
        </div>

        <Link
          href={`/products/${product.slug}`}
          className="mt-1.5 line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-indigo-700"
        >
          {product.title}
        </Link>

        <p className="mt-1 line-clamp-2 text-xs text-stone-500">{product.categoryName}</p>

        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            <span className="font-mono text-base font-bold text-gray-900">
              {formatInrFromPaise(product.pricePaise)}
            </span>
            {product.compareAtPaise && product.compareAtPaise > product.pricePaise && (
              <span className="ml-2 font-mono text-xs text-stone-400 line-through">
                {formatInrFromPaise(product.compareAtPaise)}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={product.stock <= 0}
            onClick={() =>
              void addToCart({
                id: product.id,
                title: product.title,
                slug: product.slug,
                brand: product.brand,
                pricePaise: product.pricePaise,
                compareAtPaise: product.compareAtPaise,
                stock: product.stock,
                images: product.images,
                categoryName: product.categoryName,
              })
            }
            className="flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

