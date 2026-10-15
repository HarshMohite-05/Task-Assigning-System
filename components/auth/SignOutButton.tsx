'use client';

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);

      // 1. Delete on server API
      await fetch('/api/auth/logout', {
        method: 'POST',
      });

      // 2. Clear client-side cookie directly
      document.cookie = 'taskstream_user=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

      // 3. Clear localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('taskstream_user');
      }

      // 4. Force full document redirect to login page
      window.location.href = '/';
    } catch (err) {
      console.error('Sign out error:', err);
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs font-medium transition active:scale-95 disabled:opacity-50"
      title="Sign Out of TaskStream"
    >
      <LogOut className="w-3.5 h-3.5" />
      <span>{loading ? 'Signing Out...' : 'Sign Out'}</span>
    </button>
  );
}
