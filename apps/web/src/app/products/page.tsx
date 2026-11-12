'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatInrFromPaise, SearchResponse } from '@ecommerce/shared';
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { apiFetch } from '@/lib/api';

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get('category')?.split(',').filter(Boolean) ?? [],
  );
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    searchParams.get('brand')?.split(',').filter(Boolean) ?? [],
  );
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') ?? '');
  const [minRating, setMinRating] = useState(searchParams.get('minRating') ?? '');
  const [inStock, setInStock] = useState(searchParams.get('inStock') === 'true');
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'relevance');
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));

  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
    setSelectedCategories(searchParams.get('category')?.split(',').filter(Boolean) ?? []);
    setSelectedBrands(searchParams.get('brand')?.split(',').filter(Boolean) ?? []);
    setMinPrice(searchParams.get('minPrice') ?? '');
    setMaxPrice(searchParams.get('maxPrice') ?? '');
    setMinRating(searchParams.get('minRating') ?? '');
    setInStock(searchParams.get('inStock') === 'true');
    setSort(searchParams.get('sort') ?? 'relevance');
    setPage(Number(searchParams.get('page') ?? '1'));
  }, [searchParams]);

  const syncUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const next = new URLSearchParams();
      const merged: Record<string, string | undefined> = {
        q: q.trim() || undefined,
        category: selectedCategories.length ? selectedCategories.join(',') : undefined,
        brand: selectedBrands.length ? selectedBrands.join(',') : undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        minRating: minRating || undefined,
        inStock: inStock ? 'true' : undefined,
        sort: sort !== 'relevance' ? sort : undefined,
        page: page > 1 ? String(page) : undefined,
        ...overrides,
      };
      for (const [k, v] of Object.entries(merged)) {
        if (v) next.set(k, v);
      }
      const qs = next.toString();
      router.push(qs ? `/products?${qs}` : '/products');
    },
    [inStock, maxPrice, minPrice, minRating, page, q, router, selectedBrands, selectedCategories, sort],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (searchParams.get('q')) params.set('q', searchParams.get('q')!);
    if (searchParams.get('category')) params.set('category', searchParams.get('category')!);
    if (searchParams.get('brand')) params.set('brand', searchParams.get('brand')!);
    if (searchParams.get('minPrice')) params.set('minPrice', searchParams.get('minPrice')!);
    if (searchParams.get('maxPrice')) params.set('maxPrice', searchParams.get('maxPrice')!);
    if (searchParams.get('minRating')) params.set('minRating', searchParams.get('minRating')!);
    if (searchParams.get('inStock')) params.set('inStock', searchParams.get('inStock')!);
    if (searchParams.get('sort')) params.set('sort', searchParams.get('sort')!);
    if (searchParams.get('page')) params.set('page', searchParams.get('page')!);
    params.set('limit', '12');

    apiFetch<SearchResponse>(`/search?${params.toString()}`, { skipAuthRefresh: true })
      .then((res) => {
        if (active) setResult(res);
      })
      .catch(() => {
        if (active) setResult(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [searchParams]);

  const toggleItem = (list: string[], value: string) =>
    list.includes(value) ? list.filter((i) => i !== value) : [...list, value];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Catalog</h1>
          <p className="mt-1 text-sm text-stone-600">
            {result ? (
              <>
                Showing <strong>{result.total}</strong> results
                <span
                  className={`ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] ${
                    result.searchEngine === 'demo-fallback'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  engine: {result.searchEngine}
                </span>
              </>
            ) : (
              'Searching products...'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              syncUrl({ q: q.trim() || undefined, page: undefined });
            }}
            className="relative w-full sm:w-72"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter keywords..."
              className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-gray-900 focus:outline-none"
            />
          </form>

          <select
            value={sort}
            onChange={(e) => syncUrl({ sort: e.target.value === 'relevance' ? undefined : e.target.value, page: undefined })}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-gray-900 focus:outline-none"
          >
            <option value="relevance">Sort: Relevance</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating_desc">Highest Rated</option>
            <option value="newest">Newest Arrivals</option>
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Facet Sidebar */}
        <aside className="space-y-6 lg:col-span-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <SlidersHorizontal className="h-4 w-4" /> Facet Filters
              </span>
              <button
                type="button"
                onClick={() => router.push('/products')}
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                Reset
              </button>
            </div>

            {/* Categories */}
            {result && result.facets.categories.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Categories
                </h3>
                <div className="mt-2.5 space-y-2">
                  {result.facets.categories.map((cat) => {
                    const checked = selectedCategories.includes(cat.key);
                    return (
                      <label
                        key={cat.key}
                        className="flex cursor-pointer items-center justify-between text-sm text-stone-700"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = toggleItem(selectedCategories, cat.key);
                              syncUrl({
                                category: next.length ? next.join(',') : undefined,
                                page: undefined,
                              });
                            }}
                            className="rounded border-stone-300 text-gray-900 focus:ring-gray-900"
                          />
                          <span>{cat.label || cat.key}</span>
                        </span>
                        <span className="font-mono text-xs text-stone-400">{cat.count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Brands */}
            {result && result.facets.brands.length > 0 && (
              <div className="mt-6 border-t border-stone-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Brands
                </h3>
                <div className="mt-2.5 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {result.facets.brands.map((brand) => {
                    const checked = selectedBrands.includes(brand.key);
                    return (
                      <label
                        key={brand.key}
                        className="flex cursor-pointer items-center justify-between text-sm text-stone-700"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = toggleItem(selectedBrands, brand.key);
                              syncUrl({
                                brand: next.length ? next.join(',') : undefined,
                                page: undefined,
                              });
                            }}
                            className="rounded border-stone-300 text-gray-900 focus:ring-gray-900"
                          />
                          <span>{brand.key}</span>
                        </span>
                        <span className="font-mono text-xs text-stone-400">{brand.count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price Range */}
            <div className="mt-6 border-t border-stone-100 pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Price (INR)
              </h3>
              {result && result.facets.maxPricePaise > 0 && (
                <p className="mt-1 text-[11px] text-stone-400">
                  Range: {formatInrFromPaise(result.facets.minPricePaise)} –{' '}
                  {formatInrFromPaise(result.facets.maxPricePaise)}
                </p>
              )}
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min ₹"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="Max ₹"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  syncUrl({
                    minPrice: minPrice || undefined,
                    maxPrice: maxPrice || undefined,
                    page: undefined,
                  })
                }
                className="mt-2 w-full rounded-lg bg-stone-900 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
              >
                Apply Price
              </button>
            </div>

            {/* Rating & Availability */}
            <div className="mt-6 border-t border-stone-100 pt-5 space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Minimum Rating
                </h3>
                <select
                  value={minRating}
                  onChange={(e) => syncUrl({ minRating: e.target.value || undefined, page: undefined })}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                >
                  <option value="">Any rating</option>
                  <option value="4.5">4.5★ &amp; above</option>
                  <option value="4">4.0★ &amp; above</option>
                  <option value="3">3.0★ &amp; above</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(e) =>
                    syncUrl({ inStock: e.target.checked ? 'true' : undefined, page: undefined })
                  }
                  className="rounded border-stone-300 text-gray-900"
                />
                In stock only
              </label>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="lg:col-span-9">
          {(selectedCategories.length > 0 || selectedBrands.length > 0 || searchParams.get('q')) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {searchParams.get('q') && (
                <button
                  type="button"
                  onClick={() => syncUrl({ q: undefined, page: undefined })}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white"
                >
                  Query: &ldquo;{searchParams.get('q')}&rdquo; <X className="h-3 w-3" />
                </button>
              )}
              {selectedCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const next = selectedCategories.filter((item) => item !== c);
                    syncUrl({ category: next.length ? next.join(',') : undefined, page: undefined });
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800"
                >
                  {c} <X className="h-3 w-3" />
                </button>
              ))}
              {selectedBrands.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    const next = selectedBrands.filter((item) => item !== b);
                    syncUrl({ brand: next.length ? next.join(',') : undefined, page: undefined });
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-gray-800"
                >
                  {b} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-80 animate-pulse rounded-2xl bg-stone-200" />
              ))}
            </div>
          ) : !result || result.items.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
              <Filter className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 text-base font-semibold text-gray-900">No matching products</p>
              <p className="mt-1 text-sm text-stone-500">
                Try clearing a brand or price filter, or search with a broader keyword.
              </p>
              <button
                type="button"
                onClick={() => router.push('/products')}
                className="mt-5 rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white"
              >
                Reset all filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {result.items.map((item) => (
                  <ProductCard key={item.id} product={item} />
                ))}
              </div>

              {result.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => syncUrl({ page: String(page - 1) })}
                    className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="px-3 text-sm text-stone-600">
                    Page {result.page} of {result.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= result.totalPages}
                    onClick={() => syncUrl({ page: String(page + 1) })}
                    className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="h-96 animate-pulse rounded-2xl bg-stone-200" />
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}

