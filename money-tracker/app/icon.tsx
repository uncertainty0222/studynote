import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 512,
        height: 512,
        background: 'linear-gradient(135deg, #d4f1c0 0%, #a8e090 50%, #6bbf3f 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 112,
        fontSize: 320,
        lineHeight: 1,
      }}
    >
      🥥
    </div>,
    { width: 512, height: 512 },
  );
}
