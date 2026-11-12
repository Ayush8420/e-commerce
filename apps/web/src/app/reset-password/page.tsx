'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/components/providers/StoreProvider';
import { apiFetch } from '@/lib/api';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { notify } = useStore();
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
        skipAuthRefresh: true,
      });
      notify('Password updated! Please sign in.', 'success');
      router.push('/login');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Reset failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl border border-stone-200 bg-white p-8">
        <h1 className="text-2xl font-bold text-gray-900">Choose a new password</h1>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input
            required
            minLength={8}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 chars)"
            className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-16"><div className="h-60 animate-pulse rounded-3xl bg-stone-200" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

