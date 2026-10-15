import webpush from 'web-push';
import { prisma } from './prisma';

function ensureVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@nirmaanwatertech.com';

  if (publicKey && privateKey && !publicKey.includes('replace_with') && !privateKey.includes('replace_with')) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  }
  return false;
}

// Initial initialization attempt
ensureVapidConfig();

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  taskId?: string;
}

/**
 * Asynchronously dispatches native W3C Web Push notifications to all mobile endpoints
 * registered to the given user ID without blocking serverless HTTP response cycles.
 */
export async function sendNativePushNotification(userId: string, payload: PushPayload) {
  try {
    const hasDatabase = Boolean(process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL);
    if (!hasDatabase) {
      console.log(`[Push Notification (Dev Mode)] Simulated native push alert to user ${userId}:`, payload.title, payload.body);
      return;
    }

    const vapidReady = ensureVapidConfig();
    if (!vapidReady) {
      console.warn('[Push Notification] Skipping dispatch: VAPID keys not configured in environment variables.');
      return;
    }

    // Support matching both by internal User.id (cuid) and employeeCode (e.g., EMP001)
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        OR: [
          { userId },
          { user: { employeeCode: userId } },
        ],
      },
    });


    if (!subscriptions || subscriptions.length === 0) {
      console.log(`[Push Notification] No active device tokens found for user: ${userId}`);
      return;
    }

    const payloadString = JSON.stringify(payload);

    const sendPromises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushConfig, payloadString);
      } catch (err: any) {
        // Expired or unregistered device endpoint
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.warn(`[Push Notification] Purging stale subscription: ${sub.id}`);
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
        } else {
          console.error(`[Push Notification] Failed dispatch to ${sub.endpoint}:`, err);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (err) {
    console.error('[Push Notification] Error in notification dispatch pipeline:', err);
  }
}

/**
 * Dispatches notifications to the task creator and all active directors
 * when an employee completes or blocks a delegated task.
 */
export async function notifyDirectors(payload: PushPayload, specificDirectorId?: string) {
  try {
    const hasDatabase = Boolean(process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL);
    if (!hasDatabase) {
      console.log(`[Push Notification (Dev Mode)] Simulated native push alert to Directors:`, payload.title, payload.body);
      return;
    }

    const vapidReady = ensureVapidConfig();
    if (!vapidReady) return;

    // Target the specific delegating director or all active directors
    const orConditions: any[] = [
      { user: { role: 'DIRECTOR', isActive: true } },
    ];
    if (specificDirectorId) {
      orConditions.push({ userId: specificDirectorId });
      orConditions.push({ user: { employeeCode: specificDirectorId } });
    }

    const directorSubscriptions = await prisma.pushSubscription.findMany({
      where: {
        OR: orConditions,
      },
    });

    if (!directorSubscriptions || directorSubscriptions.length === 0) {
      console.log('[Push Notification] No active device subscriptions found for Directors.');
      return;
    }

    const payloadString = JSON.stringify(payload);

    const sendPromises = directorSubscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushConfig, payloadString);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
        } else {
          console.error(`[Push Notification] Failed dispatch to director subscription:`, err);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (err) {
    console.error('[Push Notification] Error in director dispatch pipeline:', err);
  }
}
