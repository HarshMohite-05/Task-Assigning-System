import { NextRequest, NextResponse } from 'next/server';
import { getEmployees } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');

    let employees = await getEmployees();
    if (role === 'EMPLOYEE') {
      employees = employees.filter((e) => e.role === 'EMPLOYEE');
    } else if (role === 'DIRECTOR') {
      employees = employees.filter((e) => e.role === 'DIRECTOR');
    }

    return NextResponse.json({ employees });
  } catch (error: any) {
    console.error('Employees retrieval error:', error);
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}
