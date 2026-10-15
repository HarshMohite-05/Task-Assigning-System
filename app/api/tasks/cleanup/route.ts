import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Task retention cleanup endpoint:
 * Purge policy is CANCELLED per admin instruction. Tasks are retained permanently.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    purgedTasks: 0,
    message: 'Task retention purge is cancelled. All tasks are retained permanently.',
  });
}

export async function POST() {
  return NextResponse.json({
    success: true,
    purgedTasks: 0,
    message: 'Task retention purge is cancelled. All tasks are retained permanently.',
  });
}
