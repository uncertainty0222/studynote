import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const img = readFileSync(join(process.cwd(), 'public/mango.jpg'));
  const src = `data:image/jpeg;base64,${img.toString('base64')}`;

  return new ImageResponse(
    <div style={{ width: 192, height: 192, borderRadius: 42, overflow: 'hidden', display: 'flex' }}>
      <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 22%' }} />
    </div>,
    { width: 192, height: 192, fonts: [] },
  );
}
