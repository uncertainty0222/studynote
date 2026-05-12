import { getLatestStyleProfile, getTaPatterns, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await initDb();
  const profile = await getLatestStyleProfile();
  const patterns = await getTaPatterns(20);
  return Response.json({ profile, recentPatterns: patterns });
}

export async function POST() {
  await initDb();
  try {
    const { buildStyleProfile } = await import('@/lib/trading/style-builder');
    const result = await buildStyleProfile();
    return Response.json({ success: true, profile: result });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
