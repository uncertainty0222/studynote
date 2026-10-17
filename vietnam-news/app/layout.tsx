import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "베트남 뉴스 TOP 10",
  description: "기간별 베트남 핵심 뉴스 TOP 10과 나트랑·달랏 지역 뉴스",
};

export const viewport: Viewport = {
  themeColor: "#b91c1c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-stone-50 text-gray-900">{children}</body>
    </html>
  );
}
