import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sendSummaryTo } from '@/lib/summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Sends the signed-in user their summary push right now ("Send to my phone now") */
export async function POST() {
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    await sendSummaryTo({
      id: user.id || user.employeeCode,
      employeeCode: user.employeeCode || user.id,
      fullName: user.fullName || '',
      role: user.role === 'DIRECTOR' ? 'DIRECTOR' : 'EMPLOYEE',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Summary send error:', error);
    return NextResponse.json({ error: 'Failed to send summary' }, { status: 500 });
  }
}
