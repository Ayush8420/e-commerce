'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Verification token is missing.');
      return;
    }
    apiFetch<{ verified: boolean; email: string }>(
      `/auth/verify-email?token=${encodeURIComponent(token)}`,
      { skipAuthRefresh: true },
    )
      .then((res) => {
        setStatus('success');
        setMessage(`Email ${res.email} has been verified!`);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="rounded-3xl border border-stone-200 bg-white p-8">
        {status === 'loading' ? (
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-gray-900" />
        ) : status === 'success' ? (
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        ) : (
          <XCircle className="mx-auto h-10 w-10 text-red-600" />
        )}
        <h1 className="mt-4 text-xl font-bold text-gray-900">Email Verification</h1>
        <p className="mt-2 text-sm text-stone-600">{message}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white"
        >
          Go to Storefront
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-20"><div className="h-60 animate-pulse rounded-3xl bg-stone-200" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

