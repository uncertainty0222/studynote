import { getAuthUser, clearSession, hashPassword, verifyPassword } from '@/lib/auth';
import { getUserByEmail, createSession, createUser, getUserCount } from '@/lib/db';
import { cookies } from 'next/headers';

// GET /api/auth — get current user
export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { password_hash: _, ...safe } = user;
  return Response.json(safe);
}

// POST /api/auth — login
export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return Response.json({ error: '이메일과 비밀번호를 입력해주세요' }, { status: 400 });
  }

  const user = getUserByEmail(email.trim().toLowerCase());
  if (!user) return Response.json({ error: '이메일 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return Response.json({ error: '이메일 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  const token = createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set('session', token, { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });

  const { password_hash: _, ...safe } = user;
  return Response.json(safe);
}

// DELETE /api/auth — logout
export async function DELETE() {
  await clearSession();
  const cookieStore = await cookies();
  cookieStore.delete('session');
  return Response.json({ success: true });
}

// PUT /api/auth — initial setup (create two users)
export async function PUT(request: Request) {
  if (getUserCount() > 0) {
    return Response.json({ error: '이미 설정이 완료되었습니다' }, { status: 400 });
  }

  const { husband, wife } = await request.json();

  if (!husband?.name || !husband?.email || !husband?.password) {
    return Response.json({ error: '남편 정보를 모두 입력해주세요' }, { status: 400 });
  }
  if (!wife?.name || !wife?.email || !wife?.password) {
    return Response.json({ error: '아내 정보를 모두 입력해주세요' }, { status: 400 });
  }
  if (husband.email.toLowerCase() === wife.email.toLowerCase()) {
    return Response.json({ error: '이메일이 서로 달라야 합니다' }, { status: 400 });
  }

  const husbandHash = await hashPassword(husband.password);
  const wifeHash = await hashPassword(wife.password);

  createUser({ role: 'husband', name: husband.name, email: husband.email.trim().toLowerCase(), password_hash: husbandHash });
  createUser({ role: 'wife', name: wife.name, email: wife.email.trim().toLowerCase(), password_hash: wifeHash });

  return Response.json({ success: true });
}
