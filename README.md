# ⚡ Nirmaan TaskStream Enterprise — Internal Task Delegation & Mobile Push System

A modern, high-performance, and mobile-responsive internal workforce management application built with **Next.js 14 (App Router)**, **Prisma ORM**, **Tailwind CSS**, and **W3C Web Push**. Optimized for direct deployment on **Vercel** with serverless edge architecture.

---

## 🏛️ System Architecture & Strict Two-Tier Boundaries

```
                 +-------------------------------------------------------+
                 |            DIRECTORS (Executive Admins)               |
                 +-------------------------------------------------------+
                 | - Executive Analytics & Workload Charts (Recharts)    |
                 | - Bottleneck & Overdue Diagnostic Panel               |
                 | - Frictionless Task Delegation with Optimistic UI     |
                 | - Auto-triggers Native Mobile Push to Employee Phone  |
                 +---------------------------+---------------------------+
                                             |
                   Direct Delegation & Tasks | One-Tap Progress Updates
                   (Instant Web Push Alert)  | (To-Do, In Progress, Blocked, Done)
                                             v
                 +-------------------------------------------------------+
                 |                   EMPLOYEES                           |
                 +-------------------------------------------------------+
                 | - Direct reporting line to Directors                  |
                 | - Personalized mobile task stream                     |
                 | - Native Phone Notifications (PWA Service Worker)     |
                 | - One-Tap Lifecycle Buttons                           |
                 +-------------------------------------------------------+
```

---

## 📂 Project Structure

```text
Internal  Task Assigning System/
├── app/
│   ├── (dashboard)/
│   │   ├── director/page.tsx      # Director Control Center & Analytics
│   │   └── employee/page.tsx      # Focused Mobile Employee Task Stream
│   ├── api/
│   │   ├── employees/route.ts     # Employee lookups & workload queries
│   │   ├── push/subscribe/route.ts# Device token registration endpoint
│   │   └── tasks/
│   │       ├── route.ts           # POST (Delegate & Push) / GET
│   │       └── [taskId]/route.ts  # PATCH (Lifecycle Status Update)
│   ├── globals.css                # Tailwind base styles
│   ├── layout.tsx                 # Root layout with PWA Service Worker hook
│   └── page.tsx                   # Unified Role Navigation Portal
│
├── components/
│   ├── dashboard/
│   │   ├── DirectorDashboard.tsx  # Executive Recharts Analytics & Delegation
│   │   └── EmployeeView.tsx       # Clean employee mobile card feed
│   └── push/
│       └── PushNotificationPrompt.tsx # Client-side Push Activation Widget
│
├── lib/
│   ├── prisma.ts                  # Prisma Client singleton with connection pooling
│   └── push-service.ts            # VAPID-authenticated Web Push dispatch engine
│
├── prisma/
│   ├── schema.prisma              # Relational models (User, Task, PushSubscription)
│   ├── seed.ts                    # Ingests Employee Data.xlsx and seeds accounts
│   └── Employee Data.xlsx         # Verified Employee Dataset
│
├── public/
│   ├── manifest.json              # Web App Manifest for mobile PWA install
│   └── sw.js                      # Native Push Service Worker
│
├── package.json
├── tailwind.config.ts
└── next.config.mjs
```

---

## 🚀 Running the Application Locally

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npx prisma generate

# 3. Start the Next.js Development Server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view:
- **Director Dashboard**: [http://localhost:3000/director](http://localhost:3000/director)
- **Employee View**: [http://localhost:3000/employee](http://localhost:3000/employee)

---

## ☁️ Vercel Deployment

1. Connect this repository to your Vercel project.
2. Link **Vercel Postgres** or **Supabase** under Storage.
3. Generate VAPID push keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
4. Set environment variables:
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
5. Deploy! Vercel runs `prisma generate && next build` automatically.
