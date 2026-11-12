'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuthRefresh: true,
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl border border-stone-200 bg-white p-8">
        <h1 className="text-2xl font-bold text-gray-900">Reset password</h1>
        {sent ? (
          <div className="mt-4 text-sm text-stone-600">
            If an account exists for <strong>{email}</strong>, a reset email has been queued via
            Kafka. Check Mailpit at <code className="font-mono">http://localhost:8025</code> in local dev.
            <div className="mt-6">
              <Link href="/login" className="font-semibold text-indigo-700 hover:underline">
                Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <p className="text-sm text-stone-500">
              Enter your account email and we&apos;ll send a reset link.
            </p>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white"
            >
              {busy ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

