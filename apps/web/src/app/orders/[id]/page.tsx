'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatInrFromPaise } from '@ecommerce/shared';
import { ArrowLeft, CheckCircle2, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch, OrderView, UpiPaymentPayload } from '@/lib/api';

const TIMELINE_STEPS = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { notify } = useStore();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<UpiPaymentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      const data = await apiFetch<{ order: OrderView; payment: UpiPaymentPayload | null }>(
        `/orders/${id}`,
      );
      setOrder(data.order);
      setPayment(data.payment);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const handleConfirmPendingUpi = async () => {
    if (!order) return;
    setActionBusy(true);
    try {
      await apiFetch('/payments/upi/verify', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id }),
      });
      notify('UPI Payment verified!', 'success');
      await loadOrder();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Verification failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRetryUpi = async () => {
    if (!order) return;
    setActionBusy(true);
    try {
      const res = await apiFetch<{ order: OrderView; payment: UpiPaymentPayload }>(
        `/orders/${order.id}/retry-upi`,
        {
          method: 'POST',
          body: JSON.stringify({ paymentMethod: 'UPI_QR' }),
        },
      );
      setOrder(res.order);
      setPayment(res.payment);
      notify('Fresh UPI QR code generated!', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Retry failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setActionBusy(true);
    try {
      await apiFetch(`/orders/${order.id}/cancel`, { method: 'POST' });
      notify('Order cancelled and stock restored.', 'info');
      await loadOrder();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Cancellation failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="h-80 animate-pulse rounded-2xl bg-stone-200" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Order not found</h1>
        <Link href="/orders" className="mt-4 inline-block text-sm font-semibold text-indigo-700">
          Back to orders
        </Link>
      </div>
    );
  }

  const activeIdx = TIMELINE_STEPS.indexOf(order.status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
          <p className="text-sm text-stone-500">
            Status: <strong className="text-gray-900">{order.status}</strong> &bull; Payment:{' '}
            <strong className="text-gray-900">{order.paymentStatus}</strong>
          </p>
        </div>

        <div className="flex gap-2">
          {order.status === 'FAILED' && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void handleRetryUpi()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry UPI Payment
            </button>
          )}
          {['PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING'].includes(order.status) && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void handleCancelOrder()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              <XCircle className="h-3.5 w-3.5" /> Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {activeIdx >= 0 && (
        <div className="mt-6 grid grid-cols-4 gap-3 rounded-2xl border border-stone-200 bg-white p-5">
          {TIMELINE_STEPS.map((step, idx) => (
            <div key={step} className="flex flex-col">
              <div
                className={`h-2 rounded-full ${
                  idx <= activeIdx ? 'bg-emerald-600' : 'bg-stone-200'
                }`}
              />
              <span
                className={`mt-2 text-xs font-semibold ${
                  idx <= activeIdx ? 'text-gray-900' : 'text-stone-400'
                }`}
              >
                {step}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pending UPI Payment Box */}
      {payment && order.status === 'PENDING_PAYMENT' && (
        <div className="mt-6 flex flex-col items-center gap-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:flex-row">
          <img
            src={payment.qrDataUrl}
            alt="UPI QR"
            className="h-40 w-40 rounded-xl border border-amber-200 bg-white p-1.5"
          />
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">Complete Pending UPI Payment</h2>
            <p className="mt-1 text-xs text-stone-700">
              Scan this QR code or open your UPI app to pay{' '}
              <strong>{formatInrFromPaise(order.totalPaise)}</strong>.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={payment.upiUri}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-gray-900"
              >
                Open UPI App <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleConfirmPendingUpi()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirm UPI Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items + Shipping */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 md:col-span-2">
          <h2 className="text-base font-semibold text-gray-900">Items</h2>
          <div className="mt-4 divide-y divide-stone-100">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {item.imageSnapshot && (
                    <img
                      src={item.imageSnapshot}
                      alt={item.titleSnapshot}
                      className="h-12 w-12 rounded-lg object-cover bg-stone-100"
                    />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.titleSnapshot}</p>
                    <p className="font-mono text-xs text-stone-500">
                      {item.skuSnapshot} &bull; Qty {item.quantity}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold text-gray-900">
                  {formatInrFromPaise(item.pricePaise * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-900">Shipping &amp; Payment</h2>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              <strong className="text-gray-900">{order.shippingAddress.fullName}</strong>
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
              {order.shippingAddress.postalCode}
              <br />
              Phone: {order.shippingAddress.phone}
            </p>
            {order.payments[0]?.utrNumber && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
                UTR Ref: <code className="font-mono font-semibold">{order.payments[0].utrNumber}</code>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">Subtotal</span>
              <span className="font-mono">{formatInrFromPaise(order.subtotalPaise)}</span>
            </div>
            {order.discountPaise > 0 && (
              <div className="mt-2 flex justify-between text-emerald-700">
                <span>Discount ({order.promoCode})</span>
                <span className="font-mono">-{formatInrFromPaise(order.discountPaise)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between">
              <span className="text-stone-500">Shipping</span>
              <span className="font-mono">
                {order.shippingPaise === 0 ? 'FREE' : formatInrFromPaise(order.shippingPaise)}
              </span>
            </div>
            <div className="mt-3 flex justify-between border-t border-stone-200 pt-3 font-bold text-gray-900">
              <span>Total</span>
              <span className="font-mono">{formatInrFromPaise(order.totalPaise)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

