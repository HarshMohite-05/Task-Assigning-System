import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sendSummaryTo } from '@/lib/summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Sends the signed-in user their summary push right now ("Send to my phone now") */
export async function POST() {
  let user: any = null;
  try {
    user = JSON.parse(cookies().get('taskstream_user')?.value || 'null');
  } catch {}
  if (!user?.id && !user?.employeeCode) {
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
