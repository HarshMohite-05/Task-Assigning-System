import React from 'react';
import DirectorDashboard from '@/components/dashboard/DirectorDashboard';
import SignOutButton from '@/components/auth/SignOutButton';
import PushNotificationPrompt from '@/components/push/PushNotificationPrompt';
import { getEmployees, getTasks } from '@/lib/data-store';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DirectorPage() {
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
  if (user.role !== 'DIRECTOR') {
    redirect('/employee');
  }

  const [tasks, employees] = await Promise.all([
    getTasks(),
    getEmployees(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Nirmaan Water Tech
              </div>
              <h1 className="text-lg font-bold text-slate-800">Director Control Center</h1>
            </div>
          </div>

          {/* User Profile & Sign Out Button */}
          <div className="flex items-center gap-3 sm:gap-4">
            <PushNotificationPrompt userId={user.id || user.employeeCode} />
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800">{user.fullName}</div>
              <div className="text-[10px] text-blue-600 font-medium">Director ({user.employeeCode})</div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-6">
        <DirectorDashboard
          directorId={user.id || user.employeeCode}
          initialTasks={tasks.map((t) => ({
            ...t,
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          }))}
          employees={employees.map(({ password: _pw, ...e }) => e)}
        />
      </main>
    </div>
  );
}
