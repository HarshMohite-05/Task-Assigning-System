import { NextRequest, NextResponse } from 'next/server';
import { runDueReminders } from '@/lib/reminders';
import { runDueSummaries } from '@/lib/summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Recurring reminder + daily summary runner. Point a scheduler at this every 5–15 minutes
 * (Vercel Cron on Pro, or a free service such as cron-job.org).
 * When CRON_SECRET is set, callers must send `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron does this automatically) or `?secret=<CRON_SECRET>`.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const query = new URL(req.url).searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && query !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const [reminders, summaries] = await Promise.all([runDueReminders(), runDueSummaries()]);
    return NextResponse.json({ success: true, reminders, summaries });
  } catch (error: any) {
    console.error('Reminder runner error:', error);
    return NextResponse.json({ error: 'Failed to run reminders' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
