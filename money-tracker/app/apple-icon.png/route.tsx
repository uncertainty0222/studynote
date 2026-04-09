import { ImageResponse } from 'next/og';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        {/* Two circles representing a couple */}
        <div style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.92)', borderRadius: '50%' }} />
        <div style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.92)', borderRadius: '50%' }} />
      </div>
    ),
    { width: 180, height: 180, fonts: [] }
  );
}
