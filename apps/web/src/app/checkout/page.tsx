'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatInrFromPaise, UPI_VPA_REGEX } from '@ecommerce/shared';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Lock,
  MapPin,
  QrCode,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
} from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch, OrderView, UpiPaymentPayload } from '@/lib/api';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authLoading, cart, reloadCart, notify, selectedCity } = useStore();

  const [fulfillmentType, setFulfillmentType] = useState<'HOME_DELIVERY' | 'STORE_PICKUP'>('HOME_DELIVERY');
  const [stores, setStores] = useState<Array<{ id: string; name: string; code: string; city: string; address: string }>>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('India');

  const [promoCode, setPromoCode] = useState(searchParams.get('promo') ?? '');
  const [discountPaise, setDiscountPaise] = useState(0);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<'UPI_QR' | 'UPI_VPA' | 'CARD_TEST'>('UPI_QR');
  const [upiVpa, setUpiVpa] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderView | null>(null);
  const [upiPayment, setUpiPayment] = useState<UpiPaymentPayload | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [countdownSec, setCountdownSec] = useState(300);

  useEffect(() => {
    if (user && !fullName) {
      setFullName(user.name);
    }
  }, [user, fullName]);

  useEffect(() => {
    apiFetch<Array<{ id: string; name: string; code: string; city: string; address: string }>>(
      '/stores',
      { skipAuthRefresh: true },
    )
      .then((data) => {
        if (Array.isArray(data)) {
          setStores(data);
          const inCity = data.find((s) => s.city.toLowerCase() === selectedCity.toLowerCase());
          if (inCity) {
            setSelectedStoreId(inCity.id);
          } else if (data.length > 0) {
            setSelectedStoreId(data[0].id);
          }
        }
      })
      .catch(() => undefined);
  }, [selectedCity]);

  useEffect(() => {
    if (!upiPayment) return;
    const timer = setInterval(() => {
      setCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [upiPayment]);

  const isStorePickup = fulfillmentType === 'STORE_PICKUP';
  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const afterDiscount = Math.max(0, cart.subtotalPaise - discountPaise);
  const shippingPaise =
    cart.items.length === 0 || isStorePickup
      ? 0
      : afterDiscount >= 99900
        ? 0
        : 7900;
  const totalPaise = afterDiscount + shippingPaise;

  const fillDemoAddress = () => {
    setFullName(user?.name || 'Priya Nair');
    setPhone('9876543210');
    setLine1('42 Indiranagar 100 Feet Rd');
    setLine2('Near Metro Station');
    setCity('Bengaluru');
    setState('Karnataka');
    setPostalCode('560038');
    setCountry('India');
  };

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    try {
      const res = await apiFetch<{ code: string; discountPaise: number }>('/promos/validate', {
        method: 'POST',
        body: JSON.stringify({ code: promoCode.trim(), subtotalPaise: cart.subtotalPaise }),
      });
      setDiscountPaise(res.discountPaise);
      setAppliedPromo(res.code);
      notify(`Promo ${res.code} applied (-${formatInrFromPaise(res.discountPaise)})`, 'success');
    } catch (err) {
      setDiscountPaise(0);
      setAppliedPromo(null);
      notify(err instanceof Error ? err.message : 'Invalid promo code', 'error');
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'UPI_VPA' && !UPI_VPA_REGEX.test(upiVpa.trim())) {
      notify('Enter a valid UPI ID such as name@okicici or user@ybl', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: OrderView; payment: UpiPaymentPayload }>(
        '/orders/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            fulfillmentType,
            storeId: isStorePickup ? selectedStoreId : undefined,
            city: isStorePickup ? (selectedStore?.city || selectedCity) : city,
            shippingAddress: {
              fullName,
              phone,
              line1: isStorePickup ? (selectedStore?.address || 'Store Pickup Desk') : line1,
              line2: isStorePickup ? `${selectedStore?.name} (Click & Collect)` : (line2 || undefined),
              city: isStorePickup ? (selectedStore?.city || selectedCity) : city,
              state: isStorePickup ? 'Physical Store' : state,
              postalCode: isStorePickup ? '000000' : postalCode,
              country: 'India',
              fulfillmentType,
              pickupStoreId: isStorePickup ? selectedStore?.id : undefined,
              pickupStoreName: isStorePickup ? selectedStore?.name : undefined,
            },
            paymentMethod,
            upiVpa: paymentMethod === 'UPI_VPA' ? upiVpa.trim() : undefined,
            promoCode: appliedPromo || promoCode.trim() || undefined,
          }),
        },
      );
      setActiveOrder(res.order);
      setUpiPayment(res.payment);
      setCountdownSec(300);
      await reloadCart();
      notify(`Order ${res.order.orderNumber} created. Complete UPI payment below.`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyUpi = async (customUtr?: string) => {
    if (!activeOrder) return;
    setVerifying(true);
    try {
      await apiFetch('/payments/upi/verify', {
        method: 'POST',
        body: JSON.stringify({
          orderId: activeOrder.id,
          utrNumber: customUtr || utrInput.trim() || undefined,
        }),
      });
      notify('UPI payment verified! Order confirmation email sent via Kafka.', 'success');
      router.push(`/orders/${activeOrder.id}?confirmed=1`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Verification failed', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleFailUpi = async () => {
    if (!activeOrder) return;
    setVerifying(true);
    try {
      await apiFetch('/payments/upi/fail', {
        method: 'POST',
        body: JSON.stringify({
          orderId: activeOrder.id,
          reason: 'UPI collect declined or cancelled by user',
        }),
      });
      notify('Payment marked as failed. Stock restored.', 'error');
      router.push(`/orders/${activeOrder.id}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update payment status', 'error');
    } finally {
      setVerifying(false);
    }
  };

  if (authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="h-96 animate-pulse rounded-2xl bg-stone-200" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <Lock className="mx-auto h-10 w-10 text-stone-400" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Sign in to complete checkout</h1>
        <p className="mt-2 text-sm text-stone-600">
          Your bag items are safely saved and will automatically merge once you sign in with email or Google.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/login?next=/checkout"
            className="rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white"
          >
            Sign In / Google OAuth
          </Link>
          <Link
            href="/register?next=/checkout"
            className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900"
          >
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  if (activeOrder && upiPayment) {
    const mins = String(Math.floor(countdownSec / 60)).padStart(2, '0');
    const secs = String(countdownSec % 60).padStart(2, '0');

    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl">
          <div className="bg-gray-900 px-6 py-5 text-white flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
                NPCI UPI Instant Checkout
              </p>
              <h1 className="mt-1 text-xl font-bold">
                Pay {formatInrFromPaise(activeOrder.totalPaise)} for {activeOrder.orderNumber}
              </h1>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-1.5 font-mono text-sm">
              {mins}:{secs}
            </div>
          </div>

          <div className="grid gap-8 p-6 sm:grid-cols-2 sm:p-8">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center">
              <img
                src={upiPayment.qrDataUrl}
                alt="UPI QR Code"
                className="h-56 w-56 rounded-xl border border-stone-200 bg-white p-2 shadow-xs"
              />
              <p className="mt-3 text-xs font-medium text-stone-600">
                Scan with PhonePe, Google Pay, Paytm, or BHIM
              </p>
              <p className="mt-1 font-mono text-xs text-stone-500">
                Merchant VPA: <strong>{upiPayment.merchantVpa}</strong>
              </p>
              <a
                href={upiPayment.upiUri}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-stone-100"
              >
                Open UPI App <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="flex flex-col justify-between space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Confirm UPI Transaction</h2>
                <p className="mt-1 text-xs text-stone-600">
                  Transaction Ref: <code className="font-mono">{upiPayment.transactionRef}</code>
                  {upiPayment.customerVpa && (
                    <>
                      <br />
                      Collect sent to: <code className="font-mono">{upiPayment.customerVpa}</code>
                    </>
                  )}
                </p>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-stone-700">
                    12-Digit UPI UTR / Reference Number (optional in simulation)
                  </label>
                  <input
                    type="text"
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value)}
                    placeholder="e.g. 431829104455"
                    className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => void handleVerifyUpi()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {verifying ? 'Verifying...' : 'Confirm / Simulate UPI Success'}
                </button>

                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => void handleFailUpi()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <AlertCircle className="h-4 w-4" />
                  Simulate Payment Failure (Restores Stock)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Your bag is empty</h1>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Checkout</h1>

      <form onSubmit={handleCheckout} className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          {/* 1. Fulfillment Method (Omnichannel) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">1. Fulfillment Method</h2>
            <p className="mt-1 text-xs text-stone-500">
              Choose express delivery to your home or free 2-hour Click &amp; Collect pickup at our physical retail stores.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label
                className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all ${
                  fulfillmentType === 'HOME_DELIVERY'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-indigo-600" />
                    <span className="font-semibold text-sm text-gray-900">Express Delivery</span>
                  </div>
                  <input
                    type="radio"
                    name="fulfillmentType"
                    checked={fulfillmentType === 'HOME_DELIVERY'}
                    onChange={() => setFulfillmentType('HOME_DELIVERY')}
                    className="h-4 w-4 text-indigo-600"
                  />
                </div>
                <p className="mt-2 text-xs text-stone-600">
                  Delivered to your doorstep anywhere in India. Free for orders over ₹999.
                </p>
                <span className="mt-2 inline-flex items-center text-[11px] font-semibold text-indigo-700">
                  ⚡ Dispatches in 24 hours
                </span>
              </label>

              <label
                className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all ${
                  fulfillmentType === 'STORE_PICKUP'
                    ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-emerald-600" />
                    <span className="font-semibold text-sm text-gray-900">Click &amp; Collect</span>
                  </div>
                  <input
                    type="radio"
                    name="fulfillmentType"
                    checked={fulfillmentType === 'STORE_PICKUP'}
                    onChange={() => setFulfillmentType('STORE_PICKUP')}
                    className="h-4 w-4 text-emerald-600"
                  />
                </div>
                <p className="mt-2 text-xs text-stone-600">
                  Collect from our physical store counter. Never wait for a courier.
                </p>
                <span className="mt-2 inline-flex items-center font-semibold text-[11px] text-emerald-700">
                  🏬 Ready in 2 Hours • 100% Free
                </span>
              </label>
            </div>

            {/* Store branch selector if Click & Collect */}
            {isStorePickup && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-700" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                      Select Store Branch for Pickup
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-800">
                    City: {selectedCity || 'All Branches'}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {stores
                    .filter(
                      (s) =>
                        !selectedCity ||
                        s.city.toLowerCase() === selectedCity.toLowerCase() ||
                        stores.filter((x) => x.city.toLowerCase() === selectedCity.toLowerCase()).length === 0,
                    )
                    .map((s) => (
                      <label
                        key={s.id}
                        className={`flex cursor-pointer items-start justify-between rounded-lg border p-3 text-xs transition-colors ${
                          selectedStoreId === s.id
                            ? 'border-emerald-600 bg-white font-medium text-gray-900 shadow-sm'
                            : 'border-emerald-200/80 bg-white/80 text-stone-600 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="radio"
                            name="pickupStore"
                            value={s.id}
                            checked={selectedStoreId === s.id}
                            onChange={() => setSelectedStoreId(s.id)}
                            className="mt-0.5 text-emerald-600"
                          />
                          <div>
                            <div className="font-semibold text-gray-900">
                              {s.name} <span className="font-normal text-stone-500">({s.code})</span>
                            </div>
                            <div className="text-stone-500 mt-0.5">{s.address}</div>
                            <div className="mt-1 text-[11px] text-emerald-700">
                              🕒 10:00 AM – 9:30 PM • 2-Hour Express Pickup Counter
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {s.city}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. Contact & Address Details */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {isStorePickup ? '2. Pickup Contact Information' : '2. Delivery Address'}
              </h2>
              {!isStorePickup && (
                <button
                  type="button"
                  onClick={fillDemoAddress}
                  className="text-xs font-semibold text-indigo-700 hover:underline"
                >
                  Fill Demo Address
                </button>
              )}
            </div>

            {isStorePickup ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-800">
                  Your Digital Pickup Pass and OTP will be issued to this name and phone number upon payment.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-stone-600">Full Name</label>
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Priya Nair"
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600">Phone Number (for SMS &amp; Pass OTP)</label>
                    <input
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {selectedStore && (
                  <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
                    <span className="font-semibold text-stone-800">Pickup Counter: </span>
                    {selectedStore.name}, {selectedStore.address}, {selectedStore.city}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-600">Full Name</label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600">Phone Number</label>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-600">Address Line 1</label>
                  <input
                    required
                    value={line1}
                    onChange={(e) => setLine1(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-600">
                    Landmark / Apartment (optional)
                  </label>
                  <input
                    value={line2}
                    onChange={(e) => setLine2(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600">City</label>
                  <input
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600">State</label>
                  <input
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600">PIN Code</label>
                  <input
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600">Country</label>
                  <input
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Payment Method (UPI Primary) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">3. Payment Method (UPI Instant)</h2>
            <div className="mt-4 space-y-3">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                  paymentMethod === 'UPI_QR'
                    ? 'border-gray-900 bg-stone-50'
                    : 'border-stone-200'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === 'UPI_QR'}
                  onChange={() => setPaymentMethod('UPI_QR')}
                  className="mt-1"
                />
                <QrCode className="mt-0.5 h-5 w-5 text-emerald-700 shrink-0" />
                <div>
                  <span className="block text-sm font-semibold text-gray-900">
                    Scan &amp; Pay via UPI QR Code (Recommended)
                  </span>
                  <span className="text-xs text-stone-500">
                    Works with Google Pay, PhonePe, Paytm, Amazon Pay, and BHIM UPI.
                  </span>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                  paymentMethod === 'UPI_VPA'
                    ? 'border-gray-900 bg-stone-50'
                    : 'border-stone-200'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === 'UPI_VPA'}
                  onChange={() => setPaymentMethod('UPI_VPA')}
                  className="mt-1"
                />
                <Smartphone className="mt-0.5 h-5 w-5 text-indigo-700 shrink-0" />
                <div className="flex-1">
                  <span className="block text-sm font-semibold text-gray-900">
                    Pay via UPI ID / VPA Collect
                  </span>
                  <span className="text-xs text-stone-500">
                    Enter your UPI handle to trigger an instant collect request.
                  </span>
                  {paymentMethod === 'UPI_VPA' && (
                    <input
                      required
                      type="text"
                      value={upiVpa}
                      onChange={(e) => setUpiVpa(e.target.value)}
                      placeholder="e.g. priya.nair@okicici"
                      className="mt-3 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
                    />
                  )}
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                  paymentMethod === 'CARD_TEST'
                    ? 'border-gray-900 bg-stone-50'
                    : 'border-stone-200'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === 'CARD_TEST'}
                  onChange={() => setPaymentMethod('CARD_TEST')}
                  className="mt-1"
                />
                <CreditCard className="mt-0.5 h-5 w-5 text-stone-600 shrink-0" />
                <div>
                  <span className="block text-sm font-semibold text-gray-900">
                    Test Card / Gateway Fallback
                  </span>
                  <span className="text-xs text-stone-500">
                    Simulated gateway fallback when testing non-UPI checkout paths.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:col-span-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Order Review</h2>
            <div className="mt-4 divide-y divide-stone-100">
              {cart.items.map((item) => (
                <div key={item.productId} className="flex justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{item.product.title}</p>
                    <p className="text-xs text-stone-500">Qty: {item.quantity}</p>
                  </div>
                  <span className="font-mono font-semibold text-gray-900">
                    {formatInrFromPaise(item.product.pricePaise * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Promo code (e.g. UPIFIRST)"
                className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm uppercase"
              />
              <button
                type="button"
                onClick={() => void applyPromo()}
                className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Apply
              </button>
            </div>

            <dl className="mt-6 space-y-2.5 border-t border-stone-200 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-600">Subtotal</dt>
                <dd className="font-mono font-semibold">{formatInrFromPaise(cart.subtotalPaise)}</dd>
              </div>
              {discountPaise > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount ({appliedPromo})</dt>
                  <dd className="font-mono font-semibold">-{formatInrFromPaise(discountPaise)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-stone-600">Shipping</dt>
                <dd className="font-mono font-semibold">
                  {shippingPaise === 0 ? 'FREE' : formatInrFromPaise(shippingPaise)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-3 text-lg font-bold text-gray-900">
                <dt>Payable via UPI</dt>
                <dd className="font-mono">{formatInrFromPaise(totalPaise)}</dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {submitting ? 'Generating UPI Payment...' : `Place Order & Pay ${formatInrFromPaise(totalPaise)}`}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-12"><div className="h-80 animate-pulse rounded-2xl bg-stone-200" /></div>}>
      <CheckoutContent />
    </Suspense>
  );
}

