import crypto from 'crypto';
import { getConfigValue, setConfigValue, getUserByRole, type User } from './db';

const ROLES = ['husband', 'wife'] as const;
const key = (role: 'husband' | 'wife') => `voice_token_${role}`;

export async function getOrCreateVoiceToken(role: 'husband' | 'wife', rotate = false): Promise<string> {
  if (!rotate) {
    const existing = await getConfigValue(key(role));
    if (existing) return existing;
  }
  const token = crypto.randomBytes(24).toString('hex');
  await setConfigValue(key(role), token);
  return token;
}

// For the Siri Shortcut, which can't carry the login cookie.
export async function getUserByVoiceToken(token: string): Promise<User | null> {
  const given = Buffer.from(token);
  for (const role of ROLES) {
    const stored = await getConfigValue(key(role));
    if (!stored) continue;
    const expected = Buffer.from(stored);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      const user = await getUserByRole(role);
      return user && !user.disabled ? user : null;
    }
  }
  return null;
}
