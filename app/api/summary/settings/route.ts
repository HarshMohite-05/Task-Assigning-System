import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSummarySettings, updateSummarySettings } from '@/lib/data-store';
import { zonedDateTime, SUMMARY_TIMEZONE } from '@/lib/summary-utils';

export const dynamic = 'force-dynamic';

function sessionUserId(): string | null {
  try {
    const user = JSON.parse(cookies().get('taskstream_user')?.value || 'null');
    return user?.id || user?.employeeCode || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const userId = sessionUserId();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const settings = await getSummarySettings(userId);
    if (!settings) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ settings, timeZone: SUMMARY_TIMEZONE });
  } catch (error) {
    console.error('Summary settings load error:', error);
    return NextResponse.json({ error: 'Failed to load summary settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const userId = sessionUserId();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const body = await req.json();
    const enabled = Boolean(body.enabled);
    const time = String(body.time || '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return NextResponse.json({ error: 'Time must be HH:MM' }, { status: 400 });
    }

    // If the chosen time has already passed today, start from tomorrow instead of firing right away
    const now = zonedDateTime(new Date());
    const settings = await updateSummarySettings(userId, {
      enabled,
      time,
      lastSummaryDate: time <= now.time ? now.date : null,
    });
    if (!settings) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ success: true, settings, timeZone: SUMMARY_TIMEZONE });
  } catch (error) {
    console.error('Summary settings save error:', error);
    return NextResponse.json({ error: 'Failed to save summary settings' }, { status: 500 });
  }
}
