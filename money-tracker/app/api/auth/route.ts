import { getAuthUser, clearSession, verifyPassword } from '@/lib/auth';
import { getUserByUsername, createSession } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { password_hash: _, ...safe } = user;
  return Response.json(safe);
}

export async function POST(request: Request) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return Response.json({ error: '아이디와 비밀번호를 입력해주세요' }, { status: 400 });
  }

  const user = await getUserByUsername(username.trim().toUpperCase());
  if (!user) return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  const token = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set('session', token, { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });

  const { password_hash: _, ...safe } = user;
  return Response.json(safe);
}

export async function DELETE() {
  await clearSession();
  const cookieStore = await cookies();
  cookieStore.delete('session');
  return Response.json({ success: true });
}
