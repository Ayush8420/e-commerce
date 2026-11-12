'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, User } from 'lucide-react';
import { useStore } from '@/components/providers/StoreProvider';
import { getGoogleLoginUrl } from '@/lib/api';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/';

  const { register, notify } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(name, email, password);
      router.push(nextPath);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
        <p className="mt-1 text-sm text-stone-500">
          We&apos;ll send a verification email via our Kafka notification worker.
        </p>

        <a
          href={getGoogleLoginUrl()}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-semibold text-gray-900 hover:bg-stone-50"
        >
          Continue with Google
        </a>

        <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
          <div className="h-px flex-1 bg-stone-200" />
          <span>or register with email</span>
          <div className="h-px flex-1 bg-stone-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-700">Full Name</label>
            <div className="relative mt-1">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Priya Nair"
                className="w-full rounded-xl border border-stone-300 py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700">Email</label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="priya@example.com"
                className="w-full rounded-xl border border-stone-300 py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700">
              Password (min 8 characters)
            </label>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                required
                minLength={8}
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
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-600">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-indigo-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-14"><div className="h-96 animate-pulse rounded-3xl bg-stone-200" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}

