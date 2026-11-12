'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatInrFromPaise } from '@ecommerce/shared';
import {
  Activity,
  Database,
  Mail,
  Package,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch, CategorySummary, OrderView } from '@/lib/api';

interface AdminOverview {
  metrics: {
    gmvPaise: number;
    paidOrdersCount: number;
    productCount: number;
    userCount: number;
    ordersByStatus: Record<string, number>;
  };
  lowStockProducts: Array<{ id: string; title: string; sku: string; stock: number }>;
  notificationLogs: Array<{
    id: string;
    type: string;
    recipient: string;
    subject: string;
    status: string;
    error: string | null;
    createdAt: string;
  }>;
  outbox: {
    pending: number;
    published: number;
    failed: number;
    recent: Array<{
      id: string;
      topic: string;
      eventType: string;
      status: string;
      attempts: number;
      createdAt: string;
    }>;
  };
  analytics: {
    countsByType: Record<string, number>;
    topSearches: Array<{ query: string; count: number }>;
    topViewedProducts: Array<{
      productId: string;
      views: number;
      product: { title: string; slug: string } | null;
    }>;
  };
}

interface AdminProductRow {
  id: string;
  title: string;
  slug: string;
  brand: string;
  sku: string;
  pricePaise: number;
  stock: number;
  isActive: boolean;
  category: { id: string; name: string };
}

interface PromoRow {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minOrderPaise: number;
  usedCount: number;
  isActive: boolean;
}

interface HealthResponse {
  status: string;
  services: Record<string, 'up' | 'down'>;
}

export default function AdminDashboardPage() {
  const { user, authLoading, notify } = useStore();
  const [tab, setTab] = useState<'overview' | 'products' | 'orders' | 'promos'>('overview');

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Create Product Form
  const [pTitle, setPTitle] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pCategoryId, setPCategoryId] = useState('');
  const [pPriceRupees, setPPriceRupees] = useState('1999');
  const [pSku, setPSku] = useState('');
  const [pStock, setPStock] = useState('25');
  const [pImage, setPImage] = useState(
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
  );
  const [pDesc, setPDesc] = useState('');

  // Create Promo Form
  const [promoCode, setPromoCode] = useState('');
  const [promoType, setPromoType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [promoValue, setPromoValue] = useState('15');
  const [promoMinRupees, setPromoMinRupees] = useState('999');

  const loadAll = useCallback(async () => {
    try {
      const [h, ov, prods, cats, ords, prms] = await Promise.all([
        apiFetch<HealthResponse>('/health', { skipAuthRefresh: true }),
        apiFetch<AdminOverview>('/admin/overview'),
        apiFetch<AdminProductRow[]>('/admin/products'),
        apiFetch<CategorySummary[]>('/categories', { skipAuthRefresh: true }),
        apiFetch<OrderView[]>('/admin/orders'),
        apiFetch<PromoRow[]>('/admin/promos'),
      ]);
      setHealth(h);
      setOverview(ov);
      setProducts(prods);
      setCategories(cats);
      if (cats.length > 0 && !pCategoryId) {
        setPCategoryId(cats[0].id);
      }
      setOrders(ords);
      setPromos(prms);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed loading admin data', 'error');
    }
  }, [notify, pCategoryId]);

  useEffect(() => {
    if (!authLoading && user?.role === 'ADMIN') {
      void loadAll();
    }
  }, [authLoading, loadAll, user]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="h-96 animate-pulse rounded-2xl bg-stone-200" />
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Admin access required</h1>
        <p className="mt-2 text-sm text-stone-600">
          Sign in with an administrator account (e.g. seeded{' '}
          <code className="font-mono">admin@aethermart.local</code>) to manage products, orders,
          OpenSearch sync, and Kafka queues.
        </p>
        <Link
          href="/login?next=/admin"
          className="mt-6 inline-block rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white"
        >
          Sign In as Admin
        </Link>
      </div>
    );
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          title: pTitle,
          brand: pBrand,
          categoryId: pCategoryId,
          pricePaise: Math.round(Number(pPriceRupees) * 100),
          sku: pSku,
          stock: Number(pStock),
          images: pImage ? [pImage] : [],
          description: pDesc,
        }),
      });
      notify('Product created and queued for OpenSearch via Kafka!', 'success');
      setPTitle('');
      setPSku('');
      setPDesc('');
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed creating product', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await apiFetch(`/admin/products/${id}`, { method: 'DELETE' });
      notify('Product archived and removed from OpenSearch via Kafka.', 'info');
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleReindex = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ indexed: number }>('/admin/search/reindex', { method: 'POST' });
      notify(`Reindexed ${res.indexed} products into OpenSearch!`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Reindex failed (is OpenSearch running?)', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleFlushOutbox = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ published: number }>('/admin/outbox/flush', { method: 'POST' });
      notify(`Flushed ${res.published} outbox events to Kafka.`, 'success');
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleOrderStatus = async (orderId: string, status: string) => {
    try {
      await apiFetch(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(`Order updated to ${status}. Notification queued via Kafka.`, 'success');
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Status update failed', 'error');
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const discountValue =
        promoType === 'FIXED' ? Math.round(Number(promoValue) * 100) : Number(promoValue);
      await apiFetch('/admin/promos', {
        method: 'POST',
        body: JSON.stringify({
          code: promoCode,
          discountType: promoType,
          discountValue,
          minOrderPaise: Math.round(Number(promoMinRupees) * 100),
          isActive: true,
        }),
      });
      notify('Promo code created!', 'success');
      setPromoCode('');
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed creating promo', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Admin Console</h1>
          <p className="mt-1 text-sm text-stone-600">
            Manage catalog, UPI orders, OpenSearch sync, and Kafka event pipelines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {health &&
            Object.entries(health.services).map(([svc, state]) => (
              <span
                key={svc}
                className={`rounded-full border px-3 py-1 font-mono text-xs font-medium ${
                  state === 'up'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {svc}: {state}
              </span>
            ))}
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-stone-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {[
          { id: 'overview', label: 'Overview & Kafka', icon: Activity },
          { id: 'products', label: 'Products & OpenSearch', icon: Database },
          { id: 'orders', label: 'Orders', icon: Package },
          { id: 'promos', label: 'Promo Codes', icon: Tag },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                active
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && overview && (
        <div className="mt-8 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium uppercase text-stone-500">Paid GMV</p>
              <p className="mt-2 font-mono text-2xl font-bold text-gray-900">
                {formatInrFromPaise(overview.metrics.gmvPaise)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium uppercase text-stone-500">Paid Orders</p>
              <p className="mt-2 font-mono text-2xl font-bold text-gray-900">
                {overview.metrics.paidOrdersCount}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium uppercase text-stone-500">Active Products</p>
              <p className="mt-2 font-mono text-2xl font-bold text-gray-900">
                {overview.metrics.productCount}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium uppercase text-stone-500">Registered Users</p>
              <p className="mt-2 font-mono text-2xl font-bold text-gray-900">
                {overview.metrics.userCount}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Outbox Status */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">Transactional Outbox (Kafka)</h2>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleFlushOutbox()}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Flush Now
                </button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="font-mono text-lg font-bold text-amber-800">
                    {overview.outbox.pending}
                  </p>
                  <p className="text-xs text-amber-700">Pending</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="font-mono text-lg font-bold text-emerald-800">
                    {overview.outbox.published}
                  </p>
                  <p className="text-xs text-emerald-700">Published</p>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="font-mono text-lg font-bold text-red-800">
                    {overview.outbox.failed}
                  </p>
                  <p className="text-xs text-red-700">Failed</p>
                </div>
              </div>
              <div className="mt-4 max-h-56 overflow-y-auto divide-y divide-stone-100 text-xs">
                {overview.outbox.recent.map((evt) => (
                  <div key={evt.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-mono font-semibold text-gray-900">{evt.topic}</span>
                      <span className="ml-2 text-stone-500">{evt.eventType}</span>
                    </div>
                    <span className="font-mono text-stone-600">{evt.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notification Logs */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-700" />
                <h2 className="text-base font-bold text-gray-900">Email Notification Logs</h2>
              </div>
              <div className="mt-4 max-h-72 overflow-y-auto divide-y divide-stone-100 text-xs">
                {overview.notificationLogs.length === 0 ? (
                  <p className="text-stone-500">No emails processed yet.</p>
                ) : (
                  overview.notificationLogs.map((log) => (
                    <div key={log.id} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">{log.subject}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            log.status === 'SENT'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <p className="text-stone-500">
                        To: {log.recipient} &bull; {log.type}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Analytics */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-900" />
                <h2 className="text-base font-bold text-gray-900">Top OpenSearch Queries</h2>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {overview.analytics.topSearches.length === 0 ? (
                  <p className="text-xs text-stone-500">No search events tracked yet.</p>
                ) : (
                  overview.analytics.topSearches.map((item) => (
                    <div key={item.query} className="flex justify-between">
                      <span className="text-stone-700">{item.query}</span>
                      <span className="font-mono font-semibold">{item.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="text-base font-bold text-gray-900">Low Stock Alerts (&le; 10 units)</h2>
              <div className="mt-4 space-y-2 text-sm">
                {overview.lowStockProducts.length === 0 ? (
                  <p className="text-xs text-stone-500">All products have healthy inventory.</p>
                ) : (
                  overview.lowStockProducts.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="text-stone-700">{item.title}</span>
                      <span className="font-mono font-semibold text-amber-700">
                        {item.stock} left
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products Tab */}
      {tab === 'products' && (
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 lg:col-span-4">
            <h2 className="text-base font-bold text-gray-900">Add New Product</h2>
            <form onSubmit={handleCreateProduct} className="mt-4 space-y-3">
              <input
                required
                value={pTitle}
                onChange={(e) => setPTitle(e.target.value)}
                placeholder="Product title"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  value={pBrand}
                  onChange={(e) => setPBrand(e.target.value)}
                  placeholder="Brand"
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  value={pSku}
                  onChange={(e) => setPSku(e.target.value)}
                  placeholder="SKU (e.g. AUD-01)"
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm uppercase"
                />
              </div>
              <select
                value={pCategoryId}
                onChange={(e) => setPCategoryId(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  type="number"
                  value={pPriceRupees}
                  onChange={(e) => setPPriceRupees(e.target.value)}
                  placeholder="Price (₹)"
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  type="number"
                  value={pStock}
                  onChange={(e) => setPStock(e.target.value)}
                  placeholder="Stock"
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <input
                value={pImage}
                onChange={(e) => setPImage(e.target.value)}
                placeholder="Image URL"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <textarea
                required
                minLength={10}
                rows={3}
                value={pDesc}
                onChange={(e) => setPDesc(e.target.value)}
                placeholder="Product description..."
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" /> Create Product
              </button>
            </form>
          </div>

          <div className="lg:col-span-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                Catalog ({products.length})
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleReindex()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reindex OpenSearch
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                      <td className="px-4 py-3 font-mono text-xs text-stone-500">{p.sku}</td>
                      <td className="px-4 py-3 font-mono">{formatInrFromPaise(p.pricePaise)}</td>
                      <td className="px-4 py-3 font-mono">{p.stock}</td>
                      <td className="px-4 py-3 text-xs">
                        {p.isActive ? 'Active' : 'Archived'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.isActive && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteProduct(p.id)}
                            className="text-stone-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Orders Tab */}
      {tab === 'orders' && (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payment / UTR</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {orders.map((ord) => (
                <tr key={ord.id}>
                  <td className="px-4 py-3 font-mono text-xs font-bold">
                    <Link href={`/orders/${ord.id}`} className="hover:underline">
                      {ord.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-medium text-gray-900">{ord.user?.name}</div>
                    <div className="text-stone-500">{ord.user?.email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">
                    {formatInrFromPaise(ord.totalPaise)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {ord.paymentStatus}
                    {ord.payments[0]?.utrNumber ? ` (${ord.payments[0].utrNumber})` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={ord.status}
                      onChange={(e) => void handleOrderStatus(ord.id, e.target.value)}
                      className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-semibold"
                    >
                      <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
                      <option value="CONFIRMED">CONFIRMED</option>
                      <option value="PROCESSING">PROCESSING</option>
                      <option value="SHIPPED">SHIPPED</option>
                      <option value="DELIVERED">DELIVERED</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Promos Tab */}
      {tab === 'promos' && (
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <form
            onSubmit={handleCreatePromo}
            className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6 lg:col-span-4"
          >
            <h2 className="text-base font-bold text-gray-900">Create Promo Code</h2>
            <input
              required
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="CODE (e.g. DIWALI20)"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm uppercase"
            />
            <select
              value={promoType}
              onChange={(e) => setPromoType(e.target.value as 'PERCENTAGE' | 'FIXED')}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="PERCENTAGE">Percentage (%)</option>
              <option value="FIXED">Fixed Amount (₹)</option>
            </select>
            <input
              required
              type="number"
              value={promoValue}
              onChange={(e) => setPromoValue(e.target.value)}
              placeholder="Discount value"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              value={promoMinRupees}
              onChange={(e) => setPromoMinRupees(e.target.value)}
              placeholder="Min order (₹)"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white"
            >
              Create Promo
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white lg:col-span-8">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Min Order</th>
                  <th className="px-4 py-3">Used</th>
                  <th className="px-4 py-3">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {promos.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-mono font-bold">{p.code}</td>
                    <td className="px-4 py-3 font-mono">
                      {p.discountType === 'PERCENTAGE'
                        ? `${p.discountValue}%`
                        : formatInrFromPaise(p.discountValue)}
                    </td>
                    <td className="px-4 py-3 font-mono">{formatInrFromPaise(p.minOrderPaise)}</td>
                    <td className="px-4 py-3 font-mono">{p.usedCount}</td>
                    <td className="px-4 py-3 text-xs">{p.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

