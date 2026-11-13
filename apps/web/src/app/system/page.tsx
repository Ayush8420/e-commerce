'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Flame,
  Layers,
  Mail,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface SystemActivityItem {
  id: string;
  timestamp: string;
  service: 'PostgreSQL' | 'Kafka' | 'OpenSearch' | 'Email';
  step:
    | 'order_saved_postgres'
    | 'kafka_event_published'
    | 'kafka_consumer_received'
    | 'opensearch_doc_indexed'
    | 'email_notification_sent'
    | 'stress_test_attempt';
  title: string;
  details: Record<string, unknown>;
  durationMs?: number;
}

interface StressTestResult {
  productTitle: string;
  storeName: string;
  city: string;
  initialStock: number;
  totalAttempts: number;
  successfulPurchases: number;
  soldOutRejections: number;
  finalStock: number;
  oversold: boolean;
  durationMs: number;
  breakdown: Array<{ attempt: number; success: boolean; latencyMs: number; error?: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function SystemActivityPage() {
  const [events, setEvents] = useState<SystemActivityItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'fallback_polling'>('connecting');
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const [outboxStats, setOutboxStats] = useState<{ pending: number; relayActive: boolean } | null>(null);

  // Stress test state
  const [concurrency, setConcurrency] = useState(100);
  const [initialStock, setInitialStock] = useState(5);
  const [runningStress, setRunningStress] = useState(false);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(null);
  const [stressError, setStressError] = useState<string | null>(null);

  const feedEndRef = useRef<HTMLDivElement | null>(null);

  // Initial load via REST
  const fetchRecent = async () => {
    try {
      const data = await apiFetch<{
        status: string;
        timestamp: string;
        recent: SystemActivityItem[];
        outboxStats?: { pending: number; relayActive: boolean };
      }>('/system/activity', { skipAuthRefresh: true });

      if (data.recent && Array.isArray(data.recent)) {
        setEvents((prev) => {
          const map = new Map<string, SystemActivityItem>();
          // Combine existing with newly fetched
          for (const item of [...data.recent, ...prev]) {
            map.set(item.id, item);
          }
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );
        });
      }
      if (data.outboxStats) {
        setOutboxStats(data.outboxStats);
      }
    } catch {
      // ignore transient fetch errors
    }
  };

  useEffect(() => {
    void fetchRecent();
  }, []);

  // SSE connection with fallback polling
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      eventSource = new EventSource(`${API_BASE}/system/stream`);

      eventSource.onopen = () => {
        setConnectionStatus('connected');
      };

      eventSource.onmessage = (event) => {
        if (isPaused) return;
        try {
          const parsed = JSON.parse(event.data) as SystemActivityItem;
          if (parsed && parsed.id) {
            setEvents((prev) => {
              if (prev.some((e) => e.id === parsed.id)) return prev;
              return [parsed, ...prev.slice(0, 99)];
            });
          }
        } catch {
          // ignore parse error
        }
      };

      eventSource.onerror = () => {
        setConnectionStatus('fallback_polling');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Start polling fallback every 2 seconds
        if (!pollInterval) {
          pollInterval = setInterval(() => {
            if (!isPaused) void fetchRecent();
          }, 2000);
        }
      };
    } catch {
      setConnectionStatus('fallback_polling');
      pollInterval = setInterval(() => {
        if (!isPaused) void fetchRecent();
      }, 2000);
    }

    return () => {
      if (eventSource) eventSource.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isPaused]);

  // Run Stress Test
  const handleRunStressTest = async () => {
    setRunningStress(true);
    setStressError(null);
    try {
      const res = await apiFetch<StressTestResult>('/system/stress-test', {
        method: 'POST',
        body: JSON.stringify({ concurrency, initialStock }),
        skipAuthRefresh: true,
      });
      setStressResult(res);
      void fetchRecent();
    } catch (err) {
      setStressError(err instanceof Error ? err.message : 'Stress test failed');
    } finally {
      setRunningStress(false);
    }
  };

  const filteredEvents =
    selectedService === 'ALL'
      ? events
      : events.filter((e) => e.service.toUpperCase() === selectedService.toUpperCase());

  const getServiceBadge = (service: SystemActivityItem['service']) => {
    switch (service) {
      case 'PostgreSQL':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            <Database className="h-3 w-3" /> Aiven PostgreSQL
          </span>
        );
      case 'Kafka':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            <Cpu className="h-3 w-3" /> Aiven Kafka
          </span>
        );
      case 'OpenSearch':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <Search className="h-3 w-3" /> Aiven OpenSearch
          </span>
        );
      case 'Email':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
            <Mail className="h-3 w-3" /> Nodemailer
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-16">
      {/* Top Banner */}
      <div className="border-b border-stone-200 bg-white shadow-xs">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <Activity className="h-3.5 w-3.5 animate-pulse text-emerald-600" />
                  Live System Monitor
                </span>
                <span className="text-xs text-stone-500 font-mono">
                  {connectionStatus === 'connected' ? (
                    <span className="text-emerald-600">● SSE Realtime Stream Connected</span>
                  ) : connectionStatus === 'fallback_polling' ? (
                    <span className="text-amber-600">● Active Polling (2000ms)</span>
                  ) : (
                    <span className="text-stone-400">Connecting...</span>
                  )}
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                Aiven Infrastructure Observability
              </h1>
              <p className="mt-1 text-sm text-stone-600 max-w-3xl">
                End-to-end event tracing across <strong>Aiven PostgreSQL</strong> (atomic row locks),{' '}
                <strong>Aiven Apache Kafka</strong> (transactional outbox relay), and{' '}
                <strong>Aiven OpenSearch</strong> (typo-tolerant indexing).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void fetchRecent()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 shadow-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setIsPaused(!isPaused)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-xs ${
                  isPaused
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-stone-800 text-white hover:bg-stone-900'
                }`}
              >
                {isPaused ? <Play className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                {isPaused ? 'Resume Feed' : 'Pause Feed'}
              </button>
              <Link
                href="/products"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs"
              >
                Try Search &amp; Buy <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Architecture Status Cards */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: PostgreSQL */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-900">
                  <Database className="h-4 w-4 text-blue-600" /> Aiven PostgreSQL
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                  <ShieldCheck className="h-3 w-3" /> Atomic Lock
                </span>
              </div>
              <p className="mt-2 text-xl font-bold text-gray-900">Row-Level Safety</p>
              <p className="mt-1 text-xs text-stone-500">
                Single conditional <code className="bg-stone-100 px-1 py-0.5 rounded">UPDATE ... WHERE qty &gt;= $n</code> prevents overselling.
              </p>
            </div>

            {/* Card 2: Kafka */}
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                  <Cpu className="h-4 w-4 text-amber-600" /> Aiven Kafka
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  KRaft Mode
                </span>
              </div>
              <p className="mt-2 text-xl font-bold text-gray-900">Transactional Outbox</p>
              <p className="mt-1 text-xs text-stone-500">
                Relays events to 4 topics with idempotent <code className="bg-stone-100 px-1 py-0.5 rounded">ProcessedEvent</code> deduplication.
              </p>
            </div>

            {/* Card 3: OpenSearch */}
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-900">
                  <Search className="h-4 w-4 text-emerald-600" /> Aiven OpenSearch
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  AUTO Fuzzy
                </span>
              </div>
              <p className="mt-2 text-xl font-bold text-gray-900">Fuzzy Search &amp; City Facets</p>
              <p className="mt-1 text-xs text-stone-500">
                Handles typos like &ldquo;bluetoth&rdquo; and filters by 8 Indian cities in real-time.
              </p>
            </div>

            {/* Card 4: Outbox Stats */}
            <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-700">
                  <Server className="h-4 w-4 text-stone-600" /> Outbox Relay
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                  {outboxStats?.relayActive !== false ? 'RELAY ACTIVE' : 'STANDBY'}
                </span>
              </div>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {outboxStats ? `${outboxStats.pending} Pending` : 'Healthy'}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Guaranteed at-least-once delivery with zero phantom reads.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* LEFT COLUMN: Live Pipeline Activity (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-600" />
                  Live Event Pipeline Stream
                </h2>
                <p className="text-xs text-stone-500">
                  Real-time events as orders are placed, Kafka events are consumed, and search documents are synced.
                </p>
              </div>

              {/* Service filter pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'PostgreSQL', 'Kafka', 'OpenSearch', 'Email'] as const).map((svc) => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => setSelectedService(svc)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      selectedService === svc
                        ? 'bg-gray-900 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
            </div>

            {/* Events Stream Feed */}
            <div className="space-y-3">
              {filteredEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
                  <Activity className="mx-auto h-8 w-8 text-stone-400 animate-pulse" />
                  <p className="mt-2 text-sm font-semibold text-gray-900">Listening for live pipeline events...</p>
                  <p className="mt-1 text-xs text-stone-500">
                    Place an order or trigger the concurrency stress test on the right to see the stream light up.
                  </p>
                </div>
              ) : (
                filteredEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="group rounded-xl border border-stone-200 bg-white p-4 shadow-2xs hover:border-stone-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {getServiceBadge(ev.service)}
                        <span className="font-mono text-[11px] text-stone-400">
                          {new Date(ev.timestamp).toLocaleTimeString('en-IN', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                          .{String(new Date(ev.timestamp).getMilliseconds()).padStart(3, '0')}
                        </span>
                      </div>
                      {ev.durationMs !== undefined && (
                        <span className="font-mono text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                          {ev.durationMs}ms
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 text-sm font-bold text-gray-900">{ev.title}</h3>

                    {/* Metadata chips */}
                    {ev.details && Object.keys(ev.details).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(ev.details).map(([k, v]) => {
                          if (v === undefined || v === null) return null;
                          const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
                          return (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-700"
                            >
                              <span className="text-stone-400">{k}:</span>
                              <span className="font-medium text-gray-900 max-w-[200px] truncate">{strVal}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={feedEndRef} />
            </div>
          </div>

          {/* RIGHT COLUMN: Oversell Concurrency Stress Test (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/40 via-white to-white p-6 shadow-md">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Flame className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Oversell Concurrency Proof</h2>
                  <p className="text-xs text-stone-500">Atomic Postgres conditional locking demonstration</p>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-stone-600">
                This stress test fires <strong>{concurrency} simultaneous checkout transactions</strong> at a product with only{' '}
                <strong>{initialStock} units in stock</strong>. Aiven PostgreSQL must guarantee that{' '}
                <em>exactly {initialStock}</em> succeed, <em>{concurrency - initialStock}</em> are rejected with out-of-stock, and final inventory is <strong>exactly 0</strong> (never negative).
              </p>

              {/* Stress Test Controls */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600">
                    Concurrent Buyers (N)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    disabled={runningStress}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600">
                    Initial Stock (Units)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value))}
                    disabled={runningStress}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Trigger Button */}
              <button
                type="button"
                onClick={handleRunStressTest}
                disabled={runningStress}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {runningStress ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Firing {concurrency} Concurrent Purchases...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Fire {concurrency} Concurrent Purchases
                  </>
                )}
              </button>

              {stressError && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800 border border-red-200">
                  <AlertOctagon className="h-4 w-4 shrink-0 text-red-600" />
                  {stressError}
                </div>
              )}

              {/* Stress Test Live Results */}
              {stressResult && (
                <div className="mt-6 border-t border-indigo-100 pt-5">
                  <div
                    className={`flex items-center gap-2.5 rounded-xl p-3 text-xs font-bold ${
                      stressResult.oversold
                        ? 'bg-red-100 text-red-800 border border-red-300'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    }`}
                  >
                    {stressResult.oversold ? (
                      <>
                        <ShieldAlert className="h-5 w-5 text-red-600" />
                        OVERSELL DETECTED: Stock went negative!
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5 text-emerald-600" />
                        ZERO OVERSELL: Aiven PostgreSQL Protected Inventory!
                      </>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Successful Purchases
                      </span>
                      <p className="mt-1 font-mono text-2xl font-black text-emerald-600">
                        {stressResult.successfulPurchases}
                      </p>
                      <span className="text-[10px] text-stone-400">Claimed available stock</span>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Sold-Out Rejections
                      </span>
                      <p className="mt-1 font-mono text-2xl font-black text-amber-600">
                        {stressResult.soldOutRejections}
                      </p>
                      <span className="text-[10px] text-stone-400">Rejected by conditional lock</span>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Final DB Stock
                      </span>
                      <p className="mt-1 font-mono text-2xl font-black text-gray-900">
                        {stressResult.finalStock}
                      </p>
                      <span className="text-[10px] text-stone-400">In PostgreSQL Inventory</span>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Execution Latency
                      </span>
                      <p className="mt-1 font-mono text-2xl font-black text-indigo-600">
                        {stressResult.durationMs}ms
                      </p>
                      <span className="text-[10px] text-stone-400">Total concurrent wall time</span>
                    </div>
                  </div>

                  {/* Summary Footer */}
                  <div className="mt-4 rounded-xl bg-stone-100 p-3 text-[11px] text-stone-600 space-y-1">
                    <p>
                      <strong>Product:</strong> {stressResult.productTitle}
                    </p>
                    <p>
                      <strong>Store &amp; City:</strong> {stressResult.storeName} ({stressResult.city})
                    </p>
                    <p className="font-mono text-[10px] text-stone-500 pt-1">
                      SQL: UPDATE &quot;Inventory&quot; SET quantity = quantity - 1 WHERE productId = $1 AND storeId = $2 AND quantity &gt;= 1;
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Demo Links */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-gray-900">Try Live Scenarios</h3>
              <p className="mt-1 text-xs text-stone-500">
                Click any of these shortcut links to test Aiven OpenSearch and physical-store inventory:
              </p>
              <div className="mt-3 space-y-2">
                <Link
                  href="/products?q=bluetoth"
                  className="flex items-center justify-between rounded-xl border border-stone-200 p-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300"
                >
                  <span>Fuzzy Typo Search: <code>&ldquo;bluetoth&rdquo;</code> &rarr; Bluetooth Earphones</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                </Link>
                <Link
                  href="/products?q=samsng"
                  className="flex items-center justify-between rounded-xl border border-stone-200 p-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300"
                >
                  <span>Fuzzy Typo Search: <code>&ldquo;samsng&rdquo;</code> &rarr; Samsung Galaxy</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                </Link>
                <Link
                  href="/products?city=Mumbai"
                  className="flex items-center justify-between rounded-xl border border-stone-200 p-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300"
                >
                  <span>City Availability Filter: Mumbai Stores</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                </Link>
                <Link
                  href="/products?city=Bengaluru"
                  className="flex items-center justify-between rounded-xl border border-stone-200 p-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300"
                >
                  <span>City Availability Filter: Bengaluru Stores</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
