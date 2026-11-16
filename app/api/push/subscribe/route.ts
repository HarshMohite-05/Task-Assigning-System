import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { subscription, userAgent } = body;
    // Notifications always go to the signed-in user, whatever userId the page sends
    const userId = session.id || session.employeeCode;

    if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }

    let targetUserId = userId;

    if (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: userId },
            { employeeCode: { equals: userId, mode: 'insensitive' } },
            { email: { equals: userId, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      if (user) {
        targetUserId = user.id;
      }

      const saved = await prisma.pushSubscription.upsert({
        where: { endpoint: subscription.endpoint },
        update: {
          userId: targetUserId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: userAgent || null,
        },
        create: {
          userId: targetUserId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: userAgent || null,
        },
      });

      return NextResponse.json({ success: true, subscriptionId: saved.id });
    }

    return NextResponse.json({ success: true, localMode: true });
  } catch (error: any) {
    console.error('Push subscription save error:', error);
    return NextResponse.json({ error: 'Failed to save push subscription' }, { status: 500 });
  }
}
