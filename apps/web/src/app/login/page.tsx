'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch, getGoogleLoginUrl } from '@/lib/api';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/';
  const oauthError = searchParams.get('error');

  const { login, notify } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(true);
  const [dbOffline, setDbOffline] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ google: boolean }>('/auth/providers', { skipAuthRefresh: true })
      .then((res) => setGoogleEnabled(res.google))
      .catch(() => undefined);
    apiFetch<{ services?: { postgres?: string } }>('/health', { skipAuthRefresh: true })
      .then((res) => setDbOffline(res.services?.postgres === 'down'))
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await login(email, password);
      router.push(nextPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setFormError(msg);
      notify(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Sign in to AetherMart</h1>
        <p className="mt-1 text-sm text-stone-500">
          Use your email &amp; password or continue with Google.
        </p>

        {dbOffline && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>PostgreSQL is offline:</strong> Start PostgreSQL / Docker Compose (
            <code className="font-mono">docker compose up -d</code>) and run{' '}
            <code className="font-mono">npm run db:push &amp;&amp; npm run db:seed</code> before signing in.
          </div>
        )}

        {formError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {formError}
          </div>
        )}

        {oauthError === 'google_not_configured' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Google OAuth is not configured yet. Add <code className="font-mono">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to <code className="font-mono">.env</code> to enable Google Sign-In.
          </div>
        )}

        <a
          href={getGoogleLoginUrl()}
          className={`mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-semibold text-gray-900 hover:bg-stone-50 ${
            !googleEnabled ? 'opacity-70' : ''
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          Continue with Google
        </a>

        <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
          <div className="h-px flex-1 bg-stone-200" />
          <span>or sign in with email</span>
          <div className="h-px flex-1 bg-stone-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-700">Email</label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-stone-300 py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-stone-700">Password</label>
              <Link href="/forgot-password" className="text-xs text-indigo-700 hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-300 py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
          <p className="font-semibold text-stone-800">Seeded Demo Accounts:</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEmail('customer@aethermart.local');
                setPassword('Customer@12345');
              }}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-medium hover:bg-stone-100"
            >
              Fill Customer
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail('admin@aethermart.local');
                setPassword('Admin@12345');
              }}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-medium hover:bg-stone-100"
            >
              Fill Admin
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-stone-600">
          New to AetherMart?{' '}
          <Link href="/register" className="font-semibold text-indigo-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-14"><div className="h-96 animate-pulse rounded-3xl bg-stone-200" /></div>}>
      <LoginContent />
    </Suspense>
  );
}

