import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  const img = readFileSync(join(process.cwd(), 'public/mango2.jpg'));
  const src = `data:image/jpeg;base64,${img.toString('base64')}`;

  return new ImageResponse(
    <div style={{ width: 512, height: 512, borderRadius: 112, overflow: 'hidden', display: 'flex' }}>
      <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 22%' }} />
    </div>,
    { width: 512, height: 512 },
  );
}
