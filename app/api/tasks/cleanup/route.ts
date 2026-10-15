import { NextRequest, NextResponse } from 'next/server';
import { autoPurgeExpiredTasks } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

/**
 * Self-automated cleanup endpoint: Permanently deletes all tasks older than 90 days (3 months).
 * Can be called manually by directors or automatically via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  try {
    const purgedCount = await autoPurgeExpiredTasks();
    return NextResponse.json({
      success: true,
      purgedTasks: purgedCount,
      message: `Task lifecycle retention executed. Cleaned up tasks older than 90 days.`,
      executedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Lifecycle task cleanup error:', error);
    return NextResponse.json({ error: 'Cleanup execution failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const purgedCount = await autoPurgeExpiredTasks();
    return NextResponse.json({
      success: true,
      purgedTasks: purgedCount,
      message: `Task lifecycle retention executed. Cleaned up tasks older than 90 days.`,
      executedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Lifecycle task cleanup error:', error);
    return NextResponse.json({ error: 'Cleanup execution failed' }, { status: 500 });
  }
}
