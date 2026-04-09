import { ImageResponse } from 'next/og';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.92)', borderRadius: '50%' }} />
        <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.92)', borderRadius: '50%' }} />
      </div>
    ),
    { width: 192, height: 192, fonts: [] }
  );
}
