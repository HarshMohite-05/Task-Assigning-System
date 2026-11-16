/**
 * Signed session cookie. The cookie carries the signed-in user, followed by an HMAC signature;
 * any cookie whose signature does not verify (edited, forged, or from before signing existed)
 * is treated as signed out.
 */
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'taskstream_user';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  role: 'DIRECTOR' | 'EMPLOYEE';
  email: string;
}

interface SessionPayload extends SessionUser {
  exp: number; // unix seconds
}

let cachedSecret: Buffer | null = null;

/**
 * SESSION_SECRET when set; otherwise a key derived from secrets the deployment already has
 * (server-only env vars), so signing works without any new configuration.
 */
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const explicit = process.env.SESSION_SECRET?.trim();
  const material =
    explicit ||
    [
      process.env.VAPID_PRIVATE_KEY,
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.DATABASE_URL,
      process.env.POSTGRES_PRISMA_URL,
      process.env.POSTGRES_URL,
      process.env.CRON_SECRET,
    ]
      .filter(Boolean)
      .join('|');
  if (!material) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('No secret available to sign sessions. Set SESSION_SECRET.');
    }
    cachedSecret = crypto.createHash('sha256').update('taskstream-local-dev-only').digest();
    return cachedSecret;
  }
  cachedSecret = crypto.createHash('sha256').update(`taskstream-session-v1|${material}`).digest();
  return cachedSecret;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    designation: user.designation,
    role: user.role === 'DIRECTOR' ? 'DIRECTOR' : 'EMPLOYEE',
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `v1.${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, body, sig] = parts;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload?.id || !payload.employeeCode || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const { exp: _exp, ...user } = payload;
    return user;
  } catch {
    return null;
  }
}

/** The signed-in user for this request, or null */
export function getSession(): SessionUser | null {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, user: SessionUser) {
  res.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Guard for API routes: returns the user, or a 401/403 response to send back */
export function requireSession(
  role?: 'DIRECTOR'
): { user: SessionUser; error?: undefined } | { user?: undefined; error: NextResponse } {
  const user = getSession();
  if (!user) {
    return { error: NextResponse.json({ error: 'Not signed in. Please log in again.' }, { status: 401 }) };
  }
  if (role === 'DIRECTOR' && user.role !== 'DIRECTOR') {
    return { error: NextResponse.json({ error: 'Only directors can do this.' }, { status: 403 }) };
  }
  return { user };
}

/** Whether the task is assigned to this user (matches by id or employee code, case-insensitive) */
export function isAssignedTo(
  task: { assignedToId?: string; assignedTo?: { id?: string; employeeCode?: string } },
  user: SessionUser
): boolean {
  const mine = [user.id, user.employeeCode].filter(Boolean).map((v) => v.toUpperCase());
  return [task.assignedToId, task.assignedTo?.id, task.assignedTo?.employeeCode]
    .filter(Boolean)
    .some((v) => mine.includes(String(v).toUpperCase()));
}
