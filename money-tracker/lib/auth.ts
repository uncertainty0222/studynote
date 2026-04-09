import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getSessionUser, deleteSession } from './db';
import type { User } from './db';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getAuthUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;
  return getSessionUser(token);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (token) deleteSession(token);
}
