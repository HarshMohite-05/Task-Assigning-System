import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmployees, createEmployee, deleteEmployee } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

const createEmployeeSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  employeeCode: z.string().min(2, 'Employee code must be at least 2 characters'),
  email: z.string().email('Valid email address required'),
  designation: z.string().min(2, 'Designation is required'),
  role: z.enum(['EMPLOYEE', 'DIRECTOR']).default('EMPLOYEE'),
  password: z.string().min(4, 'Password must be at least 4 characters').optional(),
  phoneNumber: z.string().optional(),
});

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = createEmployeeSchema.parse(body);

    const newEmployee = await createEmployee({
      fullName: validated.fullName,
      employeeCode: validated.employeeCode,
      email: validated.email,
      designation: validated.designation,
      role: validated.role,
      password: validated.password,
      phoneNumber: validated.phoneNumber,
    });

    return NextResponse.json({ success: true, employee: newEmployee }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || 'Invalid data' }, { status: 400 });
    }
    console.error('Employee creation error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create employee' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id || body?.employeeCode;
      } catch {
        // query param fallback
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const allEmployees = await getEmployees();
    const target = allEmployees.find((e) => e.id === id || e.employeeCode === id);

    if (target?.role === 'DIRECTOR') {
      const remainingDirectors = allEmployees.filter((e) => e.role === 'DIRECTOR');
      if (remainingDirectors.length <= 1) {
        return NextResponse.json({ error: 'Cannot delete the only remaining Director account.' }, { status: 400 });
      }
    }

    await deleteEmployee(id);
    return NextResponse.json({ success: true, message: `Employee removed successfully.` });
  } catch (error: any) {
    console.error('Employee deletion error:', error);
    return NextResponse.json({ error: error.message || 'Failed to remove employee' }, { status: 500 });
  }
}
