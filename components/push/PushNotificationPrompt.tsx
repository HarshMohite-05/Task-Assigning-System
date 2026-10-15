'use client';

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCircle2 } from 'lucide-react';

interface PushPromptProps {
  userId: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationPrompt({ userId }: PushPromptProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
      if (Notification.permission === 'granted') {
        setIsSubscribed(true);
      }
    }
  }, []);

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported on this browser or platform. On iOS, please add this app to your Home Screen first.');
      return;
    }

    try {
      setLoading(true);
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        alert('Notification permission was denied. Please allow notifications in your browser settings.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey || vapidPublicKey.includes('replace_with') || vapidPublicKey.includes('...')) {
        console.error('Missing or invalid NEXT_PUBLIC_VAPID_PUBLIC_KEY');
        alert('Push notification service is not configured with valid production VAPID keys.');
        return;
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as unknown as BufferSource,
        });
      }

      // Save device subscription to backend API
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        throw new Error('Server rejected push subscription');
      }

      setIsSubscribed(true);
    } catch (err: any) {
      console.error('Push subscription error:', err);
      alert(`Could not enable phone alerts: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (permission === 'granted' && isSubscribed) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Mobile Alerts Active</span>
      </div>
    );
  }

  return (
    <button
      onClick={subscribeToPush}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-full transition"
    >
      <Bell className="w-3.5 h-3.5 animate-pulse" />
      <span>{loading ? 'Activating...' : 'Enable Phone Alerts'}</span>
    </button>
  );
}
