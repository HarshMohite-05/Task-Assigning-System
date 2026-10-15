import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

// In-memory rate limiting for brute-force protection
interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

function isRateLimited(key: string, maxAttempts = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { attempts: 1, resetAt: now + windowMs });
    return false;
  }

  if (record.attempts >= maxAttempts) {
    return true;
  }

  record.attempts += 1;
  return false;
}

function clearRateLimit(key: string) {
  rateLimitMap.delete(key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '').trim();

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Employee ID / Email and password are required' },
        { status: 400 }
      );
    }

    // IP / Identifier based rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimitKey = `${ip}:${identifier.toLowerCase()}`;

    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Too many failed login attempts. Please wait 60 seconds before trying again.' },
        { status: 429 }
      );
    }

    const user = await authenticateUser(identifier, password);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid Employee ID/Email or Password. Please check your credentials.' },
        { status: 401 }
      );
    }

    // Clear rate limit counter on successful login
    clearRateLimit(rateLimitKey);

    const sessionUser = {
      id: user.id,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      designation: user.designation,
      role: user.role,
      email: user.email,
    };

    const redirectUrl = user.role === 'DIRECTOR' ? '/director' : '/employee';

    const response = NextResponse.json({
      success: true,
      user: sessionUser,
      redirectUrl,
    });

    // Secure HTTP-Only session cookie prevents XSS session hijacking
    response.cookies.set('taskstream_user', JSON.stringify(sessionUser), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Authentication error:', error);
    return NextResponse.json({ error: 'Internal server error during login' }, { status: 500 });
  }
}
