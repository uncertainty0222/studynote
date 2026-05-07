import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const img = readFileSync(join(process.cwd(), 'public/mango.jpg'));
  const src = `data:image/jpeg;base64,${img.toString('base64')}`;

  return new ImageResponse(
    <div style={{ width: 180, height: 180, borderRadius: 40, overflow: 'hidden', display: 'flex' }}>
      <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 22%' }} />
    </div>,
    { width: 180, height: 180 },
  );
}
