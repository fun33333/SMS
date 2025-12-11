import { NextRequest, NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_token, new_password, confirm_password } = body;

    if (!session_token) {
      return NextResponse.json({ error: 'Session token is required' }, { status: 400 });
    }

    if (!new_password) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }

    if (!confirm_password) {
      return NextResponse.json({ error: 'Confirm password is required' }, { status: 400 });
    }

    const base = getApiBaseUrl();
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const response = await fetch(`${cleanBase}/api/reset-password-with-otp/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        session_token, 
        new_password, 
        confirm_password 
      }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Reset password with OTP error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

