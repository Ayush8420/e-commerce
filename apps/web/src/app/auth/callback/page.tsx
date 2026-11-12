'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/providers/StoreProvider';

export default function GoogleAuthCallbackPage() {
  const router = useRouter();
  const { completeOAuthSession, notify } = useStore();

  useEffect(() => {
    completeOAuthSession().then((user) => {
      if (user) {
        notify(`Welcome, ${user.name}!`, 'success');
        router.replace('/');
      } else {
        notify('Google sign-in could not be completed.', 'error');
        router.replace('/login');
      }
    });
  }, [completeOAuthSession, notify, router]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-stone-300 border-t-gray-900" />
      <p className="mt-4 text-sm font-medium text-stone-600">Completing Google Sign-In...</p>
    </div>
  );
}

