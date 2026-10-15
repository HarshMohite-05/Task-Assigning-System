import React from 'react';
import EmployeeView from '@/components/dashboard/EmployeeView';
import SignOutButton from '@/components/auth/SignOutButton';
import { getEmployees, getTasks } from '@/lib/data-store';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Wrench } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function EmployeePage() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('taskstream_user');

  let user = null;
  if (sessionCookie?.value) {
    try {
      user = JSON.parse(sessionCookie.value);
    } catch (e) {
      user = null;
    }
  }

  // Strict Authentication Guard
  if (!user) {
    redirect('/');
  }

  const [allEmployees, allTasks] = await Promise.all([
    getEmployees(),
    getTasks(),
  ]);

  const currentEmp =
    allEmployees.find((e) => e.employeeCode === user.employeeCode) || user;

  // Filter tasks belonging to this specific employee
  const tasks = allTasks.filter(
    (t) =>
      t.assignedToId === currentEmp.id ||
      t.assignedToId === currentEmp.employeeCode ||
      t.assignedTo?.employeeCode === currentEmp.employeeCode
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3.5 mb-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Nirmaan TaskStream Mobile
              </div>
              <h1 className="text-lg font-bold text-slate-800">My Work Assignments</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800">{user.fullName}</div>
              <div className="text-[10px] text-emerald-600 font-medium">{user.employeeCode} • {user.designation}</div>
            </div>

            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="px-4">
        <EmployeeView
          employeeId={currentEmp.id || currentEmp.employeeCode}
          employeeName={currentEmp.fullName}
          designation={currentEmp.designation || 'Staff'}
          initialTasks={tasks.map((t) => ({
            ...t,
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          }))}
        />
      </main>
    </div>
  );
}
