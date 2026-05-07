import { ImageResponse } from 'next/og';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: 'linear-gradient(135deg, #d4f1c0 0%, #a8e090 50%, #6bbf3f 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 40,
          fontSize: 112,
          lineHeight: 1,
        }}
      >
        🥥
      </div>
    ),
    { width: 180, height: 180, fonts: [] }
  );
}
